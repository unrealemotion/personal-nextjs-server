"use client";

import React, { useCallback, useRef, useEffect } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { useStore } from "@tanstack/react-store";
import { store, updateTemplate, addTemplate, removeTemplate, setActiveTemplate, reorderTemplates } from "@/lib/store";
import { stripJsonComments, processTemplateForFormatting } from "@/lib/utils";
import { RequestTemplate } from "@/lib/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VariableInput } from "@/components/ui/VariableInput";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Code, Terminal, Copy, Braces, Minimize2, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { parseCurl, generateCurl, generateFetch, generateAxios, generatePython } from "@/lib/curl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const normalizeKey = (key: string): string => {
    let k = key.trim();
    if (k.startsWith("{{") && k.endsWith("}}")) {
        k = k.slice(2, -2).trim();
    }
    return k;
};

const RAW_LANGUAGES = [
    { label: "Text", value: "text" },
    { label: "JavaScript", value: "javascript" },
    { label: "JSON", value: "json" },
    { label: "HTML", value: "html" },
    { label: "XML", value: "xml" }
];



function SortableStepItem({ tmpl, isActive, onSelect, onRemove, canRemove }: {
    tmpl: RequestTemplate;
    isActive: boolean;
    onSelect: () => void;
    onRemove: () => void;
    canRemove: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tmpl.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center space-x-2 px-2 py-2 rounded-md border cursor-pointer transition-all group ${isActive
                ? "bg-primary/10 border-primary/50 shadow-sm"
                : "bg-background/50 border-border/50 hover:border-primary/30 hover:bg-muted/30"
                }`}
            onClick={onSelect}
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                <GripVertical className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-xs font-semibold truncate">{tmpl.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{tmpl.method} {tmpl.url || "No URL"}</p>
            </div>
            {canRemove && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                >
                    <Trash2 className="w-3 h-3" />
                </Button>
            )}
        </div>
    );
}

function SortableMobileStep({ tmpl, isActive, onSelect, onRemove, canRemove }: {
    tmpl: RequestTemplate;
    isActive: boolean;
    onSelect: () => void;
    onRemove: () => void;
    canRemove: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tmpl.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-xs whitespace-nowrap cursor-pointer transition-all shrink-0 ${isActive
                ? "bg-primary/10 border-primary/50 shadow-sm"
                : "bg-background/50 border-border/50"
                }`}
            onClick={onSelect}
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0 touch-none"
                onClick={(e) => e.stopPropagation()}
            >
                <GripVertical className="w-3 h-3" />
            </div>
            <span className="font-semibold truncate max-w-[100px]">{tmpl.name}</span>
            {canRemove && (
                <button
                    className="text-muted-foreground hover:text-destructive ml-0.5"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}

export function RequestDesigner() {
    const templates = useStore(store, (state) => state.templates);
    const activeTemplateId = useStore(store, (state) => state.activeTemplateId);
    const headers = useStore(store, (state) => state.headers);
    const template = templates.find(t => t.id === activeTemplateId) || templates[0];

    const monaco = useMonaco();
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const decorationsRef = useRef<any[]>([]);
    const hoverProviderRef = useRef<any>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const getBodyMode = (body: any): string => {
        if (!body) return "none";
        if (typeof body === "string") return "raw";
        return body.mode || "none";
    };

    const handleBodyModeChange = (mode: string) => {
        const currentBody = typeof template.body === "string" ? { mode: "raw", raw: template.body } : (template.body || { mode: "none" });
        updateTemplate({
            body: { ...currentBody, mode }
        });
    };

    const handleBodyRawChange = (raw: string) => {
        const currentBody = typeof template.body === "string" ? { mode: "raw", raw } : (template.body || { mode: "raw" });
        updateTemplate({
            body: { ...currentBody, raw, mode: "raw" }
        });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = templates.findIndex(t => t.id === active.id);
            const newIndex = templates.findIndex(t => t.id === over.id);
            reorderTemplates(oldIndex, newIndex);
        }
    };

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

    const updateDecorations = () => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;

        const model = editor.getModel();
        if (!model) return;
        const text = model.getValue();
        const regex = /\{\{([^}]+)\}\}/g;
        let match;
        const newDecorations = [];
        
        const availableHeaders = (headers || []).map(h => normalizeKey(h));

        while ((match = regex.exec(text)) !== null) {
            const varName = normalizeKey(match[1]);
            const isAvailable = availableHeaders.includes(varName);

            const startPos = model.getPositionAt(match.index);
            const endPos = model.getPositionAt(match.index + match[0].length);
            newDecorations.push({
                range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
                options: { 
                    inlineClassName: isAvailable ? 'monaco-template-variable' : 'monaco-template-variable-invalid'
                }
            });
        }
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
    };

    const latestUpdateDecorationsRef = useRef(updateDecorations);
    latestUpdateDecorationsRef.current = updateDecorations;

    const debouncedUpdateDecorations = React.useMemo(() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;
        return () => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                latestUpdateDecorationsRef.current();
            }, 400);
        };
    }, []);

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions({
            validate: false,
        });

        editor.onDidChangeModelContent(() => {
            debouncedUpdateDecorations();
        });

        updateDecorations();

        editor.addAction({
            id: "format-json",
            label: "Format JSON",
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
            contextMenuGroupId: "navigation",
            contextMenuOrder: 1.5,
            run: function (ed: any) {
                try {
                    const formatted = processTemplateForFormatting(ed.getValue());
                    ed.setValue(formatted);
                } catch (err: any) {
                    toast.error(`Format failed: ${err?.message || "Invalid JSON format"}`);
                }
            },
        });
    };

    useEffect(() => {
        updateDecorations();
    }, [headers, activeTemplateId]);

    useEffect(() => {
        const monaco = monacoRef.current;
        if (!monaco) return;

        if (hoverProviderRef.current) {
            hoverProviderRef.current.dispose();
        }

        hoverProviderRef.current = monaco.languages.registerHoverProvider('json', {
            provideHover: function (model: any, position: any) {
                const lineContent = model.getLineContent(position.lineNumber);
                const regex = /\{\{([^}]+)\}\}/g;
                let match;
                while ((match = regex.exec(lineContent)) !== null) {
                    const startIdx = match.index;
                    const endIdx = startIdx + match[0].length;
                    if (position.column >= startIdx + 1 && position.column <= endIdx + 1) {
                        const rawVar = match[1];
                        const varName = normalizeKey(rawVar);
                        const availableHeaders = (store.state.headers || []).map(h => normalizeKey(h));
                        const isAvailable = availableHeaders.includes(varName);
                        
                        return {
                            range: new monaco.Range(position.lineNumber, startIdx + 1, position.lineNumber, endIdx + 1),
                            contents: [
                                { value: `**Excel Variable: \`{{${rawVar.trim()}}}\`**` },
                                { value: isAvailable ? `✓ Available as an Excel column header.` : `⚠ Missing from Excel headers. Ensure your sheet has a column named \`${varName}\`.` }
                            ]
                        };
                    }
                }
                return null;
            }
        });
    }, [activeTemplateId]);

    useEffect(() => {
        return () => {
            if (hoverProviderRef.current) {
                hoverProviderRef.current.dispose();
            }
        };
    }, []);

    const handleCopy = (format: 'curl' | 'fetch' | 'axios' | 'python') => {
        let text = "";
        if (format === 'curl') text = generateCurl(template);
        if (format === 'fetch') text = generateFetch(template);
        if (format === 'axios') text = generateAxios(template);
        if (format === 'python') text = generatePython(template);
        
        navigator.clipboard.writeText(text);
        toast.success(`Copied as ${format.toUpperCase()}!`);
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateTemplate({ name: e.target.value });
    };

    return (
        <Card className="w-full flex flex-col h-full min-h-0 border-muted-foreground/20 shadow-lg shadow-black/5 rounded-xl bg-card/60 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />
            <CardHeader className="pb-4 border-b border-border/40">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                    <div>
                        <CardTitle className="text-xl bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                            Request Designer
                        </CardTitle>
                        <CardDescription>Configure your API endpoint and payload with variables matching your data.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy snippet
                                    <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-40 p-1" align="end">
                                <Button variant="ghost" size="sm" className="w-full justify-start font-normal" onClick={() => handleCopy('curl')}>cURL (Bash)</Button>
                                <Button variant="ghost" size="sm" className="w-full justify-start font-normal" onClick={() => handleCopy('fetch')}>Fetch (JS)</Button>
                                <Button variant="ghost" size="sm" className="w-full justify-start font-normal" onClick={() => handleCopy('axios')}>Axios (Node/JS)</Button>
                                <Button variant="ghost" size="sm" className="w-full justify-start font-normal" onClick={() => handleCopy('python')}>Python (Requests)</Button>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0 flex flex-col sm:flex-row z-10">
                {/* Desktop: Step Sidebar (hidden on mobile) */}
                <div className="hidden sm:flex w-[200px] shrink-0 border-r border-border/40 p-3 flex-col space-y-2 overflow-y-auto bg-muted/20">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Request Steps</p>
                    <DndContext
                        id="dnd-context-desktop"
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={templates.map(t => t.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-1.5">
                                {templates.map((tmpl, idx) => (
                                    <SortableStepItem
                                        key={tmpl.id}
                                        tmpl={tmpl}
                                        isActive={tmpl.id === activeTemplateId}
                                        onSelect={() => setActiveTemplate(tmpl.id)}
                                        onRemove={() => removeTemplate(tmpl.id)}
                                        canRemove={templates.length > 1}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addTemplate()}
                        className="w-full border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors mt-2"
                    >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add Step
                    </Button>
                </div>

                {/* Mobile: Compact sortable step list (hidden on desktop) */}
                <div className="flex sm:hidden flex-col border-b border-border/40 bg-muted/20 shrink-0">
                    <div className="flex items-center gap-2 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">Steps</p>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 shrink-0 border-dashed border-muted-foreground/30"
                            onClick={() => addTemplate()}
                        >
                            <Plus className="w-3 h-3" />
                        </Button>
                    </div>
                    <div className="max-h-[150px] overflow-y-auto px-3 pb-2">
                        <DndContext
                            id="dnd-context-mobile"
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext items={templates.map(t => t.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-1.5">
                                    {templates.map((tmpl) => (
                                        <SortableMobileStep
                                            key={tmpl.id}
                                            tmpl={tmpl}
                                            isActive={tmpl.id === activeTemplateId}
                                            onSelect={() => setActiveTemplate(tmpl.id)}
                                            onRemove={() => removeTemplate(tmpl.id)}
                                            canRemove={templates.length > 1}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>

                {/* Active template editor */}
                <div className="flex-1 p-3 sm:p-6 space-y-4 overflow-hidden flex flex-col min-w-0 min-h-0">
                    {/* Step Name */}
                    <div className="shrink-0">
                        <Input
                            value={template.name}
                            onChange={handleNameChange}
                            className="text-sm font-semibold bg-transparent border-none shadow-none focus-visible:ring-0 p-0 h-auto"
                            placeholder="Step Name..."
                        />
                    </div>

                    {/* Method & URL */}
                    <div className="flex space-x-2 shrink-0">
                        <Select value={template.method} onValueChange={handleMethodChange}>
                            <SelectTrigger className="w-[120px] font-semibold bg-muted/50 border-muted-foreground/20 focus:ring-primary shadow-sm">
                                <SelectValue placeholder="Method" />
                            </SelectTrigger>
                            <SelectContent>
                                {["GET", "POST", "PUT", "PATCH", "DELETE", "QUERY"].map((m) => (
                                    <SelectItem key={m} value={m} className="font-semibold">{m}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <VariableInput
                            isBulk={true}
                            placeholder="https://api.example.com/users/{{id}}"
                            value={template.url}
                            onChange={handleUrlChange}
                            onPaste={handleUrlPaste}
                            className="flex-1 font-mono text-sm bg-muted/30 border-muted-foreground/20 shadow-inner focus-visible:ring-primary"
                        />
                    </div>

                    <Tabs defaultValue="params" className="flex-1 flex flex-col min-h-0 min-w-0">
                        <TabsList className="bg-muted/50 w-full justify-start rounded-none border-b pb-0 px-2 h-9 flex flex-nowrap overflow-x-hidden overflow-y-hidden shrink-0">
                            <TabsTrigger
                                value="params"
                                className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-3 py-2 shrink-0"
                            >
                                Params ({(template.params || []).length})
                            </TabsTrigger>
                            <TabsTrigger
                                value="headers"
                                className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-3 py-2 shrink-0"
                            >
                                Headers ({template.headers.length})
                            </TabsTrigger>
                            <TabsTrigger
                                value="body"
                                className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-3 py-2 shrink-0"
                            >
                                Body
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="body" className="flex-1 mt-0 min-h-0 border border-muted-foreground/20 rounded-b-md rounded-t-none overflow-hidden bg-muted/10 relative flex flex-col p-4 space-y-4">
                            {/* Body mode radio selectors */}
                            <div className="flex flex-wrap gap-4 text-xs font-semibold text-muted-foreground border-b border-border/40 pb-2 shrink-0">
                                {[
                                    { label: "none", value: "none" },
                                    { label: "form-data", value: "formdata" },
                                    { label: "x-www-form-urlencoded", value: "urlencoded" },
                                    { label: "raw", value: "raw" },
                                    { label: "binary", value: "binary" },
                                    { label: "GraphQL", value: "graphql" }
                                ].map((m) => {
                                    const mode = getBodyMode(template.body);
                                    return (
                                        <label key={m.value} className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                                            <input
                                                type="radio"
                                                name="bulkBodyMode"
                                                checked={mode === m.value}
                                                onChange={() => handleBodyModeChange(m.value)}
                                                className="text-primary bg-background border-border cursor-pointer animate-none"
                                            />
                                            <span>{m.label}</span>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* mode panels */}
                            {getBodyMode(template.body) === "raw" && (() => {
                                const bodyObj = typeof template.body === "string" ? { mode: "raw", raw: template.body, rawLanguage: "json" } : (template.body || { mode: "raw", raw: "", rawLanguage: "json" });
                                const rawLanguage = bodyObj.rawLanguage || "json";
                                const rawText = bodyObj.raw || "";
                                return (
                                    <div className="flex flex-col flex-1 min-h-0 space-y-2 relative">
                                        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground bg-muted/50 p-2 rounded-lg border border-border/40 shrink-0">
                                            <div className="flex items-center gap-2">
                                                <span>Type:</span>
                                                <select
                                                    value={rawLanguage}
                                                    onChange={(e) => {
                                                        updateTemplate({
                                                            body: { ...bodyObj, rawLanguage: e.target.value, mode: "raw" }
                                                        });
                                                    }}
                                                    className="bg-background border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none cursor-pointer font-sans"
                                                >
                                                    {RAW_LANGUAGES.map(lang => (
                                                        <option key={lang.value} value={lang.value}>{lang.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {rawLanguage === "json" && (
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-[10px] text-primary hover:text-primary/80"
                                                        onClick={() => {
                                                            try {
                                                                const beautified = processTemplateForFormatting(rawText);
                                                                handleBodyRawChange(beautified);
                                                            } catch (e) {
                                                                toast.error("Invalid JSON format");
                                                            }
                                                        }}
                                                    >
                                                        Beautify
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-h-0 w-full border border-border/40 rounded-xl overflow-hidden bg-[#1e1e1e]">
                                            <Editor
                                                key={`${template.id}-raw`}
                                                height="100%"
                                                language={rawLanguage === "text" ? "plaintext" : rawLanguage}
                                                value={rawText}
                                                onChange={(val) => handleBodyRawChange(val || "")}
                                                theme="vs-dark"
                                                onMount={handleEditorDidMount}
                                                options={{
                                                    automaticLayout: true,
                                                    minimap: { enabled: false },
                                                    fontSize: 13,
                                                    scrollBeyondLastLine: false,
                                                    lineNumbers: "on",
                                                    tabSize: 2,
                                                    wordWrap: "on",
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })()}

                            {getBodyMode(template.body) === "graphql" && (() => {
                                const bodyObj = typeof template.body === "string" ? { mode: "graphql", graphql: { query: "", variables: "" } } : (template.body || { mode: "graphql" });
                                const graphql = bodyObj.graphql || { query: "", variables: "" };
                                return (
                                    <div className="flex flex-col flex-1 min-h-0 space-y-2">
                                        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-2">
                                            <div className="md:col-span-8 flex flex-col min-h-0">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Query</span>
                                                <div className="flex-1 min-h-0 w-full border border-border/40 rounded-xl overflow-hidden bg-[#1e1e1e]">
                                                    <Editor
                                                        key={`${template.id}-gql`}
                                                        height="100%"
                                                        language="graphql"
                                                        value={graphql.query || ""}
                                                        onChange={(val) => {
                                                            updateTemplate({
                                                                body: {
                                                                    ...bodyObj,
                                                                    mode: "graphql",
                                                                    graphql: {
                                                                        query: val || "",
                                                                        variables: graphql.variables || ""
                                                                    }
                                                                }
                                                            });
                                                        }}
                                                        theme="vs-dark"
                                                        options={{
                                                            automaticLayout: true,
                                                            minimap: { enabled: false },
                                                            fontSize: 12,
                                                            scrollBeyondLastLine: false,
                                                            lineNumbers: "on",
                                                            wordWrap: "on",
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="md:col-span-4 flex flex-col min-h-0">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Variables (JSON)</span>
                                                <textarea
                                                    value={graphql.variables || ""}
                                                    onChange={(e) => {
                                                        updateTemplate({
                                                            body: {
                                                                ...bodyObj,
                                                                mode: "graphql",
                                                                graphql: {
                                                                    query: graphql.query || "",
                                                                    variables: e.target.value
                                                                }
                                                            }
                                                        });
                                                    }}
                                                    placeholder={'{\n  "variable": "value"\n}'}
                                                    className="w-full flex-1 min-h-0 p-2.5 font-mono text-xs bg-[#121213] border border-border/40 rounded-xl text-white focus:outline-none resize-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {getBodyMode(template.body) === "binary" && (() => {
                                const bodyObj = typeof template.body === "string" ? { mode: "binary", binary: "" } : (template.body || { mode: "binary" });
                                return (
                                    <div className="py-2 space-y-2 flex flex-col flex-1 min-h-0">
                                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Select File or Enter Raw Text Payload</span>
                                        <textarea
                                            value={bodyObj.binary || ""}
                                            onChange={(e) => {
                                                updateTemplate({
                                                    body: {
                                                        ...bodyObj,
                                                        mode: "binary",
                                                        binary: e.target.value
                                                    }
                                                });
                                            }}
                                            placeholder="Enter binary content or file payload reference..."
                                            className="w-full flex-1 min-h-0 p-3 font-mono text-xs bg-[#121213] border border-border/40 rounded-xl text-white focus:outline-none resize-none"
                                        />
                                    </div>
                                );
                            })()}

                            {getBodyMode(template.body) === "urlencoded" && (() => {
                                const bodyObj = typeof template.body === "string" ? { mode: "urlencoded", urlencoded: [] } : (template.body || { mode: "urlencoded" });
                                const urlencoded = bodyObj.urlencoded || [];
                                return (
                                    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
                                        {urlencoded.map((p: any, idx: number) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={p.enabled}
                                                    onChange={(e) => {
                                                        const newUrlencoded = [...urlencoded];
                                                        newUrlencoded[idx] = { ...newUrlencoded[idx], enabled: e.target.checked };
                                                        updateTemplate({ body: { ...bodyObj, urlencoded: newUrlencoded } });
                                                    }}
                                                    className="rounded border-border bg-background text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer shrink-0"
                                                />
                                                <VariableInput
                                                    isBulk={true}
                                                    placeholder="Key"
                                                    value={p.key}
                                                    onChange={(e) => {
                                                        const newUrlencoded = [...urlencoded];
                                                        newUrlencoded[idx] = { ...newUrlencoded[idx], key: e.target.value };
                                                        updateTemplate({ body: { ...bodyObj, urlencoded: newUrlencoded } });
                                                    }}
                                                    className="h-8 font-mono text-[11px] bg-background/50 border-border"
                                                />
                                                <VariableInput
                                                    isBulk={true}
                                                    placeholder="Value"
                                                    value={p.value}
                                                    onChange={(e) => {
                                                        const newUrlencoded = [...urlencoded];
                                                        newUrlencoded[idx] = { ...newUrlencoded[idx], value: e.target.value };
                                                        updateTemplate({ body: { ...bodyObj, urlencoded: newUrlencoded } });
                                                    }}
                                                    className="h-8 font-mono text-[11px] bg-background/50 border-border"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        const newUrlencoded = urlencoded.filter((_: any, i: number) => i !== idx);
                                                        updateTemplate({ body: { ...bodyObj, urlencoded: newUrlencoded } });
                                                    }}
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const newUrlencoded = [...urlencoded, { key: "", value: "", enabled: true }];
                                                updateTemplate({ body: { ...bodyObj, urlencoded: newUrlencoded, mode: "urlencoded" } });
                                            }}
                                            className="h-7 text-[10px] border-dashed border-border bg-background hover:bg-muted w-full"
                                        >
                                            <Plus className="w-3.5 h-3.5 mr-1" />
                                            Add urlencoded key/value
                                        </Button>
                                    </div>
                                );
                            })()}

                            {getBodyMode(template.body) === "formdata" && (() => {
                                const bodyObj = typeof template.body === "string" ? { mode: "formdata", formdata: [] } : (template.body || { mode: "formdata" });
                                const formdata = bodyObj.formdata || [];
                                return (
                                    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
                                        {formdata.map((p: any, idx: number) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={p.enabled}
                                                    onChange={(e) => {
                                                        const newFormdata = [...formdata];
                                                        newFormdata[idx] = { ...newFormdata[idx], enabled: e.target.checked };
                                                        updateTemplate({ body: { ...bodyObj, formdata: newFormdata } });
                                                    }}
                                                    className="rounded border-border bg-background text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer shrink-0"
                                                />
                                                <VariableInput
                                                    isBulk={true}
                                                    placeholder="Key"
                                                    value={p.key}
                                                    onChange={(e) => {
                                                        const newFormdata = [...formdata];
                                                        newFormdata[idx] = { ...newFormdata[idx], key: e.target.value };
                                                        updateTemplate({ body: { ...bodyObj, formdata: newFormdata } });
                                                    }}
                                                    className="h-8 font-mono text-[11px] bg-background/50 border-border"
                                                />
                                                <VariableInput
                                                    isBulk={true}
                                                    placeholder="Value"
                                                    value={p.value}
                                                    onChange={(e) => {
                                                        const newFormdata = [...formdata];
                                                        newFormdata[idx] = { ...newFormdata[idx], value: e.target.value };
                                                        updateTemplate({ body: { ...bodyObj, formdata: newFormdata } });
                                                    }}
                                                    className="h-8 font-mono text-[11px] bg-background/50 border-border"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        const newFormdata = formdata.filter((_: any, i: number) => i !== idx);
                                                        updateTemplate({ body: { ...bodyObj, formdata: newFormdata } });
                                                    }}
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const newFormdata = [...formdata, { key: "", value: "", enabled: true, type: "text" }];
                                                updateTemplate({ body: { ...bodyObj, formdata: newFormdata, mode: "formdata" } });
                                            }}
                                            className="h-7 text-[10px] border-dashed border-border bg-background hover:bg-muted w-full"
                                        >
                                            <Plus className="w-3.5 h-3.5 mr-1" />
                                            Add formdata key/value
                                        </Button>
                                    </div>
                                );
                            })()}

                            {getBodyMode(template.body) === "none" && (
                                <div className="py-8 text-center text-muted-foreground text-xs italic">
                                    This request does not have a body payload.
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="params" className="flex-1 mt-0 min-h-0 border border-muted-foreground/20 rounded-b-md rounded-t-none overflow-y-auto bg-muted/10 relative">
                            <div className="p-4 space-y-3 pb-16 min-h-full flex flex-col">
                                {(template.params || []).map((param, idx) => (
                                    <div key={idx} className="flex space-x-2 items-center group">
                                        <VariableInput
                                            isBulk={true}
                                            placeholder="Key (e.g., page)"
                                            value={param.key}
                                            onChange={(e) => updateParam(idx, e.target.value, param.value)}
                                            className="font-mono text-sm bg-background/50 border-muted-foreground/20 focus-visible:ring-primary/50"
                                        />
                                        <VariableInput
                                            isBulk={true}
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
                            </div>
                            <div className="sticky bottom-0 p-3 border-t border-muted-foreground/10 bg-muted/80 backdrop-blur-sm">
                                <Button variant="outline" size="sm" onClick={addParam} className="w-full border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Param
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="headers" className="flex-1 mt-0 min-h-0 border border-muted-foreground/20 rounded-b-md rounded-t-none overflow-y-auto bg-muted/10 relative">
                            <div className="p-4 space-y-3 pb-16 min-h-full flex flex-col">
                                {template.headers.map((header, idx) => (
                                    <div key={idx} className="flex space-x-2 items-center group">
                                        <VariableInput
                                            isBulk={true}
                                            placeholder="Key (e.g., Authorization)"
                                            value={header.key}
                                            onChange={(e) => updateHeader(idx, e.target.value, header.value)}
                                            className="font-mono text-sm bg-background/50 border-muted-foreground/20 focus-visible:ring-primary/50"
                                        />
                                        <VariableInput
                                            isBulk={true}
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
                            </div>
                            <div className="sticky bottom-0 p-3 border-t border-muted-foreground/10 bg-muted/80 backdrop-blur-sm">
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
