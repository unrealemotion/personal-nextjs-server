"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface LoadingTransitionProps {
    local?: boolean;
    isLoading?: boolean;
}

function LoadingTransitionInner({ local = false, isLoading: controlledIsLoading = false }: LoadingTransitionProps) {
    const [localIsLoading, setLocalIsLoading] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Determine loading state: controlled prop for local container, internal listeners for full page
    const isLoading = local ? controlledIsLoading : localIsLoading;

    // Reset loading state on route change (only if full page loader)
    useEffect(() => {
        if (local) return;
        setLocalIsLoading(false);
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    }, [pathname, searchParams, local]);

    // Setup custom event listeners and click interceptor (only if full page loader)
    useEffect(() => {
        if (local) return;

        const handleStart = () => {
            setLocalIsLoading(true);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            // Safety net: auto-hide after 2.5 seconds if loading hangs
            timeoutRef.current = setTimeout(() => {
                setLocalIsLoading(false);
            }, 2500);
        };

        const handleEnd = () => {
            // Short delay to ensure fade-out transition works smoothly
            setTimeout(() => {
                setLocalIsLoading(false);
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
            }, 100);
        };

        const handleLinkClick = (e: MouseEvent) => {
            let target = e.target as HTMLElement | null;
            while (target && target.tagName !== "A") {
                target = target.parentElement;
            }

            if (target && target.tagName === "A") {
                const anchor = target as HTMLAnchorElement;
                const href = anchor.getAttribute("href");

                // Skip external, target="_blank", same-page fragments, download, or modifier keys
                if (
                    !href ||
                    href.startsWith("http") ||
                    href.startsWith("#") ||
                    href.startsWith("javascript:") ||
                    anchor.target === "_blank" ||
                    anchor.hasAttribute("download") ||
                    e.ctrlKey ||
                    e.metaKey ||
                    e.shiftKey ||
                    e.button !== 0
                ) {
                    return;
                }

                // Compare URL origins and paths
                try {
                    const targetUrl = new URL(anchor.href, window.location.href);
                    const currentUrl = new URL(window.location.href);

                    if (
                        targetUrl.origin === currentUrl.origin &&
                        targetUrl.pathname !== currentUrl.pathname
                    ) {
                        handleStart();
                    }
                } catch {
                    // Ignore parsing errors for malformed hrefs
                }
            }
        };

        window.addEventListener("unrealemo:loading-start", handleStart);
        window.addEventListener("unrealemo:loading-end", handleEnd);
        document.addEventListener("click", handleLinkClick);

        return () => {
            window.removeEventListener("unrealemo:loading-start", handleStart);
            window.removeEventListener("unrealemo:loading-end", handleEnd);
            document.removeEventListener("click", handleLinkClick);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [pathname, local]);

    return (
        <>
            {/* Top glow/loading bar (Global navigation only) */}
            {!local && (
                <div
                    className={`fixed top-0 left-0 right-0 h-[3px] z-[10000] transition-all duration-300 origin-left ${
                        isLoading ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"
                    }`}
                >
                    <div className="w-full h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 shadow-[0_0_10px_#6366f1,0_0_20px_#d946ef] animate-[shimmer-bar_1.5s_linear_infinite] bg-[length:200%_auto]" />
                </div>
            )}

            {/* Overlay Container */}
            <div
                className={`inset-0 flex flex-col items-center justify-center transition-all duration-300 ease-in-out ${
                    local 
                        ? "absolute z-30 bg-neutral-950/70 backdrop-blur-xs" 
                        : "fixed z-[9999] bg-[#050505]/85 backdrop-blur-md"
                } ${
                    isLoading
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                }`}
            >
                {/* Atmospheric Glows */}
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[80px] pointer-events-none animate-pulse ${
                    local ? "w-[200px] h-[200px]" : "w-[350px] h-[350px]"
                }`} />
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/10 blur-[70px] pointer-events-none ${
                    local ? "w-[150px] h-[150px]" : "w-[250px] h-[250px]"
                }`} />

                {/* Orbital Rings System */}
                <div className={`relative w-32 h-32 flex items-center justify-center select-none transition-transform duration-300 ${
                    local ? "scale-90" : "scale-110"
                }`}>
                    {/* Outer rotating dashed ring */}
                    <div className="absolute w-full h-full rounded-full border border-dashed border-indigo-500/20 animate-[spin_25s_linear_infinite]" />

                    {/* Outer Orbit Particle */}
                    <div className="absolute w-2 h-2 rounded-full bg-indigo-400/80 blur-[1px] animate-[orbit-particle_6s_linear_infinite]" />

                    {/* 3D Orbit Ring 1 (Clockwise) */}
                    <div 
                        className="absolute w-24 h-24 rounded-full border-t-[1.5px] border-r-[1.5px] border-indigo-500/40 animate-[spin_3s_linear_infinite] shadow-[0_0_15px_rgba(99,102,241,0.2)]" 
                        style={{ transform: "rotateX(65deg) rotateY(15deg)" }} 
                    />

                    {/* 3D Orbit Ring 2 (Counter-Clockwise) */}
                    <div 
                        className="absolute w-24 h-24 rounded-full border-b-[1.5px] border-l-[1.5px] border-fuchsia-500/40 animate-[spin_4s_linear_reverse_infinite] shadow-[0_0_15px_rgba(217,70,239,0.2)]" 
                        style={{ transform: "rotateX(65deg) rotateY(-45deg)" }} 
                    />

                    {/* Pulsing Core Sphere */}
                    <div className="absolute w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 animate-[core-pulse_1.8s_ease-in-out_infinite] shadow-[0_0_20px_rgba(99,102,241,0.7),0_0_40px_rgba(217,70,239,0.4)]" />
                </div>

                {/* Enigmatic caption */}
                <div className="mt-8 font-mono text-[9px] font-semibold tracking-[0.4em] text-white/45 uppercase select-none animate-[text-pulse_2s_ease-in-out_infinite] flex items-center gap-1">
                    <span>Synchronizing Nexus</span>
                    <span className="inline-block w-1 h-2.5 bg-indigo-500/80 animate-[cursor-blink_1s_infinite] ml-1" />
                </div>
            </div>
        </>
    );
}

export function LoadingTransition({ local = false, isLoading = false }: LoadingTransitionProps) {
    return (
        <Suspense fallback={null}>
            <LoadingTransitionInner local={local} isLoading={isLoading} />
        </Suspense>
    );
}
