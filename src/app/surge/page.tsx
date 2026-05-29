"use client";

import React, { useRef, useEffect } from "react";
import { FileUploader } from "@/components/uploader/FileUploader";
import { RequestDesigner } from "@/components/editor/RequestDesigner";
import { ExecutionPanel } from "@/components/execution/ExecutionPanel";
import { ResultsTable } from "@/components/results/ResultsTable";
import { Layers, Sparkles, Download, Upload, Trash2, AlertTriangle, BookOpen } from "lucide-react";
import { exportState, importState, resetStore, hydrateStore } from "@/lib/store";
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

    useEffect(() => {
        hydrateStore();
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
        <div className="min-h-screen relative bg-background text-foreground font-sans selection:bg-primary/20 overflow-hidden">
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

            <main className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 space-y-4 sm:py-8 sm:space-y-8 relative z-10">
                {/* Sleek Workspace Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-neutral-900/40 border border-white/5 backdrop-blur-md">
                    <div className="flex items-center space-x-2 text-xs font-bold text-white/60">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <span>Surge API Workspace</span>
                    </div>
                    
                    <div className="flex items-center border border-white/10 rounded-lg p-0.5 bg-neutral-950">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-[11px] font-bold uppercase tracking-tight gap-2 text-white/80 hover:text-white"
                            onClick={exportState}
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>Export</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-[11px] font-bold uppercase tracking-tight gap-2 text-white/80 hover:text-white"
                            onClick={handleImportClick}
                        >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Import</span>
                        </Button>

                        <Dialog>
                            <DialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-[11px] font-bold uppercase tracking-tight gap-2 text-red-400 hover:text-red-300 hover:bg-red-950/20"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Clear Workspace</span>
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
                                        <Button variant="ghost" size="sm" onClick={() => { }} className="text-xs">Cancel</Button>
                                    </DialogClose>
                                    <DialogClose asChild>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={resetStore}
                                            className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                                        >
                                            Yes, Delete Everything
                                        </Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
                {/* Top Row: Data Source & Request Designer */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 lg:h-[700px]">
                    <div className="lg:col-span-4 h-full">
                        <FileUploader />
                    </div>

                    <div className="lg:col-span-8 h-[80vh] sm:h-[600px] lg:h-full flex min-h-0">
                        <RequestDesigner />
                    </div>
                </div>

                {/* Middle Row: Execution Engine */}
                <div className="w-full">
                    <ExecutionPanel />
                </div>

                {/* Bottom Row: Results */}
                <div className="pt-4 mt-8">
                    <ResultsTable />
                </div>
            </main>
        </div>
    );
}
