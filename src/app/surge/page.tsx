"use client";

import React, { useRef, useEffect } from "react";
import { useStore } from "@tanstack/react-store";
import { FileUploader } from "@/components/uploader/FileUploader";
import { RequestDesigner } from "@/components/editor/RequestDesigner";
import { ExecutionPanel } from "@/components/execution/ExecutionPanel";
import { ResultsTable } from "@/components/results/ResultsTable";
import { ApiClientWorkspace } from "@/components/api-client/ApiClientWorkspace";
import dynamic from "next/dynamic";

const AgentChatPanel = dynamic(
    () => import("@/components/agent/AgentChatPanel").then((mod) => mod.AgentChatPanel),
    { ssr: false }
);
import { Layers, Sparkles, Download, Upload, Trash2, AlertTriangle, BookOpen } from "lucide-react";
import { exportState, importState, resetStore, hydrateStore, store, setCurrentView } from "@/lib/store";
import { useLocalTransition } from "@/lib/transitions";
import { LoadingTransition } from "@/components/layout/LoadingTransition";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";

export default function SurgePage() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const currentView = useStore(store, (state) => state.currentView || "api_client");
    const [isPending, startLocalTransition] = useLocalTransition();

    const [isExtensionActive, setIsExtensionActive] = React.useState(false);

    useEffect(() => {
        hydrateStore();
        const checkExtension = () => {
            const active = document.documentElement.getAttribute("data-surge-extension-active") === "true";
            setIsExtensionActive(active);
        };
        checkExtension();
        const timer = setTimeout(checkExtension, 150);
        return () => clearTimeout(timer);
    }, []);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result;
            if (typeof content === "string") {
                importState(content);
            }
        };
        reader.readAsText(file);
        e.target.value = ""; // Reset for next time
    };

    return (
        <div className="min-h-screen flex flex-col relative bg-background text-foreground font-sans selection:bg-primary/20">
            {/* Hidden Input for JSON Import */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
            />

            {/* Premium Background Effects */}
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] rounded-full bg-primary/5 blur-[100px]" />
            </div>

            {/* Compact Sticky Header */}
            <header className="sticky top-16 z-40 w-full bg-neutral-950/80 backdrop-blur-md border-b border-white/5 shadow-sm shrink-0">
                <div className="w-full px-4 lg:px-8 xl:px-12 py-2 flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-2 text-xs font-bold text-white/60">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <span>Surge API Workspace</span>
                    </div>

                    {/* View Switcher Tabs */}
                    <div className="flex items-center bg-neutral-900/50 p-0.5 rounded-xl border border-white/5">
                        <button
                            onClick={() => startLocalTransition(() => setCurrentView("api_client"))}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                currentView === "api_client"
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "text-white/50 hover:text-white"
                            }`}
                        >
                            API Client
                        </button>
                        <button
                            onClick={() => startLocalTransition(() => setCurrentView("bulk"))}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                currentView === "bulk"
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "text-white/50 hover:text-white"
                            }`}
                        >
                            Bulk Runner
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {isExtensionActive ? (
                            <div className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 select-none shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-emerald-400 font-bold uppercase tracking-wider">Extension Connected</span>
                            </div>
                        ) : (
                            <a
                                href="https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf?hl=en-US&utm_source=ext_sidebar"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 transition-all cursor-pointer group shrink-0"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 group-hover:bg-indigo-300" />
                                <span className="text-indigo-400 group-hover:text-indigo-300 font-bold uppercase tracking-wider">Get Extension</span>
                            </a>
                        )}
                        
                        <div className="flex items-center border border-white/10 rounded-lg p-0.5 bg-neutral-950/60">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] font-bold uppercase tracking-tight gap-1.5 text-white/80 hover:text-white"
                            onClick={exportState}
                        >
                            <Download className="w-3 h-3" />
                            <span>Export</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] font-bold uppercase tracking-tight gap-1.5 text-white/80 hover:text-white"
                            onClick={handleImportClick}
                        >
                            <Upload className="w-3 h-3" />
                            <span>Import</span>
                        </Button>

                        <Dialog>
                            <DialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[10px] font-bold uppercase tracking-tight gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/20"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Clear</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md border-red-900/50 bg-neutral-950 text-white">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-red-500 font-bold">
                                        <AlertTriangle className="w-5 h-5" />
                                        Clear Entire Workspace?
                                    </DialogTitle>
                                    <DialogDescription className="text-white/50 pt-2 text-xs">
                                        This will irreversibly delete all request templates, imported data, and results. Are you sure you want to proceed?
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter className="mt-4 gap-2 sm:gap-0">
                                    <DialogClose asChild>
                                        <Button variant="ghost" size="sm" className="text-xs">Cancel</Button>
                                    </DialogClose>
                                    <DialogClose asChild>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={resetStore}
                                            className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                                        >
                                            Yes, Clear Workspace
                                        </Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-grow w-full px-4 lg:px-8 xl:px-12 py-6 space-y-6 relative z-10 flex flex-col min-h-0">
                <LoadingTransition local isLoading={isPending} />
                {currentView === "api_client" ? (
                    <ApiClientWorkspace />
                ) : (
                    <div className="flex-grow flex-1 min-h-0 space-y-6">
                        {/* Top Row: Data Source & Request Designer */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 lg:h-[700px] shrink-0 min-h-0">
                            <div className="lg:col-span-4 h-full min-h-0 flex flex-col">
                                <FileUploader />
                            </div>

                            <div className="lg:col-span-8 h-full flex flex-col min-h-0">
                                <RequestDesigner />
                            </div>
                        </div>

                        {/* Middle Row: Execution Engine */}
                        <div className="w-full shrink-0">
                            <ExecutionPanel />
                        </div>

                        {/* Bottom Row: Results */}
                        <div className="pt-2 pb-6">
                            <ResultsTable />
                        </div>
                    </div>
                )}
            </main>
            <AgentChatPanel />
        </div>
    );
}
