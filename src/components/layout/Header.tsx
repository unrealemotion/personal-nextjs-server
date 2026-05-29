"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, Zap, Layers, Home, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    // Tools Configuration List
    const tools = [
        { name: "Home Dashboard", href: "/", icon: Home, color: "text-white/60" },
        { name: "Surge API", href: "/surge", icon: Zap, color: "text-indigo-400 animate-pulse" },
        { name: "JSON Nexus", href: "/json-nexus", icon: Layers, color: "text-fuchsia-400" }
    ];

    // Auto-detect Active Tool based on pathname prefix
    const activeTool = tools.find(t => t.href !== "/" && pathname.startsWith(t.href)) || tools[0];

    // Determine target documentation route based on active path
    const getDocsRoute = () => {
        if (pathname.startsWith("/surge")) return "/surge/docs";
        if (pathname.startsWith("/json-nexus")) return "/json-nexus/docs";
        return "/surge/docs"; // Fallback docs route
    };

    // Show dynamic documentation button only if we are browsing a specific tool
    const showDocsButton = pathname.startsWith("/surge") || pathname.startsWith("/json-nexus");

    return (
        <nav className="border-b border-white/5 backdrop-blur-md sticky top-0 z-50 bg-[#050505]/70">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between relative">
                
                {/* Left: Brand Logo & Selector Dropdown */}
                <div className="flex items-center space-x-6">
                    <Link href="/" className="flex items-center space-x-3 group cursor-pointer">
                        <div className="relative w-8 h-8 overflow-hidden rounded-lg transition-colors shadow-lg shadow-indigo-500/10 group-hover:shadow-indigo-500/20">
                            <Image src="/logo.png" alt="UnrealEmo Logo" fill className="object-contain p-1" />
                        </div>
                        <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 hidden xs:inline">
                            UnrealEmo
                        </span>
                    </Link>

                    {/* Separator Pipe */}
                    <span className="w-[1px] h-4 bg-white/10" />

                    {/* Premium Dropdown Select Control */}
                    <div className="relative">
                        <button
                          onClick={() => setIsOpen(!isOpen)}
                          className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white bg-white/5 border border-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                        >
                            <activeTool.icon className={`w-3.5 h-3.5 ${activeTool.color}`} />
                            <span>{activeTool.name}</span>
                            <ChevronDown className="w-3.5 h-3.5 opacity-55" />
                        </button>

                        {isOpen && (
                            <>
                                {/* Overlay layer to handle clean closing outside selector bounds */}
                                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                                <div className="absolute top-[calc(100%+8px)] left-0 w-52 bg-[#0c0c0c] border border-white/10 rounded-xl p-1.5 shadow-2xl shadow-black/80 z-50 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {tools.map((t) => (
                                        <Link
                                            key={t.href}
                                            href={t.href}
                                            onClick={() => setIsOpen(false)}
                                            className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                                                activeTool.href === t.href
                                                    ? "bg-white/5 text-white"
                                                    : "text-white/60 hover:text-white hover:bg-white/[0.03]"
                                            }`}
                                        >
                                            <t.icon className={`w-4 h-4 ${t.color}`} />
                                            <span>{t.name}</span>
                                        </Link>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Dynamic Documentation Router */}
                {showDocsButton && (
                    <div className="flex items-center">
                        <Link href={getDocsRoute()}>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-[11px] font-black uppercase tracking-wider gap-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-white/80 hover:text-white transition-all cursor-pointer"
                            >
                                <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                                Docs
                            </Button>
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    );
}
