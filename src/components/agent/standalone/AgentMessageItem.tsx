import React, { useState } from "react";
import { Wrench, Loader2, Undo, User, Check, X, Copy, Brain, ChevronDown } from "lucide-react";
import { type Message, type ToolDefinition } from "./types";
import { renderMarkdown } from "./render-markdown";
import { EtherealAiSymbol } from "./EtherealAiSymbol";

interface AgentMessageItemProps {
    message: Message;
    allMessages?: Message[];
    onRevert: (id: string) => void;
    tools?: ToolDefinition[];
}

export function AgentMessageItem({ message, allMessages = [], onRevert, tools = [] }: AgentMessageItemProps) {
    const [copied, setCopied] = useState(false);
    const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getToolLabel = (name: string) => {
        const found = tools.find(t => t.function.name === name);
        return found ? found.displayName : name;
    };

    if (message.role === "tool") {
        let success = true;
        try {
            const parsed = JSON.parse(message.content);
            if (parsed.error) success = false;
        } catch {}

        return (
            <div className="flex items-center space-x-2 text-[10px] text-white/40 pl-6 border-l border-white/5 py-0.5 animate-fade-in">
                <Wrench className="w-3 h-3 text-indigo-400" />
                <span>
                    Tool executed: <b className="text-white/60">{message.name ? getToolLabel(message.name) : ""}</b>
                </span>
                {success ? (
                    <span className="text-emerald-400">✓ Success</span>
                ) : (
                    <span className="text-red-400">✗ Failed</span>
                )}
            </div>
        );
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
        return (
            <div className="flex flex-wrap gap-1.5 pl-[36px] py-1 select-text">
                {message.tool_calls.map((tc, idx) => {
                    const toolResultMsg = allMessages.find(
                        (m) => m.role === "tool" && m.tool_call_id === tc.id
                    );
                    const isCompleted = !!toolResultMsg;
                    let success = true;
                    if (isCompleted && toolResultMsg) {
                        try {
                            const parsed = JSON.parse(toolResultMsg.content);
                            if (parsed.error) success = false;
                        } catch {
                            success = false;
                        }
                    }

                    return (
                        <div
                            key={idx}
                            className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium border select-none transition-all duration-300 ${
                                isCompleted
                                    ? success
                                        ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400"
                                        : "bg-red-500/5 border-red-500/10 text-red-400"
                                    : "bg-indigo-500/5 border-indigo-500/10 text-indigo-400 animate-pulse"
                            }`}
                        >
                            {isCompleted ? (
                                success ? (
                                    <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                ) : (
                                    <X className="w-2.5 h-2.5 text-red-400 shrink-0" />
                                )
                            ) : (
                                <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-400 shrink-0" />
                            )}
                            <span>
                                {isCompleted 
                                    ? success 
                                        ? `Used ${getToolLabel(tc.function.name)}` 
                                        : `Failed ${getToolLabel(tc.function.name)}`
                                    : `Using ${getToolLabel(tc.function.name)}...`
                                }
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    }

    const isBot = message.role === "assistant";
    
    return (
        <div className={`flex ${isBot ? "justify-start" : "justify-end"} space-x-2 max-w-full`}>
            {isBot && (
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <EtherealAiSymbol className="w-5 h-5" />
                </div>
            )}
            <div
                className={`px-3 py-2 rounded-xl text-xs leading-relaxed max-w-[85%] break-words relative group ${
                    isBot
                        ? "bg-neutral-900 text-white/95 border border-white/5"
                        : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/10"
                }`}
            >
                {isBot && message.reasoning && (
                    <div className="mb-2 border-b border-white/5 pb-2">
                        <button
                            type="button"
                            onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                            className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] text-white/50 hover:text-white/80 transition-all font-semibold select-none cursor-pointer focus:outline-none"
                        >
                            <Brain className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span>{isThinkingExpanded ? "Hide thinking process" : "Show thinking process"}</span>
                            <ChevronDown className={`w-3 h-3 transition-transform duration-200 shrink-0 ${isThinkingExpanded ? "rotate-180" : ""}`} />
                        </button>
                        {isThinkingExpanded && (
                            <div className="mt-2 text-[10.5px] leading-relaxed text-white/60 bg-neutral-950/40 border border-white/5 rounded-lg p-2 font-mono whitespace-pre-wrap select-text animate-fade-in max-h-[150px] overflow-y-auto custom-scrollbar">
                                {message.reasoning}
                            </div>
                        )}
                    </div>
                )}
                {renderMarkdown(message.content)}

                <div className="mt-0.5 flex justify-end space-x-1 opacity-50 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="text-white/60 hover:text-white hover:bg-white/15 rounded p-0.5 transition-all cursor-pointer flex items-center justify-center border border-white/5"
                    >
                        {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                    </button>
                    {!isBot && (
                        <button
                            type="button"
                            onClick={() => onRevert(message.id)}
                            className="text-white/60 hover:text-white hover:bg-white/15 rounded p-0.5 transition-all cursor-pointer flex items-center justify-center border border-white/5"
                        >
                            <Undo className="w-2.5 h-2.5" />
                        </button>
                    )}
                </div>
            </div>
            {!isBot && (
                <div className="w-7 h-7 rounded-lg bg-neutral-900 border border-white/10 flex items-center justify-center shrink-0 text-white/70">
                    <User className="w-4 h-4" />
                </div>
            )}
        </div>
    );
}
