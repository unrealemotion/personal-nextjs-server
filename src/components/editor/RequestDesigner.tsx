"use client";

import React, { useCallback, useRef } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { useStore } from "@tanstack/react-store";
import { store, updateTemplate } from "@/lib/store";
import { RequestTemplate } from "@/lib/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Code, Terminal, Copy } from "lucide-react";
import { parseCurl, generateCurl } from "@/lib/curl";

export function RequestDesigner() {
    const template = useStore(store, (state) => state.template);
    const [curlInput, setCurlInput] = React.useState("");
    const [isCurlDialogOpen, setIsCurlDialogOpen] = React.useState(false);
    const monaco = useMonaco();
    const editorRef = useRef<any>(null);

    const handleMethodChange = (value: string) => {
        updateTemplate({ method: value as RequestTemplate["method"] });
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateTemplate({ url: e.target.value });
    };

    const handleUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pastedText = e.clipboardData.getData("text");
        if (pastedText.trim().startsWith("curl ")) {
            e.preventDefault();
            const parsed = parseCurl(pastedText);
            if (parsed) {
                updateTemplate(parsed);
            } else {
                alert("Invalid or unsupported cURL command");
            }
        }
    };

    const addHeader = () => {
        updateTemplate({ headers: [...template.headers, { key: "", value: "" }] });
    };

    const updateHeader = (index: number, key: string, value: string) => {
        const newHeaders = [...template.headers];
        newHeaders[index] = { key, value };
        updateTemplate({ headers: newHeaders });
    };

    const removeHeader = (index: number) => {
        const newHeaders = template.headers.filter((_, i) => i !== index);
        updateTemplate({ headers: newHeaders });
    };

    const addParam = () => {
        const currentParams = template.params || [];
        updateTemplate({ params: [...currentParams, { key: "", value: "" }] });
    };

    const updateParam = (index: number, key: string, value: string) => {
        const currentParams = template.params || [];
        const newParams = [...currentParams];
        newParams[index] = { key, value };
        updateTemplate({ params: newParams });
    };

    const removeParam = (index: number) => {
        const currentParams = template.params || [];
        const newParams = currentParams.filter((_, i) => i !== index);
        updateTemplate({ params: newParams });
    };

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;

        // Add format command Ctrl+Shift+I or similar
        editor.addAction({
            id: "format-json",
            label: "Format JSON",
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
            contextMenuGroupId: "navigation",
            contextMenuOrder: 1.5,
            run: function (ed: any) {
                ed.getAction("editor.action.formatDocument").run();
            },
        });
    };

    const handleImportCurl = () => {
        const parsed = parseCurl(curlInput);
        if (parsed) {
            updateTemplate(parsed);
        } else {
            alert("Invalid or unsupported cURL command");
        }
        setIsCurlDialogOpen(false);
        setCurlInput("");
    };

    const handleCopyCurl = () => {
        const curl = generateCurl(template);
        navigator.clipboard.writeText(curl);
        alert("Copied to clipboard!");
    };

    return (
        <Card className="w-full flex flex-col h-full border-muted-foreground/20 shadow-lg shadow-black/5 rounded-xl bg-card/60 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />
            <CardHeader className="pb-4 border-b border-border/40">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                            Request Designer
                        </CardTitle>
                        <CardDescription>Configure your API endpoint and payload with variables matching your data.</CardDescription>
                    </div>
                    <div className="flex space-x-2">
                        <Dialog open={isCurlDialogOpen} onOpenChange={setIsCurlDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Terminal className="w-4 h-4 mr-2" />
                                    Paste cURL
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Import cURL</DialogTitle>
                                    <DialogDescription>
                                        Paste your cURL command here to autofill the request settings.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                    <Textarea
                                        value={curlInput}
                                        onChange={(e) => setCurlInput(e.target.value)}
                                        placeholder="curl -X POST https://api.example.com..."
                                        className="h-32 font-mono text-xs break-all whitespace-pre-wrap"
                                    />
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsCurlDialogOpen(false)}>Cancel</Button>
                                    <Button onClick={handleImportCurl}>Import</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        <Button variant="outline" size="sm" onClick={handleCopyCurl}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy cURL
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0 flex flex-col z-10">
                <div className="p-6 space-y-4 flex-1 overflow-hidden flex flex-col">
                    {/* Method & URL */}
                    <div className="flex space-x-2 shrink-0">
                        <Select value={template.method} onValueChange={handleMethodChange}>
                            <SelectTrigger className="w-[120px] font-semibold bg-muted/50 border-muted-foreground/20 focus:ring-primary shadow-sm">
                                <SelectValue placeholder="Method" />
                            </SelectTrigger>
                            <SelectContent>
                                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                                    <SelectItem key={m} value={m} className="font-semibold">{m}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            placeholder="https://api.example.com/users/{{id}}"
                            value={template.url}
                            onChange={handleUrlChange}
                            onPaste={handleUrlPaste}
                            className="flex-1 font-mono text-sm bg-muted/30 border-muted-foreground/20 shadow-inner focus-visible:ring-primary"
                        />
                    </div>

                    <Tabs defaultValue="params" className="flex-1 flex flex-col min-h-0 min-w-0">
                        <TabsList className="bg-muted/50 w-full justify-start rounded-none border-b pb-0 px-2 h-auto flex flex-wrap">
                            <TabsTrigger
                                value="params"
                                className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
                            >
                                Params ({(template.params || []).length})
                            </TabsTrigger>
                            <TabsTrigger
                                value="headers"
                                className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
                            >
                                Headers ({template.headers.length})
                            </TabsTrigger>
                            <TabsTrigger
                                value="body"
                                className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2"
                            >
                                Body (JSON)
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="body" className="flex-1 p-0 mt-0 min-h-0 min-w-0 border border-muted-foreground/20 rounded-b-md focus-within:ring-1 ring-ring flex flex-col rounded-t-none overflow-hidden relative data-[state=active]:flex shadow-inner bg-[#1e1e1e]">
                            <Editor
                                height="100%"
                                defaultLanguage="json"
                                value={template.body}
                                onChange={(val) => updateTemplate({ body: val || "" })}
                                theme="vs-dark"
                                onMount={handleEditorDidMount}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    formatOnPaste: true,
                                    formatOnType: true,
                                    scrollBeyondLastLine: false,
                                    tabSize: 2,
                                }}
                            />
                        </TabsContent>

                        <TabsContent value="params" className="flex-1 p-0 mt-0 min-h-0 overflow-y-auto border border-muted-foreground/20 rounded-b-md rounded-t-none data-[state=active]:flex flex-col bg-muted/10 p-4 space-y-4">
                            <div className="space-y-3">
                                {(template.params || []).map((param, idx) => (
                                    <div key={idx} className="flex space-x-2 items-center group">
                                        <Input
                                            placeholder="Key (e.g., page)"
                                            value={param.key}
                                            onChange={(e) => updateParam(idx, e.target.value, param.value)}
                                            className="font-mono text-sm bg-background/50 border-muted-foreground/20 focus-visible:ring-primary/50"
                                        />
                                        <Input
                                            placeholder="Value (e.g., {{page}})"
                                            value={param.value}
                                            onChange={(e) => updateParam(idx, param.key, e.target.value)}
                                            className="font-mono text-sm bg-background/50 border-muted-foreground/20 focus-visible:ring-primary/50"
                                        />
                                        <Button variant="ghost" size="icon" onClick={() => removeParam(idx)} className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-destructive shrink-0 transition-opacity">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={addParam} className="w-full border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Param
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="headers" className="flex-1 p-0 mt-0 min-h-0 overflow-y-auto border border-muted-foreground/20 rounded-b-md rounded-t-none data-[state=active]:flex flex-col bg-muted/10 p-4 space-y-4">
                            <div className="space-y-3">
                                {template.headers.map((header, idx) => (
                                    <div key={idx} className="flex space-x-2 items-center group">
                                        <Input
                                            placeholder="Key (e.g., Authorization)"
                                            value={header.key}
                                            onChange={(e) => updateHeader(idx, e.target.value, header.value)}
                                            className="font-mono text-sm bg-background/50 border-muted-foreground/20 focus-visible:ring-primary/50"
                                        />
                                        <Input
                                            placeholder="Value (e.g., Bearer {{token}})"
                                            value={header.value}
                                            onChange={(e) => updateHeader(idx, header.key, e.target.value)}
                                            className="font-mono text-sm bg-background/50 border-muted-foreground/20 focus-visible:ring-primary/50"
                                        />
                                        <Button variant="ghost" size="icon" onClick={() => removeHeader(idx)} className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-destructive shrink-0 transition-opacity">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={addHeader} className="w-full border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Header
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </CardContent>
        </Card>
    );
}
