import { type Message, type AgentProfile, type ToolDefinition, type FetchProxyFn, type LLMCallParams } from "./types";



function mapOpenAiSchemaToGemini(schema: any): any {
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

function checkShouldProxy(config: AgentProfile, apiTargetUrl: string, fetchProxy?: FetchProxyFn): boolean {
    if (!fetchProxy) return false;
    const isExtensionActive = typeof document !== "undefined" && 
        document.documentElement.getAttribute("data-surge-extension-active") === "true";
    if (isExtensionActive) {
        if (config.bypassCorsWithExtension !== undefined) {
            return config.bypassCorsWithExtension;
        } else {
            let hostname = "";
            try {
                const parsed = new URL(apiTargetUrl);
                hostname = parsed.hostname;
            } catch {}
            return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname === "localhost" || hostname.endsWith(".local");
        }
    }
    return false;
}

function parseAndAddToolCall(jsonStr: string, toolCalls: any[]): void {
    try {
        const parsed = JSON.parse(jsonStr);
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
    } catch {}
}

function handleProxyResponse(res: any, apiName: string): any {
    if (res && res.success) {
        return {
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            text: async () => res.body,
            json: async () => JSON.parse(res.body)
        };
    } else {
        throw new Error(res?.error || `Failed to communicate with ${apiName} API via extension proxy.`);
    }
}

function extractJsonFallbackToolCalls(text: string, toolCalls: any[]): void {
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;
    while ((match = jsonBlockRegex.exec(text)) !== null) {
        parseAndAddToolCall(match[1].trim(), toolCalls);
    }

    if (toolCalls.length === 0 && text.trim().startsWith("{") && text.trim().endsWith("}")) {
        parseAndAddToolCall(text.trim(), toolCalls);
    }
}

function mapMessagesToGeminiContents(chatMessages: Message[]): any[] {
    return chatMessages.map(m => {
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
}

function mapToolsToGeminiTools(agentTools: ToolDefinition[]): any[] {
    return [
        {
            functionDeclarations: agentTools.map((t: any) => ({
                name: t.function.name,
                description: t.function.description,
                parameters: mapOpenAiSchemaToGemini(t.function.parameters)
            }))
        }
    ];
}

function handleGeminiErrorResponse(response: Response, errText: string): never {
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

function checkGeminiSafetyAndFinishReasons(data: any, candidate: any): void {
    if (data.promptFeedback && data.promptFeedback.blockReason) {
        throw new Error(`Gemini API Prompt Blocked: The input prompt was blocked by safety/policy filters (Reason: ${data.promptFeedback.blockReason}).`);
    }

    if (!candidate) {
        throw new Error("Gemini API Error: No response candidates were returned. The request may have been blocked or filtered.");
    }

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
}

async function callGemini(
    params: LLMCallParams
): Promise<{ text: string; toolCalls: any[]; geminiParts?: any[]; reasoning?: string }> {
    const { chatMessages, config, systemPrompt, agentTools, fetchProxy, abortSignal } = params;
    const { apiKey, endpoint, model } = config;
    const apiTargetUrl = `${endpoint.endsWith('/') ? endpoint : endpoint + '/'}${model}:generateContent?key=${apiKey}`;

    const geminiContents = mapMessagesToGeminiContents(chatMessages);
    const geminiTools = mapToolsToGeminiTools(agentTools);

    const shouldProxy = checkShouldProxy(config, apiTargetUrl, fetchProxy);

    let response;
    if (shouldProxy && fetchProxy) {
        const bodyStr = JSON.stringify({
            contents: geminiContents,
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            tools: geminiTools
        });
        const res = await fetchProxy(apiTargetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: bodyStr
        }, abortSignal);
        response = handleProxyResponse(res, "Gemini");
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
        handleGeminiErrorResponse(response, errText);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];

    checkGeminiSafetyAndFinishReasons(data, candidate);

    const text = candidate?.content?.parts?.find((p: any) => p.text)?.text || "";
    const rawCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall) || [];
    const geminiParts = candidate?.content?.parts || [];
    const reasoning = candidate?.content?.parts?.find((p: any) => p.thought || p.reasoning)?.text || "";
    
    const toolCalls = rawCalls.map((rc: any) => ({
        id: `call_${Math.random().toString(36).substring(2, 9)}`,
        type: "function",
        function: {
            name: rc.functionCall.name,
            arguments: JSON.stringify(rc.functionCall.args)
        }
    }));

    if (config.enableJsonFallback && toolCalls.length === 0 && text) {
        extractJsonFallbackToolCalls(text, toolCalls);
    }

    return { text, toolCalls, geminiParts, reasoning };
}

function mapMessagesToOpenAiMessages(chatMessages: Message[], systemPrompt: string): any[] {
    return [
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
}

function handleOpenAiErrorResponse(response: Response, errText: string, provider: string): never {
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

async function callOpenAi(
    params: LLMCallParams
): Promise<{ text: string; toolCalls: any[]; reasoning?: string }> {
    const { chatMessages, config, systemPrompt, agentTools, fetchProxy, abortSignal } = params;
    const { provider, apiKey, endpoint, model } = config;
    const apiTargetUrl = `${endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint}/chat/completions`;

    const openaiHeaders: Record<string, string> = {
        "Content-Type": "application/json"
    };
    if (apiKey) {
        openaiHeaders["Authorization"] = `Bearer ${apiKey}`;
    }

    const openaiMessages = mapMessagesToOpenAiMessages(chatMessages, systemPrompt);

    const shouldProxy = checkShouldProxy(config, apiTargetUrl, fetchProxy);

    const openAiTools = agentTools.map((t: any) => ({
        type: "function",
        function: {
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters
        }
    }));

    let response;
    if (shouldProxy && fetchProxy) {
        const bodyStr = JSON.stringify({
            model,
            messages: openaiMessages,
            tools: openAiTools
        });
        const res = await fetchProxy(apiTargetUrl, {
            method: "POST",
            headers: openaiHeaders,
            body: bodyStr
        }, abortSignal);
        response = handleProxyResponse(res, provider === "openai" ? "OpenAI" : "Custom");
    } else {
        response = await fetch(apiTargetUrl, {
            method: "POST",
            headers: openaiHeaders,
            body: JSON.stringify({
                model,
                messages: openaiMessages,
                tools: openAiTools
            }),
            signal: abortSignal
        });
    }

    if (!response.ok) {
        const errText = await response.text();
        handleOpenAiErrorResponse(response, errText, provider);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const text = choice?.message?.content || "";
    const toolCalls = choice?.message?.tool_calls || [];
    const reasoning = choice?.message?.reasoning || choice?.message?.reason_content || choice?.message?.reason || "";

    if (config.enableJsonFallback && toolCalls.length === 0 && text) {
        extractJsonFallbackToolCalls(text, toolCalls);
    }

    return { text, toolCalls, reasoning };
}

export const callLLM = async (
    chatMessages: Message[],
    config: AgentProfile,
    systemPrompt: string,
    agentTools: ToolDefinition[],
    fetchProxy?: FetchProxyFn,
    abortSignal?: AbortSignal
): Promise<{ text: string; toolCalls: any[]; geminiParts?: any[]; reasoning?: string }> => {
    const { provider } = config;

    if (!config.apiKey && provider !== "custom") {
        throw new Error("API Key is required. Please check your settings.");
    }

    const params: LLMCallParams = {
        chatMessages,
        config,
        systemPrompt,
        agentTools,
        fetchProxy,
        abortSignal
    };

    if (provider === "gemini") {
        return callGemini(params);
    } else {
        return callOpenAi(params);
    }
};
