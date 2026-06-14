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
import { Download, Upload, Trash2, AlertTriangle } from "lucide-react";
import { EtherealAiSymbol } from "@/components/agent/EtherealAiSymbol";
import { exportState, importState, resetStore, hydrateStore, store, setCurrentView } from "@/lib/store";
import { useLocalTransition } from "@/lib/transitions";
import { readFileAsText } from "@/lib/file-utils";
import { useFileImporter } from "@/lib/hooks";
import { LoadingTransition } from "@/components/layout/LoadingTransition";
import { Button } from "@/components/ui/button";
import { sendToExtension } from "@/lib/extension";
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
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

// Threshold version: versions older than this will prompt the user to update the extension.
const MIN_REQUIRED_EXTENSION_VERSION = "1.0.2";

function isVersionOlderThan(current: string | null, target: string): boolean {
    if (!current) return true; // Treat null/undefined (older versions) as outdated

    const cParts = current.split(".").map(Number);
    const tParts = target.split(".").map(Number);

    for (let i = 0; i < Math.max(cParts.length, tParts.length); i++) {
        const cVal = cParts[i] || 0;
        const tVal = tParts[i] || 0;
        if (cVal < tVal) return true;
        if (cVal > tVal) return false;
    }
    return false;
}

export default function SurgePage() {
    const currentView = useStore(store, (state) => state.currentView || "api_client");
    const [isPending, startLocalTransition] = useLocalTransition();

    const [isExtensionActive, setIsExtensionActive] = React.useState(false);
    const [extensionVersion, setExtensionVersion] = React.useState<string | null>(null);

    const [isTooltipOpen, setIsTooltipOpen] = React.useState(false);
    const [hasShownTooltip, setHasShownTooltip] = React.useState(false);
    const [isUpdateDialogOpen, setIsUpdateDialogOpen] = React.useState(false);

    const [browserInfo, setBrowserInfo] = React.useState({
        name: "Google Chrome",
        short: "Chrome",
        isEdge: false
    });

    useEffect(() => {
        if (typeof window !== "undefined") {
            const ua = window.navigator.userAgent.toLowerCase();
            const isEdge = ua.includes("edg/");
            setBrowserInfo({
                name: isEdge ? "Microsoft Edge" : "Google Chrome",
                short: isEdge ? "Edge" : "Chrome",
                isEdge
            });
        }
    }, []);

    useEffect(() => {
        if (isExtensionActive && isVersionOlderThan(extensionVersion, MIN_REQUIRED_EXTENSION_VERSION) && !hasShownTooltip) {
            setIsTooltipOpen(true);
            setHasShownTooltip(true);
            const timer = setTimeout(() => {
                setIsTooltipOpen(false);
            }, 5000); // 5 seconds
            return () => clearTimeout(timer);
        }
    }, [isExtensionActive, extensionVersion, hasShownTooltip]);

    useEffect(() => {
        hydrateStore();
        const checkExtension = async (caller: string) => {
            const activeAttr = document.documentElement.getAttribute("data-surge-extension-active");
            let version = document.documentElement.getAttribute("data-surge-extension-version");
            const active = activeAttr === "true";
            
            if (active && !version) {
                // Tier 2: Try direct version query message (for v1.0.3+)
                try {
                    const res = await sendToExtension({ action: "getVersion" }, 150);
                    if (res && res.success && res.version) {
                        console.log(`[Extension Probe - ${caller}] Direct getVersion query succeeded:`, res.version);
                        version = res.version;
                    }
                } catch (e) {
                    console.warn(`[Extension Probe - ${caller}] Direct version query failed:`, e);
                }
                
                // Tier 3: Probe fallback via fetchProxy (for v1.0.1 / store v1.0.2)
                if (!version) {
                    try {
                        const res = await sendToExtension({ action: "fetchProxy", url: "" }, 500);
                        if (res && res.error === "Extension timeout") {
                            console.log(`[Extension Probe - ${caller}] Probe timed out. Treating as v1.0.0 (outdated).`);
                            version = "1.0.0";
                        } else {
                            console.log(`[Extension Probe - ${caller}] Probe succeeded. Treating as v1.0.2 (compatible).`);
                            version = "1.0.2";
                        }
                    } catch (err) {
                        console.warn(`[Extension Probe - ${caller}] Probe fallback failed:`, err);
                        version = "1.0.0";
                    }
                }
            }
            
            console.log(`[Extension Check - ${caller}]`, {
                activeAttr,
                versionAttr: version,
                active,
                isVersionOlderThanTarget: isVersionOlderThan(version, MIN_REQUIRED_EXTENSION_VERSION)
            });
            
            setIsExtensionActive(active);
            setExtensionVersion(version);
        };
        
        // Check at multiple intervals to capture any hydration overrides or timing shifts
        checkExtension("immediate");
        const t1 = setTimeout(() => checkExtension("150ms"), 150);
        const t2 = setTimeout(() => checkExtension("500ms"), 500);
        const t3 = setTimeout(() => checkExtension("1500ms"), 1500);
        
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, []);

    const { fileInputRef, handleImportClick, handleFileChange } = useFileImporter(
        (content) => {
            importState(content);
        },
        (err) => {
            console.error("Failed to read file:", err);
        }
    );

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
                        <EtherealAiSymbol className="w-4 h-4" />
                        <span>Surge API Workspace</span>
                    </div>

                    {/* View Switcher Tabs */}
                    <div className="flex items-center bg-neutral-900/50 p-0.5 rounded-xl border border-white/5">
                        <button
                            onClick={() => startLocalTransition(() => setCurrentView("api_client"))}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${currentView === "api_client"
                                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                : "text-white/50 hover:text-white"
                                }`}
                        >
                            API Client
                        </button>
                        <button
                            onClick={() => startLocalTransition(() => setCurrentView("bulk"))}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${currentView === "bulk"
                                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                : "text-white/50 hover:text-white"
                                }`}
                        >
                            Bulk Runner
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {isExtensionActive ? (
                            !isVersionOlderThan(extensionVersion, MIN_REQUIRED_EXTENSION_VERSION) ? (
                                <div className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 select-none shrink-0" title="Extension is connected and up to date.">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-emerald-400 font-bold uppercase tracking-wider">Extension Connected</span>
                                </div>
                            ) : (
                                <TooltipProvider delayDuration={200}>
                                    <Tooltip open={isTooltipOpen ? true : undefined} onOpenChange={(open) => { if (!open) setIsTooltipOpen(false); }}>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={() => setIsUpdateDialogOpen(true)}
                                                className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 transition-all cursor-pointer group shrink-0"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                <span className="text-amber-400 group-hover:text-amber-300 font-bold uppercase tracking-wider">Update Extension ({extensionVersion ? `v${extensionVersion}` : "Outdated"})</span>
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-neutral-950 border border-amber-500/20 text-white text-xs px-3 py-1.5 rounded-lg shadow-2xl max-w-xs leading-relaxed">
                                            <div className="flex flex-col gap-1 font-sans">
                                                <span className="font-bold text-amber-400">Extension Update Available!</span>
                                                <span>Please update to version 1.0.2 or newer to enable all features. Click here to learn how.</span>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )
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

            {/* Update Extension Advisory Modal */}
            <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
                <DialogContent className="sm:max-w-md border-indigo-500/20 bg-neutral-950 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-400 font-bold">
                            <EtherealAiSymbol className="w-5 h-5" />
                            Update Surge Extension
                        </DialogTitle>
                        <div className="text-white/70 pt-3 text-xs space-y-3 leading-relaxed">
                            <p>
                                {browserInfo.name} normally updates extensions automatically in the background, but this rollout can take up to 24–48 hours to reach your browser.
                            </p>
                            <p className="font-semibold text-white/90">
                                To update immediately to version 1.0.2 (or latest) and use all features:
                            </p>
                            <ol className="list-decimal pl-4 space-y-2 text-white/80">
                                <li>
                                    Open the <a href="https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf?hl=en-US&utm_source=ext_sidebar" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer">Chrome Web Store Page</a>.
                                </li>
                                <li>
                                    Click <strong>Remove from {browserInfo.short}</strong> {browserInfo.isEdge ? "(or Remove if prompted)" : ""} to uninstall the older version.
                                </li>
                                <li>
                                    Click <strong>Add to {browserInfo.short}</strong> {browserInfo.isEdge ? "(click 'Allow extensions from other stores' first if prompted, then click 'Add extension')" : ""} to instantly reinstall the latest version.
                                </li>
                            </ol>
                        </div>
                    </DialogHeader>
                    <DialogFooter className="mt-4 gap-2 sm:gap-0">
                        <DialogClose asChild>
                            <Button variant="ghost" size="sm" className="text-xs hover:bg-white/5 text-white/80">Close</Button>
                        </DialogClose>
                        <a
                            href="https://chromewebstore.google.com/detail/surge-api-request-helper/opidpbaclhjhjppolfpflbloikhflnlf?hl=en-US&utm_source=ext_sidebar"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 cursor-pointer transition-colors shadow-md shadow-indigo-600/35"
                            onClick={() => setIsUpdateDialogOpen(false)}
                        >
                            Open Web Store
                        </a>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
