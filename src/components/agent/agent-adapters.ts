import { getAgentSystemPrompt } from "./agent-prompts";
import { getAgentTools, getAllAgentTools } from "./tools";
import { type Message } from "@/lib/schema";
import { store } from "@/lib/store";
import { sendToExtension } from "@/lib/extension";

export interface AgentConfig {
    provider: "gemini" | "openai" | "custom";
    apiKey: string;
    endpoint: string;
    model: string;
    enableJsonFallback?: boolean;
    bypassCorsWithExtension?: boolean;
}

export function mapOpenAiSchemaToGemini(schema: any): any {
    if (!schema) return undefined;

    const geminiSchema: any = {};

    if (schema.type) {
        geminiSchema.type = schema.type.toUpperCase();
    }
    if (schema.description !== undefined) {
        geminiSchema.description = schema.description;
    }
    if (schema.enum !== undefined) {
        geminiSchema.enum = schema.enum;
    }

    if (schema.type === "object") {
        if (schema.properties) {
            geminiSchema.properties = {};
            for (const [key, value] of Object.entries(schema.properties)) {
                geminiSchema.properties[key] = mapOpenAiSchemaToGemini(value);
            }
        }
        if (schema.required) {
            geminiSchema.required = schema.required;
        }
    } else if (schema.type === "array") {
        if (schema.items) {
            geminiSchema.items = mapOpenAiSchemaToGemini(schema.items);
        }
    }

    return geminiSchema;
}

export const callLLM = async (
    chatMessages: Message[],
    config: AgentConfig,
    abortSignal?: AbortSignal
): Promise<{ text: string; toolCalls: any[]; geminiParts?: any[] }> => {
    const { provider, apiKey, endpoint, model } = config;
    
    const currentView = store.state.currentView || "bulk";
    const systemPrompt = getAgentSystemPrompt(currentView);
    const agentTools = getAllAgentTools();
    
    if (!apiKey && provider !== "custom") {
        throw new Error("API Key is required. Please check your settings.");
    }

    if (provider === "gemini") {
        const apiTargetUrl = `${endpoint.endsWith('/') ? endpoint : endpoint + '/'}${model}:generateContent?key=${apiKey}`;
        
        // Map messages to Gemini's role/parts format
        const geminiContents = chatMessages.map(m => {
            if (m.role === "system") return null;
            if (m.role === "assistant") {
                if (m.geminiParts && m.geminiParts.length > 0) {
                    return { role: "model", parts: m.geminiParts };
                }
                const parts: any[] = [];
                if (m.content) parts.push({ text: m.content });
                if (m.tool_calls) {
                    m.tool_calls.forEach(tc => {
                        parts.push({
                            functionCall: {
                                name: tc.function.name,
                                args: JSON.parse(tc.function.arguments)
                            }
                        });
                    });
                }
                return { role: "model", parts };
            }
            if (m.role === "tool") {
                return {
                    role: "tool",
                    parts: [{
                        functionResponse: {
                            name: m.name,
                            response: { output: typeof m.content === "string" ? JSON.parse(m.content) : m.content }
                        }
                    }]
                };
            }
            return {
                role: "user",
                parts: [{ text: m.content }]
            };
        }).filter(Boolean);

        const geminiTools = [
            {
                functionDeclarations: agentTools.map((t: any) => ({
                    name: t.function.name,
                    description: t.function.description,
                    parameters: mapOpenAiSchemaToGemini(t.function.parameters)
                }))
            }
        ];

        const isExtensionActive = typeof document !== "undefined" &&
            document.documentElement.getAttribute("data-surge-extension-active") === "true";
        
        let shouldProxy = false;
        if (isExtensionActive) {
            if (config.bypassCorsWithExtension !== undefined) {
                shouldProxy = config.bypassCorsWithExtension;
            } else {
                let hostname = "";
                try {
                    const parsed = new URL(apiTargetUrl);
                    hostname = parsed.hostname;
                } catch (e) {}
                shouldProxy = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname === "localhost" || hostname.endsWith(".local");
            }
        }

        let response;
        if (shouldProxy) {
            const bodyStr = JSON.stringify({
                contents: geminiContents,
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                tools: geminiTools
            });
            const res = await sendToExtension({
                action: "fetchProxy",
                url: apiTargetUrl,
                options: {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: bodyStr
                }
            }, 90000);
            if (res && res.success) {
                response = {
                    ok: res.status >= 200 && res.status < 300,
                    status: res.status,
                    text: async () => res.body,
                    json: async () => JSON.parse(res.body)
                };
            } else {
                throw new Error(res?.error || "Failed to communicate with Gemini API via extension proxy.");
            }
        } else {
            response = await fetch(apiTargetUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: geminiContents,
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    tools: geminiTools
                }),
                signal: abortSignal
            });
        }

        if (!response.ok) {
            const errText = await response.text();
            let errMsg = "";
            let errStatus = "";
            let friendlyAdvice = "";
            try {
                const parsed = JSON.parse(errText);
                if (parsed.error) {
                    errMsg = parsed.error.message || "";
                    errStatus = parsed.error.status || "";
                    if (Array.isArray(parsed.error.details)) {
                        const detailsMsg = parsed.error.details
                            .map((d: any) => d.message || d.reason || JSON.stringify(d))
                            .filter(Boolean)
                            .join("; ");
                        if (detailsMsg) {
                            errMsg += ` (Details: ${detailsMsg})`;
                        }
                    }
                }
            } catch {
                errMsg = errText;
            }

            if (!errMsg) {
                errMsg = `HTTP Error ${response.status}`;
            }

            if (response.status === 400) {
                if (errMsg.toLowerCase().includes("key") || errStatus === "INVALID_ARGUMENT") {
                    friendlyAdvice = " Please verify your API Key is correct and active in Settings.";
                } else {
                    friendlyAdvice = " Please verify that the request parameters and model inputs are correct.";
                }
            } else if (response.status === 403) {
                friendlyAdvice = " Access denied. Please ensure the API key is active and has the required permissions or billing enabled.";
            } else if (response.status === 404) {
                friendlyAdvice = " The specified model or endpoint was not found. Please check your model name and base endpoint URL in Settings.";
            } else if (response.status === 429) {
                friendlyAdvice = " Quota exceeded or rate limit reached. Please wait a moment before trying again, or check your Gemini billing/usage limits.";
            } else if (response.status >= 500) {
                friendlyAdvice = " Gemini server error. Please try again in a few seconds.";
            }
            
            const fullMsg = `Gemini API Error (${response.status}${errStatus ? ` - ${errStatus}` : ""}): ${errMsg}.${friendlyAdvice}`;
            throw new Error(fullMsg);
        }

        const data = await response.json();

        // Check for prompt block feedback
        if (data.promptFeedback && data.promptFeedback.blockReason) {
            throw new Error(`Gemini API Prompt Blocked: The input prompt was blocked by safety/policy filters (Reason: ${data.promptFeedback.blockReason}).`);
        }

        const candidate = data.candidates?.[0];
        if (!candidate) {
            throw new Error("Gemini API Error: No response candidates were returned. The request may have been blocked or filtered.");
        }

        // Check if response was blocked by safety filters
        if (candidate.finishReason && candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
            const reason = candidate.finishReason;
            let extra = "";
            if (reason === "SAFETY" && candidate.safetyRatings) {
                const blockedCategories = candidate.safetyRatings
                    .filter((r: any) => r.blocked || r.probability === "MEDIUM" || r.probability === "HIGH")
                    .map((r: any) => `${r.category} (${r.probability})`)
                    .join(", ");
                if (blockedCategories) {
                    extra = ` Flagged categories: ${blockedCategories}.`;
                }
            } else if (reason === "RECITATION") {
                extra = " The model output potentially resembles copyrighted data and was blocked by recitation filters.";
            }
            throw new Error(`Gemini API Blocked: Response generation stopped prematurely (Reason: ${reason}).${extra}`);
        }

        const text = candidate?.content?.parts?.find((p: any) => p.text)?.text || "";
        const rawCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall) || [];
        const geminiParts = candidate?.content?.parts || [];
        
        let toolCalls = rawCalls.map((rc: any) => ({
            id: `call_${Math.random().toString(36).substring(2, 9)}`,
            type: "function",
            function: {
                name: rc.functionCall.name,
                arguments: JSON.stringify(rc.functionCall.args)
            }
        }));

        if (config.enableJsonFallback && toolCalls.length === 0 && text) {
            const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
            let match;
            while ((match = jsonBlockRegex.exec(text)) !== null) {
                try {
                    const parsed = JSON.parse(match[1].trim());
                    if (parsed && typeof parsed === "object" && parsed.name) {
                        toolCalls.push({
                            id: `call_fb_${Math.random().toString(36).substring(2, 9)}`,
                            type: "function",
                            function: {
                                name: parsed.name,
                                arguments: JSON.stringify(parsed.arguments || parsed.args || {})
                            }
                        });
                    }
                } catch (e) {}
            }

            if (toolCalls.length === 0 && text.trim().startsWith("{") && text.trim().endsWith("}")) {
                try {
                    const parsed = JSON.parse(text.trim());
                    if (parsed && typeof parsed === "object" && parsed.name) {
                        toolCalls.push({
                            id: `call_fb_${Math.random().toString(36).substring(2, 9)}`,
                            type: "function",
                            function: {
                                name: parsed.name,
                                arguments: JSON.stringify(parsed.arguments || parsed.args || {})
                            }
                        });
                    }
                } catch (e) {}
            }
        }

        return { text, toolCalls, geminiParts };
    } else {
        // OpenAI and Custom OpenAI-compatible endpoints
        const apiTargetUrl = `${endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint}/chat/completions`;
        
        const openaiHeaders: Record<string, string> = {
            "Content-Type": "application/json"
        };
        if (apiKey) {
            openaiHeaders["Authorization"] = `Bearer ${apiKey}`;
        }

        const openaiMessages = [
            { role: "system", content: systemPrompt },
            ...chatMessages.map(m => {
                if (m.role === "tool") {
                    return {
                        role: "tool",
                        tool_call_id: m.tool_call_id,
                        name: m.name,
                        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
                    };
                }
                return {
                    role: m.role,
                    content: m.content,
                    tool_calls: m.tool_calls
                };
            })
        ];

        const isExtensionActive = typeof document !== "undefined" &&
            document.documentElement.getAttribute("data-surge-extension-active") === "true";
        
        let shouldProxy = false;
        if (isExtensionActive) {
            if (config.bypassCorsWithExtension !== undefined) {
                shouldProxy = config.bypassCorsWithExtension;
            } else {
                let hostname = "";
                try {
                    const parsed = new URL(apiTargetUrl);
                    hostname = parsed.hostname;
                } catch (e) {}
                shouldProxy = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname === "localhost" || hostname.endsWith(".local");
            }
        }

        let response;
        if (shouldProxy) {
            const bodyStr = JSON.stringify({
                model,
                messages: openaiMessages,
                tools: agentTools
            });
            const res = await sendToExtension({
                action: "fetchProxy",
                url: apiTargetUrl,
                options: {
                    method: "POST",
                    headers: openaiHeaders,
                    body: bodyStr
                }
            }, 90000);
            if (res && res.success) {
                response = {
                    ok: res.status >= 200 && res.status < 300,
                    status: res.status,
                    text: async () => res.body,
                    json: async () => JSON.parse(res.body)
                };
            } else {
                throw new Error(res?.error || `Failed to communicate with ${provider === "openai" ? "OpenAI" : "Custom"} API via extension proxy.`);
            }
        } else {
            response = await fetch(apiTargetUrl, {
                method: "POST",
                headers: openaiHeaders,
                body: JSON.stringify({
                    model,
                    messages: openaiMessages,
                    tools: agentTools
                }),
                signal: abortSignal
            });
        }

        if (!response.ok) {
            const errText = await response.text();
            let errMsg = "";
            let errCode = "";
            let friendlyAdvice = "";
            try {
                const parsed = JSON.parse(errText);
                if (parsed.error) {
                    errMsg = parsed.error.message || "";
                    errCode = parsed.error.code || "";
                }
            } catch {
                errMsg = errText;
            }

            if (!errMsg) {
                errMsg = `HTTP Error ${response.status}`;
            }

            if (response.status === 401) {
                friendlyAdvice = " Unauthorized. Please check your API key in Settings.";
            } else if (response.status === 403) {
                friendlyAdvice = " Access denied. Please ensure your account has access to the requested model.";
            } else if (response.status === 404) {
                friendlyAdvice = " Model or endpoint not found. Verify the model name and base endpoint URL in Settings.";
            } else if (response.status === 429) {
                friendlyAdvice = " Rate limit or quota exceeded. Please wait a moment or check your API usage limits.";
            } else if (response.status >= 500) {
                friendlyAdvice = " Server error from provider. Please try again later.";
            }

            const fullMsg = `${provider === "openai" ? "OpenAI" : "Custom Endpoint"} API Error (${response.status}${errCode ? ` - ${errCode}` : ""}): ${errMsg}.${friendlyAdvice}`;
            throw new Error(fullMsg);
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        const text = choice?.message?.content || "";
        let toolCalls = choice?.message?.tool_calls || [];

        if (config.enableJsonFallback && toolCalls.length === 0 && text) {
            const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
            let match;
            while ((match = jsonBlockRegex.exec(text)) !== null) {
                try {
                    const parsed = JSON.parse(match[1].trim());
                    if (parsed && typeof parsed === "object" && parsed.name) {
                        toolCalls.push({
                            id: `call_fb_${Math.random().toString(36).substring(2, 9)}`,
                            type: "function",
                            function: {
                                name: parsed.name,
                                arguments: JSON.stringify(parsed.arguments || parsed.args || {})
                            }
                        });
                    }
                } catch (e) {}
            }

            if (toolCalls.length === 0 && text.trim().startsWith("{") && text.trim().endsWith("}")) {
                try {
                    const parsed = JSON.parse(text.trim());
                    if (parsed && typeof parsed === "object" && parsed.name) {
                        toolCalls.push({
                            id: `call_fb_${Math.random().toString(36).substring(2, 9)}`,
                            type: "function",
                            function: {
                                name: parsed.name,
                                arguments: JSON.stringify(parsed.arguments || parsed.args || {})
                            }
                        });
                    }
                } catch (e) {}
            }
        }

        return { text, toolCalls };
    }
};
