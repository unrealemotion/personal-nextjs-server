import { RequestTemplate } from "./schema";
import { stripJsonComments } from "./utils";

export function getRawBodyString(bodyObj: any): string {
    if (!bodyObj) return "";
    if (typeof bodyObj === "string") return bodyObj;
    if (bodyObj.mode === "raw") return bodyObj.raw || "";
    if (bodyObj.mode === "graphql" && bodyObj.graphql) {
        let variables = {};
        try {
            variables = JSON.parse(bodyObj.graphql.variables || "{}");
        } catch (e) {}
        return JSON.stringify({ query: bodyObj.graphql.query || "", variables }, null, 2);
    }
    if (bodyObj.mode === "urlencoded" && bodyObj.urlencoded) {
        return bodyObj.urlencoded
            .filter((p: any) => p.enabled !== false && p.key)
            .map((p: any) => `${p.key}=${p.value}`)
            .join("&");
    }
    if (bodyObj.mode === "formdata" && bodyObj.formdata) {
        return bodyObj.formdata
            .filter((p: any) => p.enabled !== false && p.key)
            .map((p: any) => `${p.key}: ${p.value}`)
            .join("\n");
    }
    if (bodyObj.mode === "binary") return bodyObj.binary || "";
    return "";
}

export function parseCurl(curlCommand: string): Partial<RequestTemplate> | null {
    try {
        const template: Partial<RequestTemplate> = {
            method: "GET",
            url: "",
            headers: [],
            params: [],
            body: {
                mode: "none",
                raw: "",
                formdata: [],
                urlencoded: []
            },
        };

        // Normalize command by stripping trailing slashes used for newlines
        const normalizedCmd = curlCommand.replace(/\\\n/g, ' ').replace(/\\\r\n/g, ' ');

        // 1. Extract URL (look for http:// or https://)
        const urlMatch = normalizedCmd.match(/['"]?(https?:\/\/[^\s'"]+)['"]?/);
        if (urlMatch && urlMatch[1]) {
            template.url = urlMatch[1];
            try {
                const parsedUrl = new URL(template.url);
                const parsedParams = Array.from(parsedUrl.searchParams.entries()).map(([key, value]) => ({ key, value }));
                if (parsedParams.length > 0) {
                    template.params = parsedParams;
                    parsedUrl.search = '';
                    template.url = parsedUrl.toString();
                }
            } catch { }
        } else {
            return null; // Invalid if no URL found
        }

        // 2. Extract Method
        const methodMatch = normalizedCmd.match(/(-X|--request)\s+([A-Z]+)/);
        if (methodMatch && methodMatch[2]) {
            template.method = methodMatch[2] as any;
        }

        // 3. Extract Headers
        const headerRegex = /(?:-H|--header)\s+(['"])(.*?)\1|(?:-H|--header)\s+([^\s'"]+)/g;
        let hMatch;
        while ((hMatch = headerRegex.exec(normalizedCmd)) !== null) {
            const headerStr = hMatch[2] || hMatch[3];
            if (headerStr) {
                const colonIdx = headerStr.indexOf(':');
                if (colonIdx > 0) {
                    const key = headerStr.substring(0, colonIdx).trim();
                    const value = headerStr.substring(colonIdx + 1).trim();
                    template.headers?.push({ key, value });
                }
            }
        }

        // 4. Extract Body
        const dataFlagRegex = /(?:--data|-d|--data-raw|--data-binary)\s+((['"])([\s\S]*?)\2)/;
        const dataMatch = normalizedCmd.match(dataFlagRegex);

        if (dataMatch && dataMatch[3] !== undefined) {
            let bodyStr = dataMatch[3];
            bodyStr = bodyStr.replace(/\\'/g, "'").replace(/\\"/g, '"');

            let formattedBody = bodyStr;
            try {
                formattedBody = JSON.stringify(JSON.parse(bodyStr), null, 2);
            } catch {}

            template.body = {
                mode: "raw",
                raw: formattedBody,
                rawLanguage: "json"
            };
            if (template.method === "GET") {
                template.method = "POST";
            }
        }

        return template;
    } catch (error) {
        console.error("Failed to parse cURL:", error);
        return null;
    }
}

export function generateCurl(template: RequestTemplate): string {
    let urlStr = template.url;
    if (template.params && template.params.length > 0) {
        try {
            const urlObj = new URL(urlStr);
            template.params.forEach(p => {
                if (p.key) {
                    urlObj.searchParams.append(p.key, p.value);
                }
            });
            urlStr = urlObj.toString();
        } catch {
            const queryString = template.params
                .filter(p => p.key)
                .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
                .join("&");
            if (queryString) {
                urlStr += (urlStr.includes('?') ? '&' : '?') + queryString;
            }
        }
    }

    let command = `curl --request ${template.method} \\\n  --url '${urlStr}'`;

    template.headers.forEach((h) => {
        if (h.key && h.value) {
            command += ` \\\n  --header '${h.key}: ${h.value}'`;
        }
    });

    const bodyString = getRawBodyString(template.body);
    if (bodyString && ["POST", "PUT", "PATCH", "QUERY"].includes(template.method)) {
        const bodyContent = stripJsonComments(bodyString);
        const escapedBody = bodyContent.replace(/'/g, "'\\''");
        command += ` \\\n  --data '${escapedBody}'`;
    }

    return command;
}

export function generateFetch(template: RequestTemplate): string {
    let urlStr = template.url;
    if (template.params && template.params.length > 0) {
        try {
            const urlObj = new URL(urlStr);
            template.params.forEach(p => {
                if (p.key) urlObj.searchParams.append(p.key, p.value);
            });
            urlStr = urlObj.toString();
        } catch {
            const queryString = template.params.filter(p => p.key).map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
            if (queryString) urlStr += (urlStr.includes('?') ? '&' : '?') + queryString;
        }
    }

    let code = `fetch("${urlStr}", {\n  method: "${template.method}",\n`;
    
    const validHeaders = template.headers.filter(h => h.key && h.value);
    if (validHeaders.length > 0) {
        code += `  headers: {\n`;
        validHeaders.forEach(h => {
            code += `    "${h.key}": "${h.value.replace(/"/g, '\\"')}",\n`;
        });
        code += `  },\n`;
    }

    const bodyString = getRawBodyString(template.body);
    if (bodyString && ["POST", "PUT", "PATCH", "QUERY"].includes(template.method)) {
        let bodyContent = stripJsonComments(bodyString).trim();
        const jsBody = bodyContent.replace(/\{\{(.+?)\}\}/g, (_, g) => `\${${g.trim()}}`);
        code += `  body: \`${jsBody.replace(/`/g, '\\`').replace(/\n/g, '\n  ')}\`,\n`;
    }

    code += `})\n.then(response => response.text())\n.then(result => console.log(result))\n.catch(error => console.error('error', error));`;
    return code;
}

export function generateAxios(template: RequestTemplate): string {
    let urlStr = template.url;
    let code = `import axios from 'axios';\n\n`;
    code += `let config = {\n`;
    code += `  method: '${template.method.toLowerCase()}',\n`;
    code += `  maxBodyLength: Infinity,\n`;
    code += `  url: '${urlStr}',\n`;

    const validParams = template.params ? template.params.filter(p => p.key) : [];
    if (validParams.length > 0) {
        code += `  params: {\n`;
        validParams.forEach(p => {
            code += `    '${p.key}': '${p.value.replace(/'/g, "\\'")}',\n`;
        });
        code += `  },\n`;
    }

    const validHeaders = template.headers.filter(h => h.key && h.value);
    if (validHeaders.length > 0) {
        code += `  headers: {\n`;
        validHeaders.forEach(h => {
            code += `    '${h.key}': '${h.value.replace(/'/g, "\\'")}',\n`;
        });
        code += `  },\n`;
    }

    const bodyString = getRawBodyString(template.body);
    if (bodyString && ["POST", "PUT", "PATCH", "QUERY"].includes(template.method)) {
        let bodyContent = stripJsonComments(bodyString).trim();
        const jsBody = bodyContent.replace(/\{\{(.+?)\}\}/g, (_, g) => `\${${g.trim()}}`);
        code += `  data: \`${jsBody.replace(/`/g, '\\`').replace(/\n/g, '\n  ')}\`,\n`;
    }

    code += `};\n\n`;
    code += `axios.request(config)\n.then((response) => {\n  console.log(JSON.stringify(response.data));\n})\n.catch((error) => {\n  console.error(error);\n});`;
    return code;
}

export function generatePython(template: RequestTemplate): string {
    let urlStr = template.url;
    if (template.params && template.params.length > 0) {
        try {
            const urlObj = new URL(urlStr);
            template.params.forEach(p => {
                if (p.key) urlObj.searchParams.append(p.key, p.value);
            });
            urlStr = urlObj.toString();
        } catch {
            const queryString = template.params.filter(p => p.key).map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
            if (queryString) urlStr += (urlStr.includes('?') ? '&' : '?') + queryString;
        }
    }

    let code = `import requests\n\nurl = "${urlStr}"\n`;

    let payloadStr = "None";
    const bodyString = getRawBodyString(template.body);
    if (bodyString && ["POST", "PUT", "PATCH", "QUERY"].includes(template.method)) {
        let bodyContent = stripJsonComments(bodyString).trim();
        code += `\npayload = """${bodyContent}"""\n`;
        payloadStr = "payload";
    }

    const validHeaders = template.headers.filter(h => h.key && h.value);
    if (validHeaders.length > 0) {
        code += `\nheaders = {\n`;
        validHeaders.forEach(h => {
             code += `  '${h.key}': '${h.value.replace(/'/g, "\\'")}',\n`;
        });
        code += `}\n`;
    }

    code += `\nresponse = requests.request("${template.method}", url`;
    if (validHeaders.length > 0) code += `, headers=headers`;
    if (payloadStr !== "None") code += `, data=payload`;
    code += `)\n\nprint(response.text)`;
    
    return code;
}
