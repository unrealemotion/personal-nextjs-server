"use client";

import React, { useState } from "react";
import Editor from "@monaco-editor/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ApiResponse } from "@/lib/schema";
import { Clock, Database, CheckCircle2, XCircle } from "lucide-react";

export function ResponsePanel({
    response,
    loading
}: {
    response?: ApiResponse | null;
    loading: boolean;
}) {
    const [bodyFormat, setBodyFormat] = useState<"pretty" | "raw" | "preview">("pretty");

    if (loading) {
        return (
            <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center border border-white/5 bg-neutral-900/20 rounded-2xl">
                <div className="relative w-10 h-10">
                    <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-t-indigo-500 animate-spin" />
                </div>
                <p className="text-xs text-white/50 font-bold mt-4 animate-pulse">Executing Request...</p>
            </div>
        );
    }

    if (!response) {
        return (
            <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center border border-dashed border-white/5 bg-neutral-900/10 rounded-2xl text-white/20">
                <p className="text-xs font-semibold">Send a request to see the response status and data</p>
            </div>
        );
    }

    const getStatusColor = (status: number) => {
        if (status >= 200 && status < 300) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
        if (status >= 300 && status < 400) return "bg-sky-500/10 text-sky-400 border-sky-500/20";
        if (status >= 400) return "bg-rose-500/10 text-rose-400 border-rose-500/20";
        return "bg-neutral-500/10 text-neutral-400 border-neutral-500/20";
    };

    const getFormattedBody = () => {
        try {
            const parsed = JSON.parse(response.body);
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            return response.body;
        }
    };

    const renderPrettyBody = () => {
        let isJson = false;
        let formatted = response.body;
        try {
            const parsed = JSON.parse(response.body);
            formatted = JSON.stringify(parsed, null, 2);
            isJson = true;
        } catch (e) {}

        return (
            <div className="flex-1 min-h-0 w-full border border-white/5 rounded-xl overflow-hidden bg-[#1e1e1e]">
                <Editor
                    height="100%"
                    language={isJson ? "json" : "plaintext"}
                    value={formatted}
                    theme="vs-dark"
                    options={{
                        automaticLayout: true,
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        scrollBeyondLastLine: false,
                        lineNumbers: "on",
                        tabSize: 2,
                        wordWrap: "on",
                    }}
                />
            </div>
        );
    };

    return (
        <div className="w-full flex flex-col h-full bg-neutral-900/25 border border-white/5 rounded-2xl p-4 space-y-4 overflow-hidden">
            {/* Status & Stats toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`px-2.5 py-1 text-xs font-extrabold tracking-wide ${getStatusColor(response.status)}`}>
                        {response.status} {response.statusText || ""}
                    </Badge>
                </div>

                <div className="flex items-center gap-4 text-xs font-semibold text-white/50">
                    <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{response.timeMs} ms</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-fuchsia-400" />
                        <span>
                            {response.sizeBytes > 1024
                                ? `${(response.sizeBytes / 1024).toFixed(2)} KB`
                                : `${response.sizeBytes} B`}
                        </span>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="body" className="w-full flex flex-col flex-1 min-h-0">
                <TabsList className="bg-neutral-950/60 border-b border-white/5 p-0 h-9 justify-start flex flex-nowrap overflow-x-hidden overflow-y-hidden rounded-none shrink-0 w-full">
                    <TabsTrigger
                        value="body"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 py-2 text-xs font-semibold shrink-0"
                    >
                        Body
                    </TabsTrigger>
                    <TabsTrigger
                        value="headers"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 py-2 text-xs font-semibold shrink-0"
                    >
                        Headers ({Object.keys(response.headers || {}).length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="tests"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 py-2 text-xs font-semibold shrink-0"
                    >
                        Tests ({(response.testResults || []).filter(t => t.passed).length}/{(response.testResults || []).length})
                    </TabsTrigger>
                </TabsList>

                {/* Body Content */}
                <TabsContent value="body" className="data-[state=active]:flex flex-col flex-1 mt-3 space-y-2 min-h-0">
                    <div className="flex gap-2">
                        <Button
                            variant={bodyFormat === "pretty" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => setBodyFormat("pretty")}
                        >
                            Pretty
                        </Button>
                        <Button
                            variant={bodyFormat === "raw" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => setBodyFormat("raw")}
                        >
                            Raw
                        </Button>
                        <Button
                            variant={bodyFormat === "preview" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => setBodyFormat("preview")}
                        >
                            Preview
                        </Button>
                    </div>

                    {bodyFormat === "pretty" && renderPrettyBody()}

                    {bodyFormat === "raw" && (
                        <textarea
                            readOnly
                            value={response.body}
                            className="w-full flex-1 min-h-0 p-3 font-mono text-xs bg-[#121213] border border-white/5 rounded-xl text-white/80 focus:outline-none resize-none"
                        />
                    )}

                    {bodyFormat === "preview" && (
                        <div className="w-full flex-1 min-h-0 bg-white rounded-xl overflow-hidden border border-white/5">
                            <iframe
                                srcDoc={response.body}
                                title="Response Preview"
                                sandbox="allow-scripts"
                                className="w-full h-full bg-white"
                            />
                        </div>
                    )}
                </TabsContent>

                {/* Headers Content */}
                <TabsContent value="headers" className="data-[state=active]:flex flex-col flex-1 mt-3 min-h-0 overflow-y-auto">
                    <div className="border border-white/5 rounded-xl overflow-x-auto w-full bg-neutral-950/20 flex-1 min-h-0">
                        <Table>
                            <TableHeader className="bg-neutral-900/40">
                                <TableRow className="border-b border-white/5 hover:bg-transparent">
                                    <TableHead className="w-[200px] text-white/50 text-xs">Header</TableHead>
                                    <TableHead className="text-white/50 text-xs">Value</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Object.entries(response.headers || {}).map(([key, val]) => (
                                    <TableRow key={key} className="border-b border-white/5 hover:bg-white/[0.01]">
                                        <TableCell className="font-mono text-[11px] text-white/70 py-2.5">{key}</TableCell>
                                        <TableCell className="font-mono text-[11px] text-white/80 py-2.5 break-all">{val}</TableCell>
                                    </TableRow>
                                ))}
                                {Object.keys(response.headers || {}).length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={2} className="text-center py-8 text-white/30">
                                            No headers returned
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* Tests Content */}
                <TabsContent value="tests" className="data-[state=active]:flex flex-col flex-1 mt-3 min-h-0 overflow-y-auto pr-1">
                    <div className="space-y-2 flex-grow overflow-y-auto pr-1">
                        {response.testResults && response.testResults.length > 0 ? (
                            response.testResults.map((t, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                                        t.passed
                                            ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400"
                                            : "bg-rose-500/5 border-rose-500/10 text-rose-400"
                                    }`}
                                >
                                    {t.passed ? (
                                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                                    ) : (
                                        <XCircle className="w-4 h-4 shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold truncate">{t.name}</p>
                                        {!t.passed && t.error && (
                                            <p className="text-[10px] opacity-70 font-mono mt-0.5">{t.error}</p>
                                        )}
                                    </div>
                                    <span className="text-[9px] font-extrabold uppercase">
                                        {t.passed ? "Pass" : "Fail"}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12 text-white/20 text-xs">
                                No test assertions executed. Define tests inside the test script.
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
