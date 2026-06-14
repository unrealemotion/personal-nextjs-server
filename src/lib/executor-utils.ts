export function normalizeKey(key: string): string {
    let k = key.trim();
    if (k.startsWith("{{") && k.endsWith("}}")) {
        k = k.slice(2, -2).trim();
    }
    return k;
}

export function interpolate(str: string, data: Record<string, any>): string {
    if (!str) return str;
    return str.replace(/\{\{(.+?)\}\}/g, (_, key) => {
        const targetNorm = normalizeKey(key);
        const matchedKey = Object.keys(data).find(k => normalizeKey(k) === targetNorm);
        if (matchedKey !== undefined) {
            const value = data[matchedKey];
            return value !== undefined ? String(value) : "";
        }
        return "";
    });
}

export function stripJsonComments(str: string): string {
    if (!str) return str;
    return str.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
}

export function processBodyInterpolation(bodyString: string, data: Record<string, any>) {
    if (!bodyString || typeof bodyString !== 'string') return null;
    const strippedString = stripJsonComments(bodyString);
    const interpolatedString = interpolate(strippedString, data);
    try {
        return JSON.parse(interpolatedString);
    } catch {
        return interpolatedString.trim();
    }
}

export function isStatusInRanges(status: number, rangesStr: string): boolean {
    if (!rangesStr || !rangesStr.trim()) return false;
    const parts = rangesStr.split(",");
    for (let part of parts) {
        part = part.trim();
        if (!part) continue;
        if (part.includes("-")) {
            const [startStr, endStr] = part.split("-");
            const start = parseInt(startStr.trim());
            const end = parseInt(endStr.trim());
            if (!isNaN(start) && !isNaN(end) && status >= start && status <= end) {
                return true;
            }
        } else {
            const val = parseInt(part);
            if (!isNaN(val) && status === val) {
                return true;
            }
        }
    }
    return false;
}

export function flattenObject(obj: any, prefix: string, res: Record<string, any> = {}): Record<string, any> {
    if (obj === null || obj === undefined) {
        res[prefix] = "";
        return res;
    }
    if (typeof obj !== "object") {
        res[prefix] = obj;
        return res;
    }

    res[prefix] = JSON.stringify(obj);

    if (Array.isArray(obj)) {
        obj.forEach((val, i) => {
            flattenObject(val, `${prefix}.${i}`, res);
        });
    } else {
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            flattenObject(obj[key], `${prefix}.${key}`, res);
        }
    }
    return res;
}
