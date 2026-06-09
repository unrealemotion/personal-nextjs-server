"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "@tanstack/react-store";
import { store, setColumnMappings, setTableFilterConfig, setActiveResultInstance, duplicateResultAsNewRow, saveRerunResult } from "@/lib/store";
import { type ColumnMapping, type TableFilterConfig, type ExecutionResult, type StepResult } from "@/lib/schema";
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    ColumnDef,
    getPaginationRowModel,
} from "@tanstack/react-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Download, Plus, Trash2, Eye, EyeOff, ChevronsUpDown, Check, ArrowUp, ArrowDown, ListFilter, Loader2, Play, Settings, Database, ArrowUpRight, ArrowDownLeft, Activity, AlertCircle, Clock, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import * as xlsx from "xlsx";
import Editor from "@monaco-editor/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, stripJsonComments } from "@/lib/utils";
import { CopyableText } from "@/components/ui/CopyableText";
import { sendToExtension } from "@/lib/extension";
import { toast } from "sonner";


function SearchableSelect({ value, onChange, options, placeholder, className }: {
    value: string;
    onChange: (val: string) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const selected = options.find(o => o.value === value);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("justify-between font-mono text-xs truncate", className)}
                >
                    <span className="truncate">{selected?.label || placeholder || "Select..."}</span>
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search..." className="h-8 text-xs" />
                    <CommandList>
                        <CommandEmpty>No match.</CommandEmpty>
                        <CommandGroup>
                            {options.map((opt) => (
                                <CommandItem
                                    key={opt.value}
                                    value={opt.label}
                                    onSelect={() => { onChange(opt.value); setOpen(false); }}
                                    className="text-xs font-mono"
                                >
                                    <Check className={cn("mr-1.5 h-3 w-3", value === opt.value ? "opacity-100" : "opacity-0")} />
                                    {opt.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

const pathSegmentsCache = new Map<string, string[]>();
function getSegments(path: string): string[] {
    let segments = pathSegmentsCache.get(path);
    if (!segments) {
        const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
        segments = normalizedPath.split('.');
        pathSegmentsCache.set(path, segments);
    }
    return segments;
}

function getByDotNotation(obj: any, path: string): string {
    if (!obj || !path) return "";
    try {
        const segments = getSegments(path);
        const value = segments.reduce((acc, part) => acc && acc[part], obj);
        if (value === undefined || value === null) return "";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
    } catch (e) {
        return "";
    }
}

type SuggestionItem = {
    label: string;
    value: string;
};

function getValueByPath(obj: any, path: string): any {
    if (!obj) return undefined;
    if (!path) return obj;
    try {
        const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
        const parts = normalizedPath.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }
        return current;
    } catch (e) {
        return undefined;
    }
}

function getValueChildren(val: any): string[] {
    if (val === null || val === undefined) return [];
    if (Array.isArray(val)) {
        return val.map((_, idx) => String(idx));
    }
    if (typeof val === "object") {
        return Object.keys(val);
    }
    return [];
}

function getJsonBodiesForMapping(col: ColumnMapping, results: ExecutionResult[]): any[] {
    const bodies: any[] = [];
    for (const res of results) {
        if (bodies.length >= 5) break;
        const steps = res.steps || [];
        let body: any = null;
        if (col.source === "response") {
            const step = col.stepId
                ? steps.find(s => s.stepId === col.stepId)
                : steps[steps.length - 1];
            body = step?.responseBody ?? res.responseBody;
        } else if (col.source === "request_body") {
            const step = col.stepId
                ? steps.find(s => s.stepId === col.stepId)
                : steps[0];
            body = step?.requestBody;
        }

        if (body !== undefined && body !== null) {
            if (typeof body === "string") {
                const trimmed = body.trim();
                if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
                    try {
                        bodies.push(JSON.parse(trimmed));
                    } catch (e) {
                        // ignore
                    }
                }
            } else {
                bodies.push(body);
            }
        }
    }
    return bodies;
}

function getChildrenForPath(bodies: any[], path: string): string[] {
    const keysSet = new Set<string>();
    bodies.forEach((body) => {
        const val = getValueByPath(body, path);
        const children = getValueChildren(val);
        children.forEach(child => keysSet.add(child));
    });
    return Array.from(keysSet);
}

function getSuggestionsForInput(inputVal: string, bodies: any[]): SuggestionItem[] {
    const suggestions: SuggestionItem[] = [];
    const trimmed = inputVal.trim();

    // 1. If it's a valid path, suggest its children prefixed with a dot
    if (trimmed) {
        const children = getChildrenForPath(bodies, trimmed);
        children.forEach(child => {
            suggestions.push({
                label: `.${child}`,
                value: `${trimmed}.${child}`
            });
        });
    }

    // 2. Parse parent path and filter based on last dot
    const lastDotIdx = trimmed.lastIndexOf(".");
    let parentPath = "";
    let filter = trimmed;
    let isRoot = true;

    if (lastDotIdx !== -1) {
        parentPath = trimmed.substring(0, lastDotIdx);
        filter = trimmed.substring(lastDotIdx + 1);
        isRoot = false;
    }

    const parentChildren = getChildrenForPath(bodies, parentPath);
    parentChildren.forEach(child => {
        if (child.toLowerCase().startsWith(filter.toLowerCase())) {
            const label = isRoot ? child : `.${child}`;
            const value = isRoot ? child : `${parentPath}.${child}`;
            if (!suggestions.some(s => s.value === value)) {
                suggestions.push({ label, value });
            }
        }
    });

    return suggestions.filter(s => s.value !== trimmed);
}

interface PathAutocompleteInputProps {
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
    col: ColumnMapping;
    results: ExecutionResult[];
}

function PathAutocompleteInput({ value, onChange, placeholder, col, results }: PathAutocompleteInputProps) {
    const [localValue, setLocalValue] = useState(value);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Sync localValue with prop value from parent
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const bodies = useMemo(() => {
        if (!isOpen) return [];
        return getJsonBodiesForMapping(col, results);
    }, [col, results, isOpen]);

    // Use localValue to calculate suggestions
    const suggestions = useMemo(() => {
        if (!isOpen) return [];
        return getSuggestionsForInput(localValue, bodies);
    }, [localValue, bodies, isOpen]);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [suggestions]);

    const localValueRef = useRef(localValue);
    const valueRef = useRef(value);

    // Sync refs
    useEffect(() => {
        localValueRef.current = localValue;
    }, [localValue]);

    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    // Helper to commit changes immediately
    const commitValue = (val: string) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (val !== valueRef.current) {
            onChange(val);
        }
    };

    // Debounce updates while typing
    const handleLocalValueChange = (newVal: string) => {
        setLocalValue(newVal);
        setIsOpen(true);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            onChange(newVal);
        }, 300); // 300ms debounce during continuous typing
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Commit immediately on blur
                commitValue(localValueRef.current);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen || suggestions.length === 0) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                setIsOpen(true);
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            const selected = suggestions[highlightedIndex];
            if (selected) {
                setLocalValue(selected.value);
                commitValue(selected.value);
            } else {
                commitValue(localValue);
            }
            setIsOpen(false);
        } else if (e.key === "Escape") {
            setIsOpen(false);
        }
    };

    return (
        <div ref={containerRef} className="relative flex-1 min-w-[120px]">
            <Input
                value={localValue}
                onChange={(e) => handleLocalValueChange(e.target.value)}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full font-mono text-sm"
            />
            {isOpen && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto z-50 bg-neutral-950/95 backdrop-blur-md text-popover-foreground border border-white/10 rounded-md shadow-lg py-1 font-mono text-xs">
                    {suggestions.map((s, idx) => (
                        <button
                            key={s.value}
                            type="button"
                            onClick={() => {
                                setLocalValue(s.value);
                                commitValue(s.value);
                                containerRef.current?.querySelector("input")?.focus();
                            }}
                            className={cn(
                                "w-full text-left px-3 py-1.5 hover:bg-white/10 hover:text-white flex items-center justify-between cursor-pointer border-0 bg-transparent text-white/80",
                                highlightedIndex === idx && "bg-white/10 text-white"
                            )}
                        >
                            <span>{s.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function formatBody(body: any): string {
    if (body === null || body === undefined) return "";
    if (typeof body === "object") {
        return JSON.stringify(body, null, 2);
    }
    if (typeof body === "string") {
        const trimmed = body.trim();
        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
                return JSON.stringify(JSON.parse(trimmed), null, 2);
            } catch (e) {
                // Fall through to plain text
            }
        }
        return body;
    }
    return String(body);
}

function ColumnHeaderWithFilter({
    colId,
    colName,
    rawTableData,
}: {
    colId: string;
    colName: string;
    rawTableData: any[];
}) {
    const tableFilterConfig = useStore(store, (state) => state.tableFilterConfig);
    const activeFilters = tableFilterConfig.columnFilters ? tableFilterConfig.columnFilters[colId] : undefined; // can be undefined
    const sortBy = tableFilterConfig.sortBy;
    const sortOrder = tableFilterConfig.sortOrder;

    const [popoverOpen, setPopoverOpen] = useState(false);
    const [filterSearch, setFilterSearch] = useState("");
    const [localActiveFilters, setLocalActiveFilters] = useState<string[] | undefined>(undefined);

    const uniqueValues = useMemo(() => {
        if (!popoverOpen) return [];
        const values = new Set<string>();
        rawTableData.forEach(row => {
            const val = String(row[colId] ?? "");
            values.add(val);
        });
        return Array.from(values).sort();
    }, [rawTableData, colId, popoverOpen]);

    const handleSort = (direction: "asc" | "desc" | null) => {
        setTableFilterConfig({ sortBy: direction ? colId : null, sortOrder: direction });
    };

    const handleOpenChange = (open: boolean) => {
        setPopoverOpen(open);
        if (open) {
            setLocalActiveFilters(activeFilters);
        } else {
            setFilterSearch("");
            // Defer applying the filters slightly to allow the Popover to close instantly without stutter
            setTimeout(() => {
                const currentConfig = store.state.tableFilterConfig;
                const updatedFilters = { ...currentConfig.columnFilters };
                if (localActiveFilters === undefined) {
                    delete updatedFilters[colId];
                } else {
                    updatedFilters[colId] = localActiveFilters;
                }
                setTableFilterConfig({ columnFilters: updatedFilters });
            }, 100);
        }
    };

    const toggleValueLocal = (val: string) => {
        const currentFilters = localActiveFilters !== undefined && !localActiveFilters.includes("__NONE_SELECTED__")
            ? localActiveFilters 
            : [];
            
        let newFilters = localActiveFilters !== undefined ? [...currentFilters] : [...uniqueValues];
        
        if (newFilters.includes(val)) {
            newFilters = newFilters.filter(v => v !== val);
        } else {
            newFilters.push(val);
        }

        if (newFilters.length === uniqueValues.length) {
            setLocalActiveFilters(undefined);
        } else if (newFilters.length === 0) {
            setLocalActiveFilters(["__NONE_SELECTED__"]);
        } else {
            setLocalActiveFilters(newFilters);
        }
    };

    const isCheckedLocal = (val: string) => {
        if (localActiveFilters === undefined) return true;
        if (localActiveFilters.includes("__NONE_SELECTED__")) return false;
        return localActiveFilters.includes(val);
    };

    const handleSelectAllLocal = () => {
        setLocalActiveFilters(undefined);
    };

    const handleClearAllLocal = () => {
        setLocalActiveFilters(["__NONE_SELECTED__"]);
    };

    const filteredValues = uniqueValues.filter(val =>
        String(val).toLowerCase().includes(filterSearch.toLowerCase())
    );

    const visibleValues = useMemo(() => {
        return filteredValues.slice(0, 100);
    }, [filteredValues]);

    const isSorted = sortBy === colId;
    const hasFilter = activeFilters !== undefined;

    return (
        <div className="flex items-center space-x-1.5 group select-none">
            <span
                onClick={() => handleSort(isSorted ? (sortOrder === "asc" ? "desc" : null) : "asc")}
                className="cursor-pointer font-bold hover:text-foreground/80 transition-colors flex items-center gap-1 py-1 text-xs"
            >
                {colName}
                {isSorted && (
                    sortOrder === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                )}
            </span>

            <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "w-5 h-5 p-0 rounded-md hover:bg-muted-foreground/10 shrink-0",
                            hasFilter ? "text-primary bg-primary/10" : "text-muted-foreground/60 hover:text-foreground transition-colors"
                        )}
                    >
                        <ListFilter className="w-3 h-3" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2 space-y-2 bg-popover/95 backdrop-blur-md border shadow-2xl" align="start">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                        Sort & Filter
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                        <Button
                            variant={isSorted && sortOrder === "asc" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleSort("asc")}
                            className="text-[10px] h-6 px-1.5"
                        >
                            Sort A-Z
                        </Button>
                        <Button
                            variant={isSorted && sortOrder === "desc" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleSort("desc")}
                            className="text-[10px] h-6 px-1.5"
                        >
                            Sort Z-A
                        </Button>
                    </div>

                    <div className="h-px bg-muted" />

                    <div className="space-y-1.5">
                        <Input
                            placeholder="Filter values..."
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                            className="h-6 text-[11px] px-2 py-0.5"
                        />

                        <div className="flex items-center justify-between text-[10px] px-1">
                            <button
                                onClick={handleSelectAllLocal}
                                className="text-primary hover:underline font-semibold"
                            >
                                Select All
                            </button>
                            <button
                                onClick={handleClearAllLocal}
                                className="text-muted-foreground hover:underline font-semibold"
                            >
                                Clear All
                            </button>
                        </div>

                        <div className="max-h-[120px] overflow-y-auto space-y-1 scrollbar-hide py-1 border-t border-b border-muted">
                            {visibleValues.length > 0 ? (
                                visibleValues.map((val, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center space-x-2 rounded-md px-1 py-0.5 hover:bg-muted/50 text-[11px]"
                                    >
                                        <Checkbox
                                            checked={isCheckedLocal(val)}
                                            onCheckedChange={() => toggleValueLocal(val)}
                                            className="w-3.5 h-3.5"
                                        />
                                        <span 
                                            className="truncate max-w-[140px] cursor-pointer select-none" 
                                            title={val}
                                            onClick={() => toggleValueLocal(val)}
                                        >
                                            {val === "" ? <em className="text-muted-foreground/60">(Blank)</em> : val}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center text-[10px] text-muted-foreground py-1">
                                    No values
                                </div>
                            )}
                        </div>
                        {filteredValues.length > 100 && (
                            <div className="text-[9px] text-muted-foreground text-center pt-0.5 italic select-none">
                                Showing first 100 of {filteredValues.length} values. Search to refine.
                            </div>
                        )}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

const sourceConfig: Record<string, {
    label: string;
    bgColor: string;
    borderColor: string;
    borderLeft: string;
    textColor: string;
    icon: React.ComponentType<{ className?: string }>;
}> = {
    variable: {
        label: "Variable",
        bgColor: "bg-emerald-500/5 hover:bg-emerald-500/10",
        borderColor: "border-emerald-500/15 hover:border-emerald-500/30",
        borderLeft: "border-l-emerald-500/70",
        textColor: "text-emerald-400",
        icon: Database
    },
    request_body: {
        label: "Req Body",
        bgColor: "bg-purple-500/5 hover:bg-purple-500/10",
        borderColor: "border-purple-500/15 hover:border-purple-500/30",
        borderLeft: "border-l-purple-500/70",
        textColor: "text-purple-400",
        icon: ArrowUpRight
    },
    request_param: {
        label: "Req Param",
        bgColor: "bg-cyan-500/5 hover:bg-cyan-500/10",
        borderColor: "border-cyan-500/15 hover:border-cyan-500/30",
        borderLeft: "border-l-cyan-500/70",
        textColor: "text-cyan-400",
        icon: ArrowUpRight
    },
    response: {
        label: "Response",
        bgColor: "bg-indigo-500/5 hover:bg-indigo-500/10",
        borderColor: "border-indigo-500/15 hover:border-indigo-500/30",
        borderLeft: "border-l-indigo-500/70",
        textColor: "text-indigo-400",
        icon: ArrowDownLeft
    },
    status: {
        label: "Status Code",
        bgColor: "bg-sky-500/5 hover:bg-sky-500/10",
        borderColor: "border-sky-500/15 hover:border-sky-500/30",
        borderLeft: "border-l-sky-500/70",
        textColor: "text-sky-400",
        icon: Activity
    },
    error: {
        label: "Error Msg",
        bgColor: "bg-rose-500/5 hover:bg-rose-500/10",
        borderColor: "border-rose-500/15 hover:border-rose-500/30",
        borderLeft: "border-l-rose-500/70",
        textColor: "text-rose-400",
        icon: AlertCircle
    },
    response_time: {
        label: "Duration",
        bgColor: "bg-amber-500/5 hover:bg-amber-500/10",
        borderColor: "border-amber-500/15 hover:border-amber-500/30",
        borderLeft: "border-l-amber-500/70",
        textColor: "text-amber-400",
        icon: Clock
    },
    modified: {
        label: "Modified",
        bgColor: "bg-pink-500/5 hover:bg-pink-500/10",
        borderColor: "border-pink-500/15 hover:border-pink-500/30",
        borderLeft: "border-l-pink-500/70",
        textColor: "text-pink-400",
        icon: Sparkles
    }
};

const ColumnMappingRow = React.memo(function ColumnMappingRow({
    col,
    idx,
    originalHeaders,
    templates,
    results,
    onUpdate,
    onRemove,
}: {
    col: ColumnMapping;
    idx: number;
    originalHeaders: string[];
    templates: any[];
    results: any[];
    onUpdate: (index: number, updates: Partial<ColumnMapping>) => void;
    onRemove: (index: number) => void;
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:space-x-2 items-stretch sm:items-center flex-wrap gap-2 sm:gap-y-2 bg-neutral-900/30 p-2.5 rounded-lg border border-white/5">
            <Input
                value={col.name}
                onChange={(e) => onUpdate(idx, { name: e.target.value })}
                placeholder="Column Name"
                className="w-full sm:w-[180px] bg-neutral-950 border-white/10 text-white"
            />
            <Select value={col.source} onValueChange={(val: any) => onUpdate(idx, { source: val, path: "", stepId: undefined })}>
                <SelectTrigger className="w-full sm:w-[150px] bg-neutral-950 border-white/10 text-white">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-950 border-white/10 text-white">
                    <SelectItem value="variable">Variable (Row)</SelectItem>
                    <SelectItem value="request_body">Request Body</SelectItem>
                    <SelectItem value="request_param">Request Param</SelectItem>
                    <SelectItem value="response">Response JSON</SelectItem>
                    <SelectItem value="status">Status Code</SelectItem>
                    <SelectItem value="error">Error Message</SelectItem>
                    <SelectItem value="response_time">Response Time (ms)</SelectItem>
                    <SelectItem value="modified">Modified (true/false)</SelectItem>
                </SelectContent>
            </Select>
            {col.source === "variable" && (
                <SearchableSelect
                    value={col.path || ""}
                    onChange={(val) => onUpdate(idx, { path: val })}
                    options={originalHeaders.map(h => ({ label: h, value: h }))}
                    placeholder="Select variable"
                    className="w-full sm:w-[160px] bg-neutral-950 border-white/10 text-white"
                />
            )}
            {col.source === "request_param" && (() => {
                const allParams = Array.from(
                    new Set(templates.flatMap(t => (t.params || []).map((p: { key: string }) => p.key).filter(Boolean)))
                );
                return (
                    <>
                        {templates.length > 1 && (
                            <SearchableSelect
                                value={col.stepId || ""}
                                onChange={(val) => onUpdate(idx, { stepId: val || undefined })}
                                options={[{ label: "All", value: "" }, ...templates.map((t, i) => ({ label: `Step ${i + 1}: ${t.name}`, value: t.id }))]}
                                placeholder="All steps"
                                className="w-full sm:w-[140px] bg-neutral-950 border-white/10 text-white"
                            />
                        )}
                        <SearchableSelect
                            value={col.path || ""}
                            onChange={(val) => onUpdate(idx, { path: val })}
                            options={allParams.map(p => ({ label: p, value: p }))}
                            placeholder="Select param"
                            className="w-full sm:w-[160px] bg-neutral-950 border-white/10 text-white"
                        />
                    </>
                );
            })()}
            {(col.source === "request_body" || col.source === "response") && (
                <>
                    {templates.length > 1 && (
                        <SearchableSelect
                            value={col.stepId || ""}
                            onChange={(val) => onUpdate(idx, { stepId: val || undefined })}
                            options={[{ label: "All (Last)", value: "" }, ...templates.map((t, i) => ({ label: `Step ${i + 1}: ${t.name}`, value: t.id }))]}
                            placeholder="All / Last"
                            className="w-full sm:w-[140px] bg-neutral-950 border-white/10 text-white"
                        />
                    )}
                    <PathAutocompleteInput
                        value={col.path || ""}
                        onChange={(val) => onUpdate(idx, { path: val })}
                        placeholder={col.source === "request_body" ? "e.g. name" : "e.g. data.id"}
                        col={col}
                        results={results}
                    />
                </>
            )}
            {col.source === "response_time" && (
                <>
                    {templates.length > 1 ? (
                        <SearchableSelect
                            value={col.stepId || ""}
                            onChange={(val) => onUpdate(idx, { stepId: val || undefined })}
                            options={[{ label: "All (Last)", value: "" }, ...templates.map((t, i) => ({ label: `Step ${i + 1}: ${t.name}`, value: t.id }))]}
                            placeholder="All / Last"
                            className="w-full sm:w-[140px] bg-neutral-950 border-white/10 text-white"
                        />
                    ) : null}
                    <div className="flex-1 text-xs text-muted-foreground flex items-center px-3 border border-transparent">
                        Automatic Value (Response Time)
                    </div>
                </>
            )}
            {(col.source === "status" || col.source === "error" || col.source === "modified") && (
                <div className="flex-1 text-xs text-muted-foreground flex items-center px-3 border border-transparent">
                    Automatic Value
                </div>
            )}
            <Button
                variant="ghost"
                size="icon"
                onClick={() => onUpdate(idx, { visible: col.visible !== false ? false : true })}
                className={cn(
                    "shrink-0",
                    col.visible !== false 
                        ? "text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/20" 
                        : "text-muted-foreground hover:text-rose-400 hover:bg-rose-950/20"
                )}
                title={col.visible !== false ? "Hide column from table & export" : "Show column in table & export"}
            >
                {col.visible !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onRemove(idx)} className="text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="w-4 h-4" />
            </Button>
        </div>
    );
});

const ResultsTableView = React.memo(function ResultsTableView({
    data,
    columns,
    tableFilterConfig,
    onRowClick,
}: {
    data: any[];
    columns: ColumnDef<any>[];
    tableFilterConfig: TableFilterConfig;
    onRowClick: (row: any) => void;
}) {

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        autoResetPageIndex: false,
        initialState: {
            pagination: { pageSize: 20 },
        }
    });

    useEffect(() => {
        table.setPageIndex(0);
    }, [tableFilterConfig.searchQuery, tableFilterConfig.columnFilters, table]);

    return (
        <div className="space-y-4">
            {/* Search & Global Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-lg bg-muted/20 border border-muted-foreground/10">
                <div className="relative flex-1">
                    <Input
                        placeholder={tableFilterConfig.isRegex ? "Search using Regex..." : "Search all columns..."}
                        value={tableFilterConfig.searchQuery}
                        onChange={(e) => setTableFilterConfig({ searchQuery: e.target.value })}
                        className="pr-10 h-9 text-xs"
                    />
                    {tableFilterConfig.searchQuery && (
                        <button
                            onClick={() => setTableFilterConfig({ searchQuery: "" })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[10px] font-bold"
                        >
                            Clear
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant={tableFilterConfig.isRegex ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTableFilterConfig({ isRegex: !tableFilterConfig.isRegex })}
                        className="font-mono text-xs h-9"
                    >
                        .* Regex
                    </Button>
                    {Object.keys(tableFilterConfig.columnFilters).length > 0 || tableFilterConfig.searchQuery || tableFilterConfig.sortBy ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTableFilterConfig({
                                searchQuery: "",
                                columnFilters: {},
                                sortBy: null,
                                sortOrder: null,
                            })}
                            className="text-muted-foreground hover:text-destructive text-xs h-9"
                        >
                            Reset Filters
                        </Button>
                    ) : null}
                </div>
            </div>

            {/* Data Table */}
            <div className="relative rounded-md border overflow-x-auto w-full min-h-[450px]">
                <Table className="transition-opacity duration-300">
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className={cn(
                                        "cursor-pointer",
                                        row.original.__isModified && "bg-yellow-500/10 hover:bg-yellow-500/20 data-[state=selected]:bg-yellow-500/20"
                                    )}
                                    onClick={() => onRowClick(row.original)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    No results mapped.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <span>Show</span>
                    <Select
                        value={String(table.getState().pagination.pageSize)}
                        onValueChange={(val) => table.setPageSize(Number(val))}
                    >
                        <SelectTrigger className="w-[70px] h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[20, 50, 100].map(pageSize => (
                                <SelectItem key={pageSize} value={String(pageSize)}>
                                    {pageSize}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span>rows per page</span>
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        Previous
                    </Button>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground w-auto">
                        Page
                        <Input
                            type="number"
                            min={1}
                            max={table.getPageCount() || 1}
                            value={table.getState().pagination.pageIndex + 1}
                            onChange={(e) => {
                                const page = e.target.value ? Number(e.target.value) - 1 : 0;
                                table.setPageIndex(page);
                            }}
                            className="h-7 w-12 px-2 py-0 text-center font-medium bg-background border-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-primary/50"
                        />
                        of {table.getPageCount() || 1}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
});

function ColumnMappingsDialogContent({
    initialMappings,
    originalHeaders,
    templates,
    results,
    onSave,
    onClose,
    isOpen,
}: {
    initialMappings: ColumnMapping[];
    originalHeaders: string[];
    templates: any[];
    results: any[];
    onSave: (mappings: ColumnMapping[]) => void;
    onClose: () => void;
    isOpen: boolean;
}) {
    return (
        <DialogContent className="w-[95vw] max-w-[95vw] sm:!max-w-[90vw] md:!max-w-[85vw] h-[85vh] flex flex-col overflow-hidden bg-neutral-950 text-white border-neutral-800">
            {isOpen && (
                <ColumnMappingsDialogInner
                    initialMappings={initialMappings}
                    originalHeaders={originalHeaders}
                    templates={templates}
                    results={results}
                    onSave={onSave}
                    onClose={onClose}
                />
            )}
        </DialogContent>
    );
}

function ColumnMappingRowSkeleton() {
    return (
        <div className="flex flex-col sm:flex-row sm:space-x-2 items-center flex-wrap gap-2 bg-neutral-900/30 p-2.5 rounded-lg border border-white/5 animate-pulse min-h-[58px]">
            <div className="w-full sm:w-[180px] h-9 bg-neutral-800/40 rounded-md" />
            <div className="w-full sm:w-[150px] h-9 bg-neutral-800/40 rounded-md" />
            <div className="flex-1 h-9 bg-neutral-800/40 rounded-md min-w-[120px]" />
            <div className="w-9 h-9 bg-neutral-800/40 rounded-md shrink-0" />
            <div className="w-9 h-9 bg-neutral-800/40 rounded-md shrink-0" />
        </div>
    );
}

function ColumnMappingsDialogInner({
    initialMappings,
    originalHeaders,
    templates,
    results,
    onSave,
    onClose,
}: {
    initialMappings: ColumnMapping[];
    originalHeaders: string[];
    templates: any[];
    results: any[];
    onSave: (mappings: ColumnMapping[]) => void;
    onClose: () => void;
}) {
    const [draftMappings, setDraftMappings] = useState<ColumnMapping[]>(() => initialMappings);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsReady(true);
        }, 150);
        return () => clearTimeout(timer);
    }, []);

    const addDraftColumnMapping = useCallback(() => {
        setDraftMappings((prev) => [
            ...prev,
            {
                id: `col_${Math.random().toString(36).substring(2, 10)}`,
                name: `Column ${prev.length + 1}`,
                source: "variable",
                path: originalHeaders[0] || "",
                visible: true
            }
        ]);
    }, [originalHeaders]);

    const updateDraftColumnMapping = useCallback((index: number, updates: Partial<ColumnMapping>) => {
        setDraftMappings((prev) => {
            if (index < 0 || index >= prev.length) return prev;
            const newMappings = [...prev];
            newMappings[index] = { ...newMappings[index], ...updates };
            return newMappings;
        });
    }, []);

    const removeDraftColumnMapping = useCallback((index: number) => {
        setDraftMappings((prev) => prev.filter((_, i) => i !== index));
    }, []);

    return (
        <>
            <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    <Settings className="w-5 h-5 text-indigo-400" />
                    <span>Configure Column Mappings</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-400">
                    Define the mappings to extract values from variables or API results and render them as columns.
                </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-4 min-h-0 border-t border-b border-white/5 my-2">
                <div className="space-y-3">
                    {!isReady ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <ColumnMappingRowSkeleton key={i} />
                        ))
                    ) : (
                        <>
                            {draftMappings.map((col, idx) => (
                                <ColumnMappingRow
                                    key={col.id || idx}
                                    col={col}
                                    idx={idx}
                                    originalHeaders={originalHeaders}
                                    templates={templates}
                                    results={results}
                                    onUpdate={updateDraftColumnMapping}
                                    onRemove={removeDraftColumnMapping}
                                />
                            ))}
                            {draftMappings.length === 0 && (
                                <div className="text-center py-8 text-sm text-muted-foreground">
                                    No columns mapped. Click "Add Column" below to map a new column.
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 flex items-end justify-between pt-2 shrink-0 max-h-10">
                <Button variant="outline" size="sm" onClick={addDraftColumnMapping} className="border-dashed bg-transparent border-white/10 hover:bg-neutral-900 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Column
                </Button>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onClose}
                        className="bg-transparent border-white/10 hover:bg-neutral-900 text-white"
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={() => onSave(draftMappings)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        Done
                    </Button>
                </div>
            </div>
        </>
    );
}

export function ResultsTable() {
    const results = useStore(store, (state) => state.results);
    const fileData = useStore(store, (state) => state.fileData);
    const originalHeaders = useStore(store, (state) => state.headers);
    const templates = useStore(store, (state) => state.templates);
    const columnMappings = useStore(store, (state) => state.columnMappings);
    const tableFilterConfig = useStore(store, (state) => state.tableFilterConfig);
    const fileName = useStore(store, (state) => state.fileName);

    const [selectedDetail, setSelectedDetail] = useState<{ rowId: number; iteration: number } | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
    const [isDetailsReady, setIsDetailsReady] = useState(false);

    useEffect(() => {
        if (isDialogOpen) {
            const timer = setTimeout(() => {
                setIsDetailsReady(true);
            }, 200);
            return () => clearTimeout(timer);
        } else {
            setIsDetailsReady(false);
        }
    }, [isDialogOpen]);

    const handleOpenMappingDialog = () => {
        setIsMappingDialogOpen(true);
    };

    const handleRowClick = useCallback((original: any) => {
        setSelectedDetail({ rowId: original.__id, iteration: original.__iteration ?? 1 });
        setIsDialogOpen(true);
    }, []);

    const handleSaveMapping = useCallback((updatedMappings: ColumnMapping[]) => {
        setColumnMappings(updatedMappings);
        setIsMappingDialogOpen(false);
    }, []);

    const handleCloseMapping = useCallback(() => {
        setIsMappingDialogOpen(false);
    }, []);


    // Edit/Rerun states
    const [isEditing, setIsEditing] = useState(false);
    const [editMethod, setEditMethod] = useState("GET");
    const [editUrl, setEditUrl] = useState("");
    const [editParams, setEditParams] = useState<{ key: string; value: string }[]>([]);
    const [editHeaders, setEditHeaders] = useState<{ key: string; value: string }[]>([]);
    const [editBody, setEditBody] = useState("");
    const [isRerunning, setIsRerunning] = useState(false);
    const [selectedTimestamp, setSelectedTimestamp] = useState<string | null>(null);
    const [activeStepId, setActiveStepId] = useState<string>("");
    const [isMakeNewRowOpen, setIsMakeNewRowOpen] = useState(false);
    const [targetRowNum, setTargetRowNum] = useState<number>(1);
    const [insertPosition, setInsertPosition] = useState<"before" | "after">("after");

    const getRowSignature = (rowId: number): string => {
        const rowData = fileData[rowId];
        if (!rowData) return "";
        const keys = Object.keys(rowData).filter(k => !k.startsWith("__"));
        if (keys.length === 0) return "No variables";
        return keys.map(k => `${k}=${rowData[k]}`).join(", ");
    };

    // Resolve IP address using Cloudflare DNS JSON API
    const resolveHostnameIpClient = async (urlStr: string): Promise<string | null> => {
        try {
            const urlObj = new URL(urlStr);
            const hostname = urlObj.hostname;
            if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname === "localhost" || hostname.endsWith(".local")) {
                return null;
            }
            const dnsUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
            const res = await fetch(dnsUrl, {
                headers: { "accept": "application/dns-json" }
            });
            if (res.ok) {
                const dnsData = await res.json();
                if (dnsData && dnsData.Answer && dnsData.Answer.length > 0) {
                    const aRecord = dnsData.Answer.find((ans: any) => ans.type === 1);
                    if (aRecord) {
                        return aRecord.data;
                    }
                }
            }
        } catch (e) {}
        return null;
    };

    // Helper to format timestamps down to the second
    const formatTimestamp = (isoString?: string) => {
        if (!isoString) return "Unknown Time";
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return "Unknown Time";
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        } catch (e) {
            return "Unknown Time";
        }
    };

    const matchingResults = useMemo(() => {
        if (selectedDetail === null) return [];
        const filtered = results.filter(
            (r) =>
                r.rowId === selectedDetail.rowId &&
                (r.iteration ?? 1) === selectedDetail.iteration
        );
        // Explicitly sort chronologically by timestamp (ascending)
        return [...filtered].sort((a, b) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeA - timeB;
        });
    }, [results, selectedDetail]);

    const activeInstance = useMemo(() => {
        const active = matchingResults.find((r) => r.active);
        return active || matchingResults[matchingResults.length - 1];
    }, [matchingResults]);

    const currentResult = useMemo(() => {
        if (!selectedTimestamp) return activeInstance;
        return matchingResults.find((r) => r.timestamp === selectedTimestamp) || activeInstance;
    }, [matchingResults, selectedTimestamp, activeInstance]);

    // Initialize/sync selectedTimestamp when the dialog opens or row selection changes
    useEffect(() => {
        if (selectedDetail !== null && isDialogOpen) {
            if (activeInstance) {
                setSelectedTimestamp(activeInstance.timestamp || null);
            } else {
                setSelectedTimestamp(null);
            }
            setIsEditing(false);
            setIsMakeNewRowOpen(false); // Reset row insertion states
        }
    }, [selectedDetail, isDialogOpen, activeInstance]);

    // Initialize/sync activeStepId when result instance changes
    useEffect(() => {
        if (selectedDetail !== null && isDialogOpen && currentResult) {
            const steps = currentResult.steps || [];
            if (steps.length > 0) {
                setActiveStepId(steps[0].stepId);
            } else {
                setActiveStepId("legacy");
            }
            setIsEditing(false);
        }
    }, [selectedDetail, isDialogOpen, currentResult]);

    // Find the step we are looking at
    const currentStep = useMemo(() => {
        if (!currentResult) return null;
        if (activeStepId === "legacy") return currentResult;
        return (currentResult.steps || []).find(s => s.stepId === activeStepId) || null;
    }, [currentResult, activeStepId]);

    const selectValue = useMemo(() => {
        if (!currentResult) return "";
        const idx = matchingResults.indexOf(currentResult);
        return currentResult.timestamp || `temp_${idx >= 0 ? idx : 0}`;
    }, [matchingResults, currentResult]);

    // Sync editing form fields when currentStep changes
    useEffect(() => {
        if (isDialogOpen && currentStep) {
            setEditMethod(currentStep.requestMethod || "GET");
            setEditUrl(currentStep.requestUrl || "");
            
            const paramsArray = Object.entries(currentStep.requestParams || {}).map(([k, v]) => ({ key: k, value: v }));
            setEditParams(paramsArray.length > 0 ? paramsArray : [{ key: "", value: "" }]);

            const headersArray = Object.entries(currentStep.requestHeaders || {}).map(([k, v]) => ({ key: k, value: v }));
            setEditHeaders(headersArray.length > 0 ? headersArray : [{ key: "", value: "" }]);

            setEditBody(formatBody(currentStep.requestBody));
        }
    }, [isDialogOpen, currentStep]);

    const handleRerunExecute = async () => {
        if (!editUrl.trim()) {
            toast.error("URL is required");
            return;
        }
        
        setIsRerunning(true);
        
        try {
            let url = editUrl;
            const queryParts = editParams
                .filter(p => p.key.trim())
                .map(p => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value)}`)
                .join("&");
            if (queryParts) {
                url += (url.includes('?') ? '&' : '?') + queryParts;
            }

            const headers = new Headers();
            const reqHeaders: Record<string, string> = {};
            editHeaders.forEach(h => {
                if (h.key.trim()) {
                    headers.append(h.key.trim(), h.value);
                    reqHeaders[h.key.trim()] = h.value;
                }
            });

            let bodyInit: any = null;
            let requestBodyForLog: any = null;
            if (editMethod !== "GET" && editMethod !== "HEAD" && editBody.trim()) {
                bodyInit = editBody;
                requestBodyForLog = editBody;
                const hasContentType = Object.keys(reqHeaders).some(k => k.toLowerCase() === "content-type");
                if (!hasContentType) {
                    headers.append("Content-Type", "application/json");
                    reqHeaders["Content-Type"] = "application/json";
                }
                if (reqHeaders["Content-Type"]?.includes("application/json")) {
                    const cleaned = stripJsonComments(editBody);
                    bodyInit = cleaned;
                    try {
                        requestBodyForLog = JSON.parse(cleaned);
                    } catch (e) {
                        requestBodyForLog = editBody;
                    }
                }
            }

            const startTime = performance.now();
            let statusCode = 0;
            let responseStatusText = "";
            let responseHeaders: Record<string, string> = {};
            let responseBody: any = null;
            let errorMsg: string | undefined = undefined;
            let responseType = "";
            let responseRedirected = false;
            let ipAddress: string | null = null;

            const isExtensionActive = typeof document !== "undefined" &&
                document.documentElement.getAttribute("data-surge-extension-active") === "true";

            let extensionRuleId: number | null = null;
            if (isExtensionActive) {
                try {
                    let urlFilter = "*";
                    try {
                        let urlStr = url.trim();
                        if (!/^https?:\/\//i.test(urlStr)) {
                            urlStr = "http://" + urlStr;
                        }
                        const parsed = new URL(urlStr);
                        urlFilter = parsed.hostname;
                    } catch (e) {}

                    const extHeaders = Object.entries(reqHeaders).map(([key, value]) => ({
                        name: key,
                        value: value
                    }));

                    const res = await sendToExtension({
                        action: "setupRequestRules",
                        urlFilter,
                        headers: extHeaders,
                        initiatorOrigin: window.location.origin
                    });
                    if (res && res.success) {
                        extensionRuleId = res.ruleId;
                    }
                } catch (e) {
                    console.warn("Failed to setup extension rules for rerun:", e);
                }
            }

            try {
                try {
                    const res = await fetch(url, {
                        method: editMethod,
                        headers,
                        body: bodyInit
                    });

                    statusCode = res.status;
                    responseStatusText = res.statusText;
                    responseType = res.type;
                    responseRedirected = res.redirected;

                    res.headers.forEach((val, key) => {
                        responseHeaders[key] = val;
                    });

                    try {
                        ipAddress = await resolveHostnameIpClient(url);
                    } catch (e) {}

                    const contentType = res.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        responseBody = await res.json();
                    } else {
                        responseBody = await res.text();
                    }

                    if (!res.ok) {
                        errorMsg = `HTTP ${res.status}`;
                    }
                } finally {
                    if (extensionRuleId !== null) {
                        try {
                            await sendToExtension({
                                action: "clearRequestRules",
                                ruleId: extensionRuleId
                            });
                        } catch (e) {
                            console.warn("Failed to clear extension rules for rerun:", e);
                        }
                    }
                }
            } catch (err: any) {
                errorMsg = err.message || String(err);
            } finally {
                const responseTimeMs = Math.round(performance.now() - startTime);
                
                const updatedStepResult: StepResult = {
                    stepId: activeStepId,
                    stepName: (currentStep as any)?.stepName || "Request",
                    statusCode,
                    responseTimeMs,
                    requestUrl: url,
                    requestMethod: editMethod,
                    requestHeaders: reqHeaders,
                    requestParams: editParams.filter(p => p.key.trim()).reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {}),
                    requestBody: requestBodyForLog,
                    responseBody,
                    responseHeaders,
                    responseType,
                    responseRedirected,
                    responseStatusText,
                    ipAddress,
                    error: errorMsg
                };

                const newTimestamp = new Date().toISOString();
                
                saveRerunResult(
                    selectedDetail!.rowId,
                    selectedDetail!.iteration ?? 1,
                    activeStepId,
                    updatedStepResult,
                    newTimestamp
                );
                
                setSelectedTimestamp(newTimestamp);
                setIsEditing(false);
                toast.success("Rerun completed successfully!");
            }
        } catch (err: any) {
            toast.error(`Rerun failed: ${err.message || err}`);
        } finally {
            setIsRerunning(false);
        }
    };

    const activeResults = useMemo(() => {
        const groups: Record<string, ExecutionResult[]> = {};
        results.forEach((res) => {
            const key = `${res.rowId}_${res.iteration ?? 1}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(res);
        });

        const activeList: ExecutionResult[] = [];
        Object.values(groups).forEach((list) => {
            const activeRes = list.find((r) => r.active) || list[list.length - 1];
            if (activeRes) {
                activeList.push(activeRes);
            }
        });

        return activeList.sort((a, b) => {
            if (a.rowId !== b.rowId) return a.rowId - b.rowId;
            return (a.iteration ?? 1) - (b.iteration ?? 1);
        });
    }, [results]);

    const rawTableData = useMemo(() => {
        // Pre-calculate runs count per rowId and iteration using a lookup map
        const runsCountMap = new Map<string, number>();
        results.forEach(r => {
            const runKey = `${r.rowId}_${r.iteration ?? 1}`;
            runsCountMap.set(runKey, (runsCountMap.get(runKey) || 0) + 1);
        });

        return activeResults.map((res) => {
            const rowData = fileData[res.rowId] || {};
            const rowMap: Record<string, any> = {};
            const runKey = `${res.rowId}_${res.iteration ?? 1}`;
            const runsCount = runsCountMap.get(runKey) || 0;
            const isModified = runsCount > 1;

            columnMappings.forEach((col, idx) => {
                const key = col.id || `col_${idx}`;
                if (col.source === "status") {
                    rowMap[key] = res.status === "pending" ? "Pending" : res.statusCode;
                } else if (col.source === "error") {
                    rowMap[key] = res.error || "";
                } else if (col.source === "response_time") {
                    const steps = res.steps || [];
                    const step = col.stepId
                        ? steps.find(s => s.stepId === col.stepId)
                        : steps[steps.length - 1];
                    if (step) {
                        rowMap[key] = `${step.responseTimeMs} ms`;
                    } else {
                        rowMap[key] = res.status === "pending" ? "..." : `${res.responseTimeMs} ms`;
                    }
                } else if (col.source === "variable") {
                    rowMap[key] = rowData[col.path] ?? "";
                } else if (col.source === "request_body") {
                    const steps = res.steps || [];
                    const step = col.stepId
                        ? steps.find(s => s.stepId === col.stepId)
                        : steps[0];
                    rowMap[key] = step?.requestBody
                        ? getByDotNotation(step.requestBody, col.path)
                        : "";
                } else if (col.source === "request_param") {
                    const steps = res.steps || [];
                    const step = col.stepId
                        ? steps.find(s => s.stepId === col.stepId)
                        : steps[0];
                    rowMap[key] = (step?.requestParams?.[col.path] ?? rowData[col.path]) ?? "";
                } else if (col.source === "response") {
                    const steps = res.steps || [];
                    const step = col.stepId
                        ? steps.find(s => s.stepId === col.stepId)
                        : steps[steps.length - 1];
                    const body = step?.responseBody ?? res.responseBody;
                    if (body !== undefined && body !== null) {
                        rowMap[key] = getByDotNotation(body, col.path);
                    } else {
                        rowMap[key] = res.status === "pending" ? "..." : "";
                    }
                } else if (col.source === "modified") {
                    rowMap[key] = isModified ? "modified" : "original";
                }
            });
            rowMap.__isModified = isModified;
            rowMap.__status = res.status;
            rowMap.__id = res.rowId;
            rowMap.__iteration = res.iteration;
            return rowMap;
        });
    }, [results, activeResults, fileData, columnMappings]);

    const data = useMemo(() => {
        let filtered = [...rawTableData];

        Object.entries(tableFilterConfig.columnFilters).forEach(([colKey, allowedValues]) => {
            if (allowedValues !== undefined) {
                filtered = filtered.filter(row => {
                    const val = String(row[colKey] ?? "");
                    return allowedValues.includes(val);
                });
            }
        });

        if (tableFilterConfig.searchQuery.trim()) {
            const query = tableFilterConfig.searchQuery.trim();
            if (tableFilterConfig.isRegex) {
                try {
                    const regex = new RegExp(query, "i");
                    filtered = filtered.filter(row => {
                        return Object.keys(row).some(key => {
                            if (key.startsWith("__")) return false;
                            return regex.test(String(row[key] ?? ""));
                        });
                    });
                } catch (e) {
                    const lowerQuery = query.toLowerCase();
                    filtered = filtered.filter(row => {
                        return Object.keys(row).some(key => {
                            if (key.startsWith("__")) return false;
                            return String(row[key] ?? "").toLowerCase().includes(lowerQuery);
                        });
                    });
                }
            } else {
                const lowerQuery = query.toLowerCase();
                filtered = filtered.filter(row => {
                    return Object.keys(row).some(key => {
                        if (key.startsWith("__")) return false;
                        return String(row[key] ?? "").toLowerCase().includes(lowerQuery);
                    });
                });
            }
        }

        if (tableFilterConfig.sortBy && tableFilterConfig.sortOrder) {
            const { sortBy, sortOrder } = tableFilterConfig;
            filtered.sort((a, b) => {
                const valA = a[sortBy];
                const valB = b[sortBy];

                const numA = parseFloat(String(valA).replace(/[^\d.]/g, ''));
                const numB = parseFloat(String(valB).replace(/[^\d.]/g, ''));
                const isNumA = !isNaN(numA) && isFinite(numA);
                const isNumB = !isNaN(numB) && isFinite(numB);

                let comp = 0;
                if (isNumA && isNumB) {
                    comp = numA - numB;
                } else {
                    comp = String(valA).localeCompare(String(valB));
                }

                return sortOrder === "asc" ? comp : -comp;
            });
        }

        return filtered;
    }, [rawTableData, tableFilterConfig]);

    const columns = useMemo<ColumnDef<any>[]>(() => {
        const dynamicCols: ColumnDef<any>[] = [];
 
        // Prepend built-in Row # / Run Grouping Column
        dynamicCols.push({
            id: "row_number",
            header: "Row #",
            cell: ({ row }) => {
                const rowNum = row.original.__id + 1;
                const iter = row.original.__iteration ?? 1;
                return (
                    <div className="font-mono text-xs font-bold text-foreground/80 select-none">
                        {rowNum}#{iter}
                    </div>
                );
            }
        });
 
        columnMappings.forEach((col, idx) => {
            if (col.visible === false) return;
            const colId = col.id || `col_${idx}`;
            const colName = col.name || `Column ${idx + 1}`;
            dynamicCols.push({
                id: colId,
                accessorKey: colId,
                header: () => (
                    <ColumnHeaderWithFilter
                        colId={colId}
                        colName={colName}
                        rawTableData={rawTableData}
                    />
                ),
                cell: (info) => {
                    const value = info.getValue() as string | number;
                    if (col.source === "status") {
                        if (value === "Pending") {
                            return <Badge variant="secondary" className="animate-pulse px-3">Pending...</Badge>;
                        }
                        const status = Number(value);
                        return (
                            <Badge variant={status >= 200 && status < 300 ? "default" : status === 0 ? "outline" : "destructive"}>
                                {status || "Error"}
                            </Badge>
                        );
                    }
                    if (col.source === "modified") {
                        const isMod = value === "modified";
                        return (
                            <Badge variant={isMod ? "default" : "outline"} className={isMod ? "bg-amber-500/20 text-amber-500 border-amber-500/30 hover:bg-amber-500/20" : "text-neutral-500 border-neutral-800"}>
                                {isMod ? "modified" : "original"}
                            </Badge>
                        );
                    }
                    const stringValue = String(value ?? "");
                    if (!stringValue) return null;
                    return (
                        <CopyableText
                            value={stringValue}
                            className="max-w-[200px] text-xs"
                        />
                    );
                }
            });
        });

        return dynamicCols;
    }, [columnMappings, rawTableData]);



    const executeExport = (onlyFiltered: boolean) => {
        const dataToExport = onlyFiltered ? data : rawTableData;
        if (dataToExport.length === 0) {
            alert("No results to export.");
            return;
        }

        const exportData = dataToExport.map(row => {
            const cleanRow: Record<string, any> = {};
            cleanRow["Source Row"] = row.__id + 1;
            cleanRow["Run Iteration"] = row.__iteration ?? 1;
            columnMappings.forEach((col, idx) => {
                if (col.visible === false) return;
                const colName = col.name || `Column ${idx + 1}`;
                const finalName = cleanRow[colName] !== undefined ? `${colName} (${idx})` : colName;
                const colId = col.id || `col_${idx}`;
                cleanRow[finalName] = row[colId];
            });
            return cleanRow;
        });

        const formatDateTime = (date: Date) => {
            const pad = (n: number) => String(n).padStart(2, "0");
            const yyyy = date.getFullYear();
            const mm = pad(date.getMonth() + 1);
            const dd = pad(date.getDate());
            const hh = pad(date.getHours());
            const min = pad(date.getMinutes());
            const ss = pad(date.getSeconds());
            return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
        };

        const getFileNameWithoutExtension = (name: string) => {
            if (!name) return "data";
            const lastDotIndex = name.lastIndexOf(".");
            if (lastDotIndex === -1) return name;
            return name.substring(0, lastDotIndex);
        };

        const timeStamp = formatDateTime(new Date());
        const cleanFileName = getFileNameWithoutExtension(fileName);
        const filtered = onlyFiltered ? "_filtered" : "";
        const exportFileName = `surge${filtered}_result_${timeStamp}_${cleanFileName}.xlsx`;

        const worksheet = xlsx.utils.json_to_sheet(exportData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Results");
        xlsx.writeFile(workbook, exportFileName);
    };

    const handleExport = () => {
        if (rawTableData.length === 0) return;

        const hasActiveFilters = !!(
            tableFilterConfig.searchQuery.trim() ||
            Object.keys(tableFilterConfig.columnFilters).length > 0
        );

        if (hasActiveFilters) {
            setExportDialogOpen(true);
        } else {
            executeExport(false);
        }
    };


    return (
        <Card className="w-full shadow-lg shadow-black/5 rounded-xl bg-card/60 backdrop-blur-sm border-muted-foreground/20">
            <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                        <CardTitle className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                            Results & Mapping
                        </CardTitle>
                        <CardDescription>Map the API execution results into columns, then export.</CardDescription>
                    </div>
                    <Button onClick={handleExport}>
                        <Download className="w-4 h-4 mr-2" />
                        Export to Excel
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Mapping Configurator Summary */}
                <div
                    onClick={handleOpenMappingDialog}
                    className="group flex flex-col gap-3.5 p-5 rounded-xl bg-neutral-900/40 border border-white/5 hover:border-indigo-500/30 hover:bg-neutral-900/60 transition-all duration-300 cursor-pointer shadow-sm relative overflow-hidden"
                >
                    {/* Subtle glow effect */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-all duration-300" />
                    
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:scale-105 transition-transform duration-300">
                                <Settings className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-xs uppercase tracking-wider font-bold text-white/40">Active Column Mappings</h4>
                                <p className="text-xs text-white/80 group-hover:text-indigo-400 transition-colors mt-0.5 font-medium">
                                    {columnMappings.length} {columnMappings.length === 1 ? "Column" : "Columns"} configured to format the results table
                                </p>
                            </div>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 group-hover:bg-indigo-650 group-hover:text-white transition-all duration-300">
                            Configure
                        </span>
                    </div>

                    {/* Summary Node Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 pt-1">
                        {columnMappings.map((col, idx) => {
                            const isVisible = col.visible !== false;
                            const cfg = sourceConfig[col.source] || {
                                label: col.source,
                                bgColor: "bg-white/5 hover:bg-white/10",
                                borderColor: "border-white/10 hover:border-white/20",
                                borderLeft: "border-l-white/40",
                                textColor: "text-white/80",
                                icon: Database
                            };
                            const IconComponent = cfg.icon;
                            
                            return (
                                <div
                                    key={col.id || idx}
                                    className={cn(
                                        "relative flex flex-col justify-between p-2.5 rounded-lg border border-white/5 border-l-[3px]",
                                        cfg.borderLeft,
                                        cfg.bgColor,
                                        cfg.borderColor,
                                        "transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:shadow-black/25 min-h-[64px] min-w-0",
                                        !isVisible && "opacity-40 saturate-50 hover:opacity-70"
                                    )}
                                >
                                    {/* Visibility Toggle Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newMappings = [...columnMappings];
                                            newMappings[idx] = { ...newMappings[idx], visible: !isVisible };
                                            setColumnMappings(newMappings);
                                        }}
                                        className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-all duration-150 shrink-0"
                                        title={isVisible ? "Hide column from table & export" : "Show column in table & export"}
                                    >
                                        {isVisible ? (
                                            <Eye className="w-3.5 h-3.5 text-white/50 hover:text-white" />
                                        ) : (
                                            <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                                        )}
                                    </button>

                                    <div className="flex items-start justify-between gap-1 w-full min-w-0 pr-5">
                                        <span className="font-semibold text-[11px] text-white/95 truncate leading-tight select-none w-full" title={col.name || `Column ${idx + 1}`}>
                                            {col.name || `Column ${idx + 1}`}
                                        </span>
                                    </div>
                                    <div className="flex flex-col mt-1.5 w-full min-w-0">
                                        <div className="flex items-center gap-1 w-full min-w-0">
                                            <IconComponent className={cn("w-3 h-3 shrink-0", cfg.textColor)} />
                                            <span className={cn("text-[9px] font-bold uppercase tracking-wider select-none", cfg.textColor)}>
                                                {cfg.label}
                                            </span>
                                        </div>
                                        {col.path && (
                                            <span 
                                                className="text-[9px] text-white/35 font-mono truncate mt-1 pt-0.5 border-t border-white/5 w-full block" 
                                                title={col.path}
                                            >
                                                {col.path}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {columnMappings.length === 0 && (
                            <div className="col-span-full text-xs text-muted-foreground italic py-3 text-center bg-neutral-950/20 border border-dashed border-white/5 rounded-lg w-full">
                                No columns mapped. Click here to configure mappings.
                            </div>
                        )}
                    </div>
                </div>

                {/* Column Mappings Dialog */}
                <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
                    <ColumnMappingsDialogContent
                        initialMappings={columnMappings}
                        originalHeaders={originalHeaders}
                        templates={templates}
                        results={results}
                        onSave={handleSaveMapping}
                        onClose={handleCloseMapping}
                        isOpen={isMappingDialogOpen}
                    />
                </Dialog>

                <ResultsTableView
                    data={data}
                    columns={columns}
                    tableFilterConfig={tableFilterConfig}
                    onRowClick={handleRowClick}
                />
            </CardContent>

            {/* View Details Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="w-[95vw] max-w-[95vw] sm:!max-w-[95vw] h-[90vh] flex flex-col overflow-hidden">
                    {isDialogOpen && (
                        <>
                            <DialogHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                            <div>
                                <DialogTitle className="flex flex-wrap items-center gap-2">
                                    <span>Raw Execution Details</span>
                                    {selectedDetail && (
                                        <>
                                            <Badge variant="outline" className="font-mono text-[10px] text-primary bg-primary/5 border-primary/20 h-5 px-1.5 flex items-center">
                                                Row {selectedDetail.rowId + 1}
                                            </Badge>
                                            <Badge variant="outline" className="font-mono text-[10px] text-orange-400 bg-orange-400/5 border-orange-400/20 h-5 px-1.5 flex items-center">
                                                Iteration {selectedDetail.iteration}
                                            </Badge>
                                        </>
                                    )}
                                </DialogTitle>
                                <DialogDescription className="mt-1 flex flex-col gap-0.5">
                                    <span className="text-xs text-neutral-400">
                                        Comparing the final interpolated JSON Request sent alongside the raw Response received.
                                    </span>
                                    {selectedDetail && (
                                        <span className="text-[10px] font-mono text-neutral-500 truncate max-w-[50vw] block select-all" title={getRowSignature(selectedDetail.rowId)}>
                                            Signature: {getRowSignature(selectedDetail.rowId)}
                                        </span>
                                    )}
                                </DialogDescription>
                            </div>
                            
                            {/* Run select dropdown & duplicate button */}
                            {matchingResults.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 shrink-0 bg-neutral-900/50 p-1.5 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] uppercase font-bold text-white/50 px-1">Runs:</span>
                                        <Select
                                            value={selectValue}
                                            onValueChange={(val) => {
                                                setSelectedTimestamp(val);
                                                setActiveResultInstance(selectedDetail!.rowId, selectedDetail!.iteration, val);
                                                setIsEditing(false);
                                            }}
                                        >
                                            <SelectTrigger className="h-8 text-xs font-mono bg-neutral-950 border-white/10 text-white min-w-[180px]">
                                                <SelectValue placeholder="Select run..." />
                                            </SelectTrigger>
                                            <SelectContent position="popper" sideOffset={4} className="bg-neutral-950 border-white/10 text-white font-mono text-xs max-h-[300px]">
                                                {matchingResults.map((r, i) => {
                                                    const val = r.timestamp || `temp_${i}`;
                                                    const name = formatTimestamp(r.timestamp) + (r.active ? " (Active)" : "");
                                                    return (
                                                        <SelectItem key={val} value={val}>
                                                            {name}
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    {isMakeNewRowOpen ? (
                                        <div className="flex items-center gap-2 border-l border-white/10 pl-2">
                                            <span className="text-[10px] font-bold text-white/70 uppercase">Insert</span>
                                            <Select
                                                value={insertPosition}
                                                onValueChange={(val: "before" | "after") => setInsertPosition(val)}
                                            >
                                                <SelectTrigger className="h-8 w-[85px] text-xs bg-neutral-950 border-white/10 text-white font-mono">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent position="popper" sideOffset={4} className="bg-neutral-950 border-white/10 text-white font-mono text-xs">
                                                    <SelectItem value="before">before</SelectItem>
                                                    <SelectItem value="after">after</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span className="text-[10px] font-bold text-white/70 uppercase">Row:</span>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={fileData.length}
                                                value={targetRowNum}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    if (!isNaN(val)) {
                                                        setTargetRowNum(val);
                                                    } else {
                                                        setTargetRowNum("" as any);
                                                    }
                                                }}
                                                className="h-8 w-[70px] text-xs bg-neutral-950 border-white/10 text-white font-mono text-center p-1"
                                            />
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="h-8 px-3 text-[10px] font-bold uppercase tracking-tight bg-primary text-primary-foreground hover:bg-primary/90"
                                                onClick={() => {
                                                    const rowNum = Number(targetRowNum);
                                                    if (isNaN(rowNum) || rowNum < 1 || rowNum > fileData.length) {
                                                        toast.error(`Please enter a valid row number between 1 and ${fileData.length}`);
                                                        return;
                                                    }

                                                    const insertIndex = insertPosition === "before" ? rowNum - 1 : rowNum;
                                                    
                                                    if (currentResult) {
                                                        const originalRowId = selectedDetail!.rowId;
                                                        duplicateResultAsNewRow(originalRowId, currentResult, insertIndex);
                                                        
                                                        if (insertIndex <= originalRowId) {
                                                            setSelectedDetail({
                                                                rowId: originalRowId + 1,
                                                                iteration: selectedDetail!.iteration
                                                            });
                                                        }
                                                        
                                                        toast.success(`Successfully inserted new row ${insertPosition} row ${rowNum}!`);
                                                        setIsMakeNewRowOpen(false);
                                                    }
                                                }}
                                            >
                                                Confirm
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-[10px] font-bold uppercase tracking-tight hover:bg-neutral-900 border-white/10 text-white/70 hover:text-white"
                                                onClick={() => setIsMakeNewRowOpen(false)}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-[10px] font-bold uppercase tracking-tight bg-neutral-950 hover:bg-neutral-900 border-white/10 text-white hover:text-white border border-white/10"
                                            onClick={() => {
                                                const current1BasedRow = selectedDetail!.rowId + 1;
                                                setTargetRowNum(current1BasedRow);
                                                setInsertPosition("after");
                                                setIsMakeNewRowOpen(true);
                                            }}
                                        >
                                            Make New Row
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    </DialogHeader>
                    {!isDetailsReady ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 py-12">
                            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                            <span className="text-xs text-neutral-400 font-medium animate-pulse">Loading execution details...</span>
                        </div>
                    ) : (
                        selectedDetail !== null && (() => {
                        const result = currentResult;
                        const steps = result?.steps || [];
                        const hasSteps = steps.length > 0;
                        return (
                            <Tabs value={activeStepId} onValueChange={(val) => { setActiveStepId(val); setIsEditing(false); }} className="flex-1 flex flex-col min-h-0 mt-4">
                                {hasSteps && steps.length > 1 && (
                                    <TabsList className="bg-muted/50 w-full justify-start rounded-none border-b pb-0 px-2 h-auto flex flex-wrap shrink-0">
                                        {steps.map((step, idx) => (
                                            <TabsTrigger
                                                key={step.stepId}
                                                value={step.stepId}
                                                className="data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 text-xs"
                                            >
                                                Step {idx + 1}: {step.stepName}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                )}
                                {currentStep && (
                                    <div className="flex-grow flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                        {/* Request Details Panel */}
                                        <div className="flex flex-col border rounded-md min-h-0 overflow-hidden shadow-inner bg-[#1e1e1e]">
                                            <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <span>Request Details — {(currentStep as any).stepName || "Interpolated Request"}</span>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-[10px] uppercase font-bold tracking-wider hover:bg-neutral-900 border border-transparent hover:border-white/5 text-white/70 hover:text-white"
                                                        onClick={() => setIsEditing(!isEditing)}
                                                    >
                                                        {isEditing ? "Cancel Edit" : "Edit & Rerun"}
                                                    </Button>
                                                </div>
                                                {isEditing ? (
                                                    <div className="flex gap-2 p-1.5 bg-neutral-900/60 rounded border border-white/5 items-center shrink-0">
                                                        <Select value={editMethod} onValueChange={setEditMethod}>
                                                            <SelectTrigger className="w-[100px] h-8 font-bold text-xs bg-neutral-950 border-white/10 text-white">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-neutral-950 border-white/10 text-white text-xs font-bold">
                                                                {["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].map(m => (
                                                                    <SelectItem key={m} value={m}>{m}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        
                                                        <Input
                                                            value={editUrl}
                                                            onChange={(e) => setEditUrl(e.target.value)}
                                                            placeholder="Enter request URL..."
                                                            className="flex-grow h-8 text-xs font-mono bg-neutral-950 border-white/10 text-white"
                                                        />
                                                    </div>
                                                ) : (
                                                    currentStep.requestUrl && (
                                                        <div className="flex items-center gap-2 font-mono text-[11px] bg-neutral-900/60 p-1.5 rounded border border-white/5 truncate select-all normal-case">
                                                            <Badge variant="outline" className={cn(
                                                                "text-[9px] font-bold px-1.5 py-0 uppercase shrink-0 border-transparent text-white",
                                                                currentStep.requestMethod === "GET" && "bg-sky-500/20 text-sky-300",
                                                                currentStep.requestMethod === "POST" && "bg-emerald-500/20 text-emerald-300",
                                                                currentStep.requestMethod === "PUT" && "bg-amber-500/20 text-amber-300",
                                                                currentStep.requestMethod === "DELETE" && "bg-rose-500/20 text-rose-300",
                                                                !["GET", "POST", "PUT", "DELETE"].includes(currentStep.requestMethod || "") && "bg-purple-500/20 text-purple-300"
                                                            )}>
                                                                {currentStep.requestMethod || "GET"}
                                                            </Badge>
                                                            <span className="truncate text-neutral-300" title={currentStep.requestUrl}>{currentStep.requestUrl}</span>
                                                        </div>
                                                    )
                                                )}
                                            </div>

                                            <Tabs defaultValue="params" className="flex-1 flex flex-col min-h-0">
                                                <div className="bg-neutral-900/40 border-b px-2 shrink-0 h-8 flex items-center">
                                                    <TabsList className="bg-transparent h-7 p-0 gap-1">
                                                        <TabsTrigger value="params" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Params ({isEditing ? editParams.filter(p => p.key.trim()).length : Object.keys(currentStep.requestParams || {}).length})
                                                        </TabsTrigger>
                                                        <TabsTrigger value="headers" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Headers ({isEditing ? editHeaders.filter(h => h.key.trim()).length : Object.keys(currentStep.requestHeaders || {}).length})
                                                        </TabsTrigger>
                                                        <TabsTrigger value="body" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Body
                                                        </TabsTrigger>
                                                    </TabsList>
                                                </div>
                                                <TabsContent value="params" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    {isEditing ? (
                                                        <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-2 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                            {editParams.map((p, idx) => (
                                                                <div key={idx} className="flex gap-2 items-center">
                                                                    <Input
                                                                        placeholder="Key"
                                                                        value={p.key}
                                                                        onChange={(e) => {
                                                                            const newParams = [...editParams];
                                                                            newParams[idx].key = e.target.value;
                                                                            setEditParams(newParams);
                                                                        }}
                                                                        className="h-8 text-xs font-mono bg-neutral-950 border-white/10 text-white w-[150px] shrink-0"
                                                                    />
                                                                    <Input
                                                                        placeholder="Value"
                                                                        value={p.value}
                                                                        onChange={(e) => {
                                                                            const newParams = [...editParams];
                                                                            newParams[idx].value = e.target.value;
                                                                            setEditParams(newParams);
                                                                        }}
                                                                        className="h-8 text-xs font-mono bg-neutral-950 border-white/10 text-white flex-grow"
                                                                    />
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                                                        onClick={() => {
                                                                            const newParams = editParams.filter((_, i) => i !== idx);
                                                                            setEditParams(newParams.length > 0 ? newParams : [{ key: "", value: "" }]);
                                                                        }}
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                </div>
                                                            ))}
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 border-dashed border-white/10 text-white hover:bg-neutral-900 mt-2 text-[10px] uppercase font-bold"
                                                                onClick={() => setEditParams([...editParams, { key: "", value: "" }])}
                                                            >
                                                                <Plus className="w-3 h-3 mr-1" /> Add Parameter
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        currentStep.requestParams && Object.keys(currentStep.requestParams).length > 0 ? (
                                                            <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-1.5 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                                {Object.entries(currentStep.requestParams).map(([k, v]) => (
                                                                    <div key={k} className="flex border-b border-white/[0.03] pb-1 gap-2">
                                                                        <span className="text-indigo-400 font-bold shrink-0 w-[150px] truncate select-all" title={k}>{k}:</span>
                                                                        <span className="text-neutral-200 break-all select-all">{v}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="p-4 text-center text-xs text-neutral-500 italic flex-1 flex items-center justify-center">
                                                                No Request Parameters
                                                            </div>
                                                        )
                                                    )}
                                                </TabsContent>
                                                <TabsContent value="headers" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    {isEditing ? (
                                                        <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-2 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                            {editHeaders.map((h, idx) => (
                                                                <div key={idx} className="flex gap-2 items-center">
                                                                    <Input
                                                                        placeholder="Header"
                                                                        value={h.key}
                                                                        onChange={(e) => {
                                                                            const newHeaders = [...editHeaders];
                                                                            newHeaders[idx].key = e.target.value;
                                                                            setEditHeaders(newHeaders);
                                                                        }}
                                                                        className="h-8 text-xs font-mono bg-neutral-950 border-white/10 text-white w-[150px] shrink-0"
                                                                    />
                                                                    <Input
                                                                        placeholder="Value"
                                                                        value={h.value}
                                                                        onChange={(e) => {
                                                                            const newHeaders = [...editHeaders];
                                                                            newHeaders[idx].value = e.target.value;
                                                                            setEditHeaders(newHeaders);
                                                                        }}
                                                                        className="h-8 text-xs font-mono bg-neutral-950 border-white/10 text-white flex-grow"
                                                                    />
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                                                        onClick={() => {
                                                                            const newHeaders = editHeaders.filter((_, i) => i !== idx);
                                                                            setEditHeaders(newHeaders.length > 0 ? newHeaders : [{ key: "", value: "" }]);
                                                                        }}
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                </div>
                                                            ))}
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 border-dashed border-white/10 text-white hover:bg-neutral-900 mt-2 text-[10px] uppercase font-bold"
                                                                onClick={() => setEditHeaders([...editHeaders, { key: "", value: "" }])}
                                                            >
                                                                <Plus className="w-3 h-3 mr-1" /> Add Header
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        currentStep.requestHeaders && Object.keys(currentStep.requestHeaders).length > 0 ? (
                                                            <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-1.5 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                                {Object.entries(currentStep.requestHeaders).map(([k, v]) => (
                                                                    <div key={k} className="flex border-b border-white/[0.03] pb-1 gap-2">
                                                                        <span className="text-indigo-400 font-bold shrink-0 w-[150px] truncate select-all" title={k}>{k}:</span>
                                                                        <span className="text-neutral-200 break-all select-all">{v}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="p-4 text-center text-xs text-neutral-500 italic flex-1 flex items-center justify-center">
                                                                No Request Headers
                                                            </div>
                                                        )
                                                    )}
                                                </TabsContent>
                                                <TabsContent value="body" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    <Editor
                                                        height="100%"
                                                        defaultLanguage="json"
                                                        theme="vs-dark"
                                                        value={isEditing ? editBody : (currentStep.requestBody ? formatBody(currentStep.requestBody) : "No Request Body Content")}
                                                        onChange={(val) => {
                                                            if (isEditing) setEditBody(val || "");
                                                        }}
                                                        onMount={(editor, monaco) => {
                                                            monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                                                                validate: true,
                                                                allowComments: true,
                                                                comments: "ignore",
                                                                trailingCommas: "ignore",
                                                            });
                                                        }}
                                                        options={{
                                                            automaticLayout: true,
                                                            readOnly: !isEditing,
                                                            minimap: { enabled: false },
                                                            wordWrap: "on",
                                                        }}
                                                    />
                                                </TabsContent>
                                            </Tabs>

                                            {isEditing && (
                                                <div className="bg-neutral-900/80 px-3 py-2 border-t border-white/5 flex justify-end gap-2 shrink-0">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 text-xs font-semibold bg-transparent hover:bg-white/5 border-white/10 text-white hover:text-white"
                                                        onClick={() => setIsEditing(false)}
                                                        disabled={isRerunning}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                                                        onClick={handleRerunExecute}
                                                        disabled={isRerunning}
                                                    >
                                                        {isRerunning ? (
                                                            <>
                                                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                                Running...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Play className="w-3.5 h-3.5 mr-1.5" />
                                                                Run / Update
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Response Details Panel */}
                                        <div className="flex flex-col border rounded-md min-h-0 overflow-hidden shadow-inner bg-[#1e1e1e]">
                                            <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground flex flex-col gap-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span>Response ({currentStep.statusCode} {currentStep.responseStatusText || ""}) — {currentStep.responseTimeMs}ms</span>
                                                </div>
                                                {(currentStep.ipAddress || currentStep.responseType) && (
                                                    <div className="flex flex-wrap gap-2 text-[10px] text-neutral-400 font-mono normal-case">
                                                        {currentStep.ipAddress && (
                                                            <span className="bg-neutral-900/60 px-1.5 py-0.5 rounded border border-white/5">
                                                                IP: <span className="text-neutral-200 select-all">{currentStep.ipAddress}</span>
                                                            </span>
                                                        )}
                                                        {currentStep.responseType && (
                                                            <span className="bg-neutral-900/60 px-1.5 py-0.5 rounded border border-white/5">
                                                                Type: <span className="text-neutral-200">{currentStep.responseType}</span>
                                                            </span>
                                                        )}
                                                        {currentStep.responseRedirected && (
                                                            <span className="bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/10">
                                                                Redirected
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <Tabs defaultValue="body" className="flex-1 flex flex-col min-h-0">
                                                <div className="bg-neutral-900/40 border-b px-2 shrink-0 h-8 flex items-center">
                                                    <TabsList className="bg-transparent h-7 p-0 gap-1">
                                                        <TabsTrigger value="params" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Params (0)
                                                        </TabsTrigger>
                                                        <TabsTrigger value="headers" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Headers ({Object.keys(currentStep.responseHeaders || {}).length})
                                                        </TabsTrigger>
                                                        <TabsTrigger value="body" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Body
                                                        </TabsTrigger>
                                                    </TabsList>
                                                </div>
                                                <TabsContent value="params" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    <div className="p-4 text-center text-xs text-neutral-500 italic flex-1 flex items-center justify-center">
                                                        No Response Parameters
                                                    </div>
                                                </TabsContent>
                                                <TabsContent value="headers" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    {currentStep.responseHeaders && Object.keys(currentStep.responseHeaders).length > 0 ? (
                                                        <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-1.5 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                            {Object.entries(currentStep.responseHeaders).map(([k, v]) => (
                                                                <div key={k} className="flex border-b border-white/[0.03] pb-1 gap-2">
                                                                    <span className="text-indigo-400 font-bold shrink-0 w-[150px] truncate select-all" title={k}>{k}:</span>
                                                                    <span className="text-neutral-200 break-all select-all">{v}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="p-4 text-center text-xs text-neutral-500 italic flex-1 flex items-center justify-center">
                                                            No Response Headers
                                                        </div>
                                                    )}
                                                </TabsContent>
                                                <TabsContent value="body" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    <Editor
                                                        height="100%"
                                                        defaultLanguage="json"
                                                        theme="vs-dark"
                                                        value={
                                                            currentStep.responseBody !== null && currentStep.responseBody !== undefined
                                                                ? formatBody(currentStep.responseBody)
                                                                : currentStep.error || "No Response Body Content"
                                                        }
                                                        onMount={(editor, monaco) => {
                                                            monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                                                                validate: true,
                                                                allowComments: true,
                                                                comments: "ignore",
                                                                trailingCommas: "ignore",
                                                            });
                                                        }}
                                                        options={{
                                                            automaticLayout: true,
                                                            readOnly: true,
                                                            minimap: { enabled: false },
                                                            wordWrap: "on",
                                                        }}
                                                    />
                                                </TabsContent>
                                            </Tabs>
                                        </div>
                                    </div>
                                )}
                            </Tabs>
                        );
                    })()
                    )}
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Export Options Dialog */}
            <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogContent className="max-w-md bg-card border border-muted-foreground/20 rounded-xl shadow-2xl p-6" showCloseButton={false}>
                    <DialogHeader className="space-y-1">
                        <DialogTitle className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/80">
                            Export to Excel
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            You have active filters applied. Select how you would like to export your results.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 gap-3 py-4">
                        {/* Option: Filtered */}
                        <button
                            onClick={() => {
                                setExportDialogOpen(false);
                                executeExport(true);
                            }}
                            className="group relative flex flex-col items-start text-left p-4 rounded-xl border border-primary/20 bg-primary/[0.02] hover:bg-primary/[0.04] hover:border-primary/40 transition-all duration-200 focus:outline-none cursor-pointer"
                        >
                            <span className="text-sm font-bold text-primary">Export Filtered Results</span>
                            <span className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                Only export the <strong>{data.length} rows</strong> matching your active filters and search query.
                            </span>
                        </button>

                        {/* Option: All */}
                        <button
                            onClick={() => {
                                setExportDialogOpen(false);
                                executeExport(false);
                            }}
                            className="group relative flex flex-col items-start text-left p-4 rounded-xl border border-muted-foreground/20 bg-muted/10 hover:bg-muted/20 hover:border-muted-foreground/30 transition-all duration-200 focus:outline-none cursor-pointer"
                        >
                            <span className="text-sm font-bold text-foreground">Export All Results</span>
                            <span className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                Export the entire dataset of <strong>{rawTableData.length} rows</strong>, bypassing any active filters.
                            </span>
                        </button>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button variant="ghost" onClick={() => setExportDialogOpen(false)} className="text-xs">
                            Cancel
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
