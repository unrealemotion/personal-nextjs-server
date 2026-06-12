import React, { useState } from "react";
import { Wrench, Loader2, Undo, User, Check, X, Copy } from "lucide-react";
import { type Message } from "@/lib/schema";
import { renderMarkdown } from "./render-markdown";
import { EtherealAiSymbol } from "./EtherealAiSymbol";

interface AgentMessageItemProps {
    message: Message;
    allMessages?: Message[];
    onRevert: (id: string) => void;
}

export function AgentMessageItem({ message, allMessages = [], onRevert }: AgentMessageItemProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (message.role === "tool") {
        let success = true;
        try {
            const parsed = JSON.parse(message.content);
            if (parsed.error) success = false;
        } catch {}

        return (
            <div className="flex items-center space-x-2 text-[10px] text-white/40 pl-6 border-l border-white/5 py-0.5">
                <Wrench className="w-3 h-3 text-indigo-400" />
                <span>
                    Tool executed: <b className="text-white/60">{message.name}</b>
                </span>
                {success ? (
                    <span className="text-emerald-400">✓ Success</span>
                ) : (
                    <span className="text-red-400">✗ Failed</span>
                )}
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
                {renderMarkdown(message.content)}
                {message.tool_calls && message.tool_calls.map((tc, idx) => {
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
                            className={`mt-2 text-[10px] p-1.5 rounded border flex items-center space-x-1.5 transition-all duration-300 ${
                                isCompleted
                                    ? success
                                        ? "text-emerald-400 bg-emerald-950/30 border-emerald-500/20"
                                        : "text-red-400 bg-red-950/30 border-red-500/20"
                                    : "text-indigo-400 bg-neutral-950 border-white/5"
                            }`}
                        >
                            {isCompleted ? (
                                success ? (
                                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                ) : (
                                    <X className="w-3 h-3 text-red-400 shrink-0" />
                                )
                            ) : (
                                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            )}
                            <span>
                                {isCompleted ? (success ? "Executed: " : "Failed: ") : "Calling: "}
                                <code className={`font-mono ${isCompleted ? (success ? "text-emerald-300" : "text-red-300") : "text-white/80"}`}>
                                    {tc.function.name}
                                </code>
                            </span>
                        </div>
                    );
                })}
                <div className="mt-1 flex justify-end space-x-1 opacity-50 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="text-white/60 hover:text-white hover:bg-white/15 rounded p-1 transition-all cursor-pointer flex items-center justify-center border border-white/5"
                    >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    {!isBot && (
                        <button
                            type="button"
                            onClick={() => onRevert(message.id)}
                            className="text-white/60 hover:text-white hover:bg-white/15 rounded p-1 transition-all cursor-pointer flex items-center justify-center border border-white/5"
                        >
                            <Undo className="w-3 h-3" />
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
