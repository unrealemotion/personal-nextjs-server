"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";

interface CopyableTextProps {
    value: string;
    className?: string;
    iconClassName?: string;
    showIconAlways?: boolean;
    iconPosition?: "left" | "right";
    hideIcon?: boolean;
}

export function CopyableText({
    value,
    className,
    iconClassName,
    showIconAlways = false,
    iconPosition = "left",
    hideIcon = false,
}: CopyableTextProps) {
    const [copied, setCopied] = useState(false);

    const executeFallbackCopy = () => {
        const textArea = document.createElement("textarea");
        textArea.value = value;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand("copy");
            if (successful) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            } else {
                toast.error("Copy failed");
            }
        } catch {
            toast.error("Copy failed");
        } finally {
            document.body.removeChild(textArea);
        }
    };

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        try {
            // Try modern Clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(value);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            } else {
                // Fallback for iframes or browsers without Clipboard API
                executeFallbackCopy();
            }
        } catch {
            // If Clipboard API fails (e.g., in iframe), try fallback
            executeFallbackCopy();
        }
    };

    const Icon = hideIcon ? null : copied ? (
        <Check className={cn("h-3 w-3 text-green-500 shrink-0", iconClassName)} />
    ) : (
        <Copy
            className={cn(
                "h-3 w-3 shrink-0 transition-opacity",
                showIconAlways ? "opacity-50" : "opacity-0 group-hover:opacity-50",
                iconClassName
            )}
        />
    );

    return (
        <button
            type="button"
            onClick={handleCopy}
            className={cn(
                "inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer group min-w-0 text-left relative",
                className
            )}
        >
            {iconPosition === "left" && Icon}
            <span className={cn("truncate", hideIcon && "relative")}>{value}</span>
            {iconPosition === "right" && Icon}
            {copied && (
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-bold rounded shadow-sm pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-200 z-50 whitespace-nowrap">
                    Copied!
                </span>
            )}
        </button>
    );
}
