"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { store, setColumnMappings, setTableFilterConfig } from "@/lib/store";
import { type ColumnMapping, type TableFilterConfig } from "@/lib/schema";
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
import { Download, Plus, Trash2, Eye, ChevronsUpDown, Check, ArrowUp, ArrowDown, ListFilter } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import * as xlsx from "xlsx";
import Editor from "@monaco-editor/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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

function getByDotNotation(obj: any, path: string): string {
    if (!obj || !path) return "";
    try {
        const value = path.split('.').reduce((acc, part) => acc && acc[part], obj);
        if (value === undefined || value === null) return "";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
    } catch (e) {
        return "";
    }
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
    uniqueValues,
}: {
    colId: string;
    colName: string;
    uniqueValues: string[];
}) {
    const tableFilterConfig = useStore(store, (state) => state.tableFilterConfig);
    const activeFilters = tableFilterConfig.columnFilters[colId] || [];
    const sortBy = tableFilterConfig.sortBy;
    const sortOrder = tableFilterConfig.sortOrder;

    const [popoverOpen, setPopoverOpen] = useState(false);
    const [filterSearch, setFilterSearch] = useState("");

    const handleSort = (direction: "asc" | "desc" | null) => {
        setTableFilterConfig({ sortBy: direction ? colId : null, sortOrder: direction });
    };

    const toggleValue = (val: string) => {
        let newFilters = [...activeFilters];
        if (activeFilters.length === 0) {
            newFilters = uniqueValues.filter(v => v !== val);
        } else {
            if (activeFilters.includes(val)) {
                newFilters = activeFilters.filter(v => v !== val);
            } else {
                newFilters.push(val);
            }
        }

        if (newFilters.length === uniqueValues.length || newFilters.length === 0) {
            const updatedFilters = { ...tableFilterConfig.columnFilters };
            delete updatedFilters[colId];
            setTableFilterConfig({ columnFilters: updatedFilters });
        } else {
            setTableFilterConfig({
                columnFilters: {
                    ...tableFilterConfig.columnFilters,
                    [colId]: newFilters,
                },
            });
        }
    };

    const isChecked = (val: string) => {
        if (activeFilters.length === 0) return true;
        return activeFilters.includes(val);
    };

    const handleSelectAll = () => {
        const updatedFilters = { ...tableFilterConfig.columnFilters };
        delete updatedFilters[colId];
        setTableFilterConfig({ columnFilters: updatedFilters });
    };

    const handleClearAll = () => {
        setTableFilterConfig({
            columnFilters: {
                ...tableFilterConfig.columnFilters,
                [colId]: ["__NON_EXISTENT_VALUE__"],
            },
        });
    };

    const filteredValues = uniqueValues.filter(val =>
        String(val).toLowerCase().includes(filterSearch.toLowerCase())
    );

    const isSorted = sortBy === colId;
    const hasFilter = activeFilters.length > 0;

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

            <Popover open={popoverOpen} onOpenChange={(open) => {
                setPopoverOpen(open);
                if (!open) setFilterSearch("");
            }}>
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
                                onClick={handleSelectAll}
                                className="text-primary hover:underline font-semibold"
                            >
                                Select All
                            </button>
                            <button
                                onClick={handleClearAll}
                                className="text-muted-foreground hover:underline font-semibold"
                            >
                                Clear All
                            </button>
                        </div>

                        <div className="max-h-[120px] overflow-y-auto space-y-1 scrollbar-hide py-1 border-t border-b border-muted">
                            {filteredValues.length > 0 ? (
                                filteredValues.map((val, idx) => (
                                    <label
                                        key={idx}
                                        className="flex items-center space-x-2 rounded-md px-1 py-0.5 hover:bg-muted/50 cursor-pointer text-[11px]"
                                    >
                                        <Checkbox
                                            checked={isChecked(val)}
                                            onCheckedChange={() => toggleValue(val)}
                                            className="w-3.5 h-3.5"
                                        />
                                        <span className="truncate max-w-[140px]" title={val}>
                                            {val === "" ? <em className="text-muted-foreground/60">(Blank)</em> : val}
                                        </span>
                                    </label>
                                ))
                            ) : (
                                <div className="text-center text-[10px] text-muted-foreground py-1">
                                    No values
                                </div>
                            )}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
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

    const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [exportDialogOpen, setExportDialogOpen] = useState(false);

    const rawTableData = useMemo(() => {
        return results.map((res) => {
            const rowData = fileData[res.rowId] || {};
            const rowMap: Record<string, any> = {};

            columnMappings.forEach((col, idx) => {
                const key = `col_${idx}`;
                if (col.source === "status") {
                    rowMap[key] = res.status === "pending" ? "Pending" : res.statusCode;
                } else if (col.source === "error") {
                    rowMap[key] = res.error || "";
                } else if (col.source === "response_time") {
                    if (res.status === "pending") {
                        rowMap[key] = "...";
                    } else {
                        const steps = res.steps || [];
                        const step = col.stepId
                            ? steps.find(s => s.stepId === col.stepId)
                            : steps[steps.length - 1];
                        rowMap[key] = step ? `${step.responseTimeMs} ms` : `${res.responseTimeMs} ms`;
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
                    rowMap[key] = res.status === "pending" ? "..." : getByDotNotation(body, col.path);
                }
            });
            rowMap.__status = res.status;
            rowMap.__id = res.rowId;
            return rowMap;
        });
    }, [results, fileData, columnMappings]);

    const data = useMemo(() => {
        let filtered = [...rawTableData];

        Object.entries(tableFilterConfig.columnFilters).forEach(([colKey, allowedValues]) => {
            if (allowedValues && allowedValues.length > 0) {
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
        const getUniqueValues = (colId: string) => {
            const values = new Set<string>();
            rawTableData.forEach(row => {
                const val = String(row[colId] ?? "");
                values.add(val);
            });
            return Array.from(values).sort();
        };

        const dynamicCols: ColumnDef<any>[] = columnMappings.map((col, idx) => {
            const colId = `col_${idx}`;
            const colName = col.name || `Column ${idx + 1}`;
            return {
                id: colId,
                accessorKey: colId,
                header: () => (
                    <ColumnHeaderWithFilter
                        colId={colId}
                        colName={colName}
                        uniqueValues={getUniqueValues(colId)}
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
                    return <div className="max-w-[200px] truncate text-xs" title={String(value)}>{value}</div>;
                }
            };
        });

        dynamicCols.push({
            id: "actions",
            header: "Actions",
            cell: ({ row }) => {
                const internalId = row.original.__id;
                const isPending = row.original.__status === "pending";
                return (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setSelectedDetailId(internalId);
                            setIsDialogOpen(true);
                        }}
                        disabled={isPending}
                        title="View Raw Details"
                    >
                        <Eye className={`w-4 h-4 ${isPending ? 'text-muted-foreground' : 'text-primary'}`} />
                    </Button>
                )
            }
        });

        return dynamicCols;
    }, [columnMappings, rawTableData]);

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

    const executeExport = (onlyFiltered: boolean) => {
        const dataToExport = onlyFiltered ? data : rawTableData;
        if (dataToExport.length === 0) {
            alert("No results to export.");
            return;
        }

        const exportData = dataToExport.map(row => {
            const cleanRow: Record<string, any> = {};
            columnMappings.forEach((col, idx) => {
                const colName = col.name || `Column ${idx + 1}`;
                const finalName = cleanRow[colName] !== undefined ? `${colName} (${idx})` : colName;
                cleanRow[finalName] = row[`col_${idx}`];
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
            Object.keys(tableFilterConfig.columnFilters).some(
                (k) => tableFilterConfig.columnFilters[k]?.length > 0
            )
        );

        if (hasActiveFilters) {
            setExportDialogOpen(true);
        } else {
            executeExport(false);
        }
    };

    const addColumnMapping = () => {
        setColumnMappings([...columnMappings, { name: `Column ${columnMappings.length + 1}`, source: "variable", path: originalHeaders[0] || "" }]);
    };

    const updateColumnMapping = (index: number, updates: Partial<typeof columnMappings[0]>) => {
        const newMappings = [...columnMappings];
        newMappings[index] = { ...newMappings[index], ...updates };
        setColumnMappings(newMappings);
    };

    const removeColumnMapping = (index: number) => {
        const newMappings = columnMappings.filter((_, i) => i !== index);
        setColumnMappings(newMappings);
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
                {/* Mapping Configurator */}
                <div className="space-y-4 p-4 rounded-lg bg-muted/30 border">
                    <h4 className="text-sm font-semibold">Column Mappings</h4>
                    <div className="space-y-3">
                        {columnMappings.map((col, idx) => (
                            <div key={idx} className="flex flex-col sm:flex-row sm:space-x-2 items-stretch sm:items-center flex-wrap gap-2 sm:gap-y-2">
                                <Input
                                    value={col.name}
                                    onChange={(e) => updateColumnMapping(idx, { name: e.target.value })}
                                    placeholder="Column Name"
                                    className="w-full sm:w-[180px]"
                                />
                                <Select value={col.source} onValueChange={(val: any) => updateColumnMapping(idx, { source: val, path: "", stepId: undefined })}>
                                    <SelectTrigger className="w-full sm:w-[150px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="variable">Variable (Row)</SelectItem>
                                        <SelectItem value="request_body">Request Body</SelectItem>
                                        <SelectItem value="request_param">Request Param</SelectItem>
                                        <SelectItem value="response">Response JSON</SelectItem>
                                        <SelectItem value="status">Status Code</SelectItem>
                                        <SelectItem value="error">Error Message</SelectItem>
                                        <SelectItem value="response_time">Response Time (ms)</SelectItem>
                                    </SelectContent>
                                </Select>
                                {col.source === "variable" && (
                                    <SearchableSelect
                                        value={col.path || ""}
                                        onChange={(val) => updateColumnMapping(idx, { path: val })}
                                        options={originalHeaders.map(h => ({ label: h, value: h }))}
                                        placeholder="Select variable"
                                        className="w-full sm:w-[160px]"
                                    />
                                )}
                                {col.source === "request_param" && (() => {
                                    // Gather all unique param keys from all templates
                                    const allParams = Array.from(
                                        new Set(templates.flatMap(t => (t.params || []).map(p => p.key).filter(Boolean)))
                                    );
                                    return (
                                        <>
                                            {templates.length > 1 && (
                                                <SearchableSelect
                                                    value={col.stepId || ""}
                                                    onChange={(val) => updateColumnMapping(idx, { stepId: val || undefined })}
                                                    options={[{ label: "All", value: "" }, ...templates.map((t, i) => ({ label: `Step ${i + 1}: ${t.name}`, value: t.id }))]}
                                                    placeholder="All steps"
                                                    className="w-full sm:w-[140px]"
                                                />
                                            )}
                                            <SearchableSelect
                                                value={col.path || ""}
                                                onChange={(val) => updateColumnMapping(idx, { path: val })}
                                                options={allParams.map(p => ({ label: p, value: p }))}
                                                placeholder="Select param"
                                                className="w-full sm:w-[160px]"
                                            />
                                        </>
                                    );
                                })()}
                                {(col.source === "request_body" || col.source === "response") && (
                                    <>
                                        {templates.length > 1 && (
                                            <SearchableSelect
                                                value={col.stepId || ""}
                                                onChange={(val) => updateColumnMapping(idx, { stepId: val || undefined })}
                                                options={[{ label: "All (Last)", value: "" }, ...templates.map((t, i) => ({ label: `Step ${i + 1}: ${t.name}`, value: t.id }))]}
                                                placeholder="All / Last"
                                                className="w-full sm:w-[140px]"
                                            />
                                        )}
                                        <Input
                                            value={col.path}
                                            onChange={(e) => updateColumnMapping(idx, { path: e.target.value })}
                                            placeholder={col.source === "request_body" ? "e.g. name" : "e.g. data.id"}
                                            className="flex-1 font-mono text-sm min-w-[120px]"
                                        />
                                    </>
                                )}
                                {col.source === "response_time" && (
                                    <>
                                        {templates.length > 1 ? (
                                            <SearchableSelect
                                                value={col.stepId || ""}
                                                onChange={(val) => updateColumnMapping(idx, { stepId: val || undefined })}
                                                options={[{ label: "All (Last)", value: "" }, ...templates.map((t, i) => ({ label: `Step ${i + 1}: ${t.name}`, value: t.id }))]}
                                                placeholder="All / Last"
                                                className="w-full sm:w-[140px]"
                                            />
                                        ) : null}
                                        <div className="flex-1 text-sm text-muted-foreground flex items-center px-3 border border-transparent">
                                            Automatic Value (Response Time)
                                        </div>
                                    </>
                                )}
                                {(col.source === "status" || col.source === "error") && (
                                    <div className="flex-1 text-sm text-muted-foreground flex items-center px-3 border border-transparent">
                                        Automatic Value
                                    </div>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => removeColumnMapping(idx)} className="text-muted-foreground hover:text-destructive shrink-0">
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addColumnMapping} className="border-dashed">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Column
                        </Button>
                    </div>
                </div>

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
                        {Object.keys(tableFilterConfig.columnFilters).some(k => tableFilterConfig.columnFilters[k]?.length > 0) || tableFilterConfig.searchQuery || tableFilterConfig.sortBy ? (
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
                <div className="rounded-md border">
                    <Table>
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
            </CardContent>

            {/* View Details Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="w-[95vw] max-w-[95vw] sm:!max-w-[95vw] h-[90vh] flex flex-col overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>Raw Execution Details</DialogTitle>
                        <DialogDescription>
                            Comparing the final interpolated JSON Request sent alongside the raw Response received.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedDetailId !== null && (() => {
                        const result = results.find(r => r.rowId === selectedDetailId);
                        const steps = result?.steps || [];
                        const hasSteps = steps.length > 0;
                        return (
                            <Tabs defaultValue={hasSteps ? steps[0]?.stepId : "legacy"} className="flex-1 flex flex-col min-h-0 mt-4">
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
                                {hasSteps ? steps.map((step) => (
                                    <TabsContent key={step.stepId} value={step.stepId} className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-4 data-[state=active]:flex data-[state=active]:grid">
                                        <div className="flex flex-col border rounded-md min-h-0 overflow-hidden shadow-inner bg-[#1e1e1e]">
                                            <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <span>Request Details — {step.stepName}</span>
                                                </div>
                                                {step.requestUrl && (
                                                    <div className="flex items-center gap-2 font-mono text-[11px] bg-neutral-900/60 p-1.5 rounded border border-white/5 truncate select-all normal-case">
                                                        <Badge variant="outline" className={cn(
                                                            "text-[9px] font-bold px-1.5 py-0 uppercase shrink-0 border-transparent text-white",
                                                            step.requestMethod === "GET" && "bg-sky-500/20 text-sky-300",
                                                            step.requestMethod === "POST" && "bg-emerald-500/20 text-emerald-300",
                                                            step.requestMethod === "PUT" && "bg-amber-500/20 text-amber-300",
                                                            step.requestMethod === "DELETE" && "bg-rose-500/20 text-rose-300",
                                                            !["GET", "POST", "PUT", "DELETE"].includes(step.requestMethod || "") && "bg-purple-500/20 text-purple-300"
                                                        )}>
                                                            {step.requestMethod || "GET"}
                                                        </Badge>
                                                        <span className="truncate text-neutral-300" title={step.requestUrl}>{step.requestUrl}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <Tabs defaultValue="params" className="flex-1 flex flex-col min-h-0">
                                                <div className="bg-neutral-900/40 border-b px-2 shrink-0 h-8 flex items-center">
                                                    <TabsList className="bg-transparent h-7 p-0 gap-1">
                                                        <TabsTrigger value="params" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Params ({Object.keys(step.requestParams || {}).length})
                                                        </TabsTrigger>
                                                        <TabsTrigger value="headers" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Headers ({Object.keys(step.requestHeaders || {}).length})
                                                        </TabsTrigger>
                                                        <TabsTrigger value="body" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Body
                                                        </TabsTrigger>
                                                    </TabsList>
                                                </div>
                                                <TabsContent value="params" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    {step.requestParams && Object.keys(step.requestParams).length > 0 ? (
                                                        <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-1.5 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                            {Object.entries(step.requestParams).map(([k, v]) => (
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
                                                    )}
                                                </TabsContent>
                                                <TabsContent value="headers" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    {step.requestHeaders && Object.keys(step.requestHeaders).length > 0 ? (
                                                        <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-1.5 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                            {Object.entries(step.requestHeaders).map(([k, v]) => (
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
                                                    )}
                                                </TabsContent>
                                                <TabsContent value="body" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    <Editor
                                                        height="100%"
                                                        defaultLanguage="json"
                                                        theme="vs-dark"
                                                        value={
                                                            step.requestBody
                                                                ? formatBody(step.requestBody)
                                                                : "No Request Body Content"
                                                        }
                                                        options={{ readOnly: true, minimap: { enabled: false } }}
                                                    />
                                                </TabsContent>
                                            </Tabs>
                                        </div>
                                        <div className="flex flex-col border rounded-md min-h-0 overflow-hidden shadow-inner bg-[#1e1e1e]">
                                            <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground flex flex-col gap-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span>Response ({step.statusCode} {step.responseStatusText || ""}) — {step.responseTimeMs}ms</span>
                                                </div>
                                                {(step.ipAddress || step.responseType) && (
                                                    <div className="flex flex-wrap gap-2 text-[10px] text-neutral-400 font-mono normal-case">
                                                        {step.ipAddress && (
                                                            <span className="bg-neutral-900/60 px-1.5 py-0.5 rounded border border-white/5">
                                                                IP: <span className="text-neutral-200 select-all">{step.ipAddress}</span>
                                                            </span>
                                                        )}
                                                        {step.responseType && (
                                                            <span className="bg-neutral-900/60 px-1.5 py-0.5 rounded border border-white/5">
                                                                Type: <span className="text-neutral-200">{step.responseType}</span>
                                                            </span>
                                                        )}
                                                        {step.responseRedirected && (
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
                                                            Headers ({Object.keys(step.responseHeaders || {}).length})
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
                                                    {step.responseHeaders && Object.keys(step.responseHeaders).length > 0 ? (
                                                        <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-1.5 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                            {Object.entries(step.responseHeaders).map(([k, v]) => (
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
                                                            step.responseBody !== null && step.responseBody !== undefined
                                                                ? formatBody(step.responseBody)
                                                                : step.error || "No Response Body Content"
                                                        }
                                                        options={{ readOnly: true, minimap: { enabled: false } }}
                                                    />
                                                </TabsContent>
                                            </Tabs>
                                        </div>
                                    </TabsContent>
                                )) : (
                                    <TabsContent value="legacy" className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="flex flex-col border rounded-md min-h-0 overflow-hidden shadow-inner bg-[#1e1e1e]">
                                            <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <span>Interpolated Request Details</span>
                                                </div>
                                                {result?.requestUrl && (
                                                    <div className="flex items-center gap-2 font-mono text-[11px] bg-neutral-900/60 p-1.5 rounded border border-white/5 truncate select-all normal-case">
                                                        <Badge variant="outline" className={cn(
                                                            "text-[9px] font-bold px-1.5 py-0 uppercase shrink-0 border-transparent text-white",
                                                            result.requestMethod === "GET" && "bg-sky-500/20 text-sky-300",
                                                            result.requestMethod === "POST" && "bg-emerald-500/20 text-emerald-300",
                                                            result.requestMethod === "PUT" && "bg-amber-500/20 text-amber-300",
                                                            result.requestMethod === "DELETE" && "bg-rose-500/20 text-rose-300",
                                                            !["GET", "POST", "PUT", "DELETE"].includes(result.requestMethod || "") && "bg-purple-500/20 text-purple-300"
                                                        )}>
                                                            {result.requestMethod || "GET"}
                                                        </Badge>
                                                        <span className="truncate text-neutral-300" title={result.requestUrl}>{result.requestUrl}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <Tabs defaultValue="params" className="flex-1 flex flex-col min-h-0">
                                                <div className="bg-neutral-900/40 border-b px-2 shrink-0 h-8 flex items-center">
                                                    <TabsList className="bg-transparent h-7 p-0 gap-1">
                                                        <TabsTrigger value="params" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Params ({Object.keys(result?.requestParams || {}).length})
                                                        </TabsTrigger>
                                                        <TabsTrigger value="headers" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Headers ({Object.keys(result?.requestHeaders || {}).length})
                                                        </TabsTrigger>
                                                        <TabsTrigger value="body" className="text-[10px] h-6 px-3 rounded data-[state=active]:bg-neutral-800 data-[state=active]:text-white">
                                                            Body
                                                        </TabsTrigger>
                                                    </TabsList>
                                                </div>
                                                <TabsContent value="params" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    {result?.requestParams && Object.keys(result.requestParams).length > 0 ? (
                                                        <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-1.5 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                            {Object.entries(result.requestParams).map(([k, v]) => (
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
                                                    )}
                                                </TabsContent>
                                                <TabsContent value="headers" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    {result?.requestHeaders && Object.keys(result.requestHeaders).length > 0 ? (
                                                        <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-1.5 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                            {Object.entries(result.requestHeaders).map(([k, v]) => (
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
                                                    )}
                                                </TabsContent>
                                                <TabsContent value="body" className="flex-1 min-h-0 relative m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col">
                                                    <Editor
                                                        height="100%"
                                                        defaultLanguage="json"
                                                        theme="vs-dark"
                                                        value={
                                                            result?.requestBody
                                                                ? formatBody(result.requestBody)
                                                                : "No Request Body Content"
                                                        }
                                                        options={{ readOnly: true, minimap: { enabled: false } }}
                                                    />
                                                </TabsContent>
                                            </Tabs>
                                        </div>
                                        <div className="flex flex-col border rounded-md min-h-0 overflow-hidden shadow-inner bg-[#1e1e1e]">
                                            <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground flex flex-col gap-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span>Response Details</span>
                                                </div>
                                                {(result?.ipAddress || result?.responseType) && (
                                                    <div className="flex flex-wrap gap-2 text-[10px] text-neutral-400 font-mono normal-case">
                                                        {result.ipAddress && (
                                                            <span className="bg-neutral-900/60 px-1.5 py-0.5 rounded border border-white/5">
                                                                IP: <span className="text-neutral-200 select-all">{result.ipAddress}</span>
                                                            </span>
                                                        )}
                                                        {result.responseType && (
                                                            <span className="bg-neutral-900/60 px-1.5 py-0.5 rounded border border-white/5">
                                                                Type: <span className="text-neutral-200">{result.responseType}</span>
                                                            </span>
                                                        )}
                                                        {result.responseRedirected && (
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
                                                            Headers ({Object.keys(result?.responseHeaders || {}).length})
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
                                                    {result?.responseHeaders && Object.keys(result.responseHeaders).length > 0 ? (
                                                        <div className="p-3 overflow-auto flex-1 font-mono text-[11px] space-y-1.5 text-neutral-300 bg-neutral-950/40 animate-in fade-in-50 duration-200">
                                                            {Object.entries(result.responseHeaders).map(([k, v]) => (
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
                                                            result?.responseBody !== null && result?.responseBody !== undefined
                                                                ? formatBody(result.responseBody)
                                                                : "No Response Body Content"
                                                        }
                                                        options={{ readOnly: true, minimap: { enabled: false } }}
                                                    />
                                                </TabsContent>
                                            </Tabs>
                                        </div>
                                    </TabsContent>
                                )}
                            </Tabs>
                        );
                    })()}
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
