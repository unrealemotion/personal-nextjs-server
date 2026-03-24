"use client";

import React, { useCallback, useRef } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { useStore } from "@tanstack/react-store";
import { store, updateTemplate, addTemplate, removeTemplate, setActiveTemplate, reorderTemplates } from "@/lib/store";
import { stripJsonComments } from "@/lib/utils";
import { RequestTemplate } from "@/lib/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const processTemplateForFormatting = (str: string, isMinify: boolean) => {
    str = stripJsonComments(str);
    let inString = false;
    let escaped = false;
    let result = '';
    let i = 0;
    while (i < str.length) {
        const char = str[i];
        if (char === '"' && !escaped) {
            inString = !inString;
            result += char;
            i++;
            continue;
        }
        if (char === '\\' && !escaped) {
            escaped = true;
            result += char;
            i++;
            continue;
        }
        escaped = false;

        if (!inString && char === '{' && str[i + 1] === '{') {
            const end = str.indexOf('}}', i);
            if (end !== -1) {
                const varName = str.substring(i + 2, end);
                result += `"__UNQUOTED_VAR_${varName}__"`;
                i = end + 2;
                continue;
            }
        }
        result += char;
        i++;
    }
    
    try {
        const parsed = JSON.parse(result);
        let formatted = JSON.stringify(parsed, null, isMinify ? 0 : 2);
        return formatted.replace(/"__UNQUOTED_VAR_(.+?)__"/g, '{{$1}}');
    } catch(e) {
        throw new Error("Invalid JSON format");
    }
};

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
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{tmpl.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{tmpl.method} {tmpl.url ? tmpl.url.substring(0, 30) + (tmpl.url.length > 30 ? "..." : "") : "No URL"}</p>
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
    const template = templates.find(t => t.id === activeTemplateId) || templates[0];

    const monaco = useMonaco();
    const editorRef = useRef<any>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

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

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;

        monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions({
            validate: false,
        });

        let decorations: any[] = [];
        
        const updateDecorations = () => {
            const model = editor.getModel();
            if (!model) return;
            const text = model.getValue();
            const regex = /\{\{([^}]+)\}\}/g;
            let match;
            const newDecorations = [];
            
            const availableHeaders = store.state.headers;

            while ((match = regex.exec(text)) !== null) {
                const varName = match[1];
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
            decorations = editor.deltaDecorations(decorations, newDecorations);
        };

        editor.onDidChangeModelContent(updateDecorations);
        updateDecorations();

        editor.addAction({
            id: "format-json",
            label: "Format JSON",
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
            contextMenuGroupId: "navigation",
            contextMenuOrder: 1.5,
            run: function (ed: any) {
                try {
                    const formatted = processTemplateForFormatting(ed.getValue(), false);
                    ed.setValue(formatted);
                } catch {
                    toast.error("Invalid JSON format");
                }
            },
        });
    };

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
        <Card className="w-full flex flex-col h-full border-muted-foreground/20 shadow-lg shadow-black/5 rounded-xl bg-card/60 backdrop-blur-sm relative overflow-hidden">
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
                        <Input
                            placeholder="https://api.example.com/users/{{id}}"
                            value={template.url}
                            onChange={handleUrlChange}
                            onPaste={handleUrlPaste}
                            className="flex-1 font-mono text-sm bg-muted/30 border-muted-foreground/20 shadow-inner focus-visible:ring-primary"
                        />
                    </div>

                    <Tabs defaultValue="params" className="flex-1 flex flex-col min-h-0 min-w-0">
                        <TabsList className="bg-muted/50 w-full justify-start rounded-none border-b pb-0 px-2 h-auto flex flex-wrap shrink-0">
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

                        <TabsContent value="body" className="flex-1 mt-0 min-h-0 min-w-0 border border-muted-foreground/20 rounded-b-md rounded-t-none overflow-hidden relative shadow-inner bg-[#1e1e1e] focus-within:ring-1 ring-ring">
                            <div className="absolute inset-0 flex flex-col">
                                <style>{`
                                    .monaco-template-variable {
                                        color: #10b981 !important;
                                        font-weight: 700 !important;
                                        background-color: rgba(16, 185, 129, 0.15);
                                        border-radius: 3px;
                                    }
                                    .monaco-template-variable-invalid {
                                        color: #ef4444 !important;
                                        font-weight: 700 !important;
                                        background-color: rgba(239, 68, 68, 0.15);
                                        border-radius: 3px;
                                    }
                                `}</style>
                                <div className="flex items-center justify-end gap-1 px-2 py-1 bg-[#252526] border-b border-muted-foreground/10 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            try {
                                                const formatted = processTemplateForFormatting(template.body || "", false);
                                                updateTemplate({ body: formatted });
                                            } catch {
                                                toast.error("Invalid JSON format");
                                            }
                                        }}
                                    >
                                        <Braces className="w-3 h-3 mr-1" />
                                        Beautify
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            try {
                                                const formatted = processTemplateForFormatting(template.body || "", true);
                                                updateTemplate({ body: formatted });
                                            } catch {
                                                toast.error("Invalid JSON format");
                                            }
                                        }}
                                    >
                                        <Minimize2 className="w-3 h-3 mr-1" />
                                        Minify
                                    </Button>
                                </div>
                                <div className="flex-1 min-h-0">
                                    <Editor
                                        key={template.id}
                                        height="100%"
                                        defaultLanguage="json"
                                        value={template.body}
                                        onChange={(val) => updateTemplate({ body: val || "" })}
                                        theme="vs-dark"
                                        onMount={handleEditorDidMount}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            formatOnPaste: false,
                                            formatOnType: false,
                                            scrollBeyondLastLine: false,
                                            tabSize: 2,
                                        }}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="params" className="flex-1 mt-0 min-h-0 border border-muted-foreground/20 rounded-b-md rounded-t-none overflow-y-auto bg-muted/10 relative">
                            <div className="p-4 space-y-3 pb-16 min-h-full flex flex-col">
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
