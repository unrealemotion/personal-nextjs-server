"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { store } from "@/lib/store";
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    ColumnDef,
    getPaginationRowModel,
} from "@tanstack/react-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Download, Plus, Trash2, Eye, ChevronsUpDown, Check } from "lucide-react";
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

export function ResultsTable() {
    const results = useStore(store, (state) => state.results);
    const fileData = useStore(store, (state) => state.fileData);
    const originalHeaders = useStore(store, (state) => state.headers);
    const templates = useStore(store, (state) => state.templates);

    const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    type ColumnMapping = {
        name: string;
        source: "variable" | "request_body" | "request_param" | "response" | "status" | "error";
        path: string;
        stepId?: string; // for response: which step to read from
    };

    const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([
        { name: "Status Code", source: "status", path: "" },
        { name: "Error", source: "error", path: "" },
    ]);

    const data = useMemo(() => {
        return results.map((res) => {
            const rowData = fileData[res.rowId] || {};
            const rowMap: Record<string, any> = {};

            columnMappings.forEach((col, idx) => {
                const key = `col_${idx}`;
                if (col.source === "status") {
                    rowMap[key] = res.status === "pending" ? "Pending" : res.statusCode;
                } else if (col.source === "error") {
                    rowMap[key] = res.error || "";
                } else if (col.source === "variable") {
                    rowMap[key] = rowData[col.path] ?? "";
                } else if (col.source === "request_body") {
                    // From the first step's interpolated request body via dot notation
                    const steps = res.steps || [];
                    const step = col.stepId
                        ? steps.find(s => s.stepId === col.stepId)
                        : steps[0];
                    rowMap[key] = step?.requestBody
                        ? getByDotNotation(step.requestBody, col.path)
                        : "";
                } else if (col.source === "request_param") {
                    // Param values are just variable lookups
                    rowMap[key] = rowData[col.path] ?? "";
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

    const columns = useMemo<ColumnDef<any>[]>(() => {
        const dynamicCols: ColumnDef<any>[] = columnMappings.map((col, idx) => ({
            id: `col_${idx}`,
            accessorKey: `col_${idx}`,
            header: col.name || "(Empty)",
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
                return <div className="max-w-[200px] truncate" title={String(value)}>{value}</div>;
            }
        }));

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
    }, [columnMappings]);

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {
            pagination: { pageSize: 20 },
        }
    });

    const handleExport = () => {
        if (data.length === 0) return;
        const exportData = data.map(row => {
            const cleanRow: Record<string, any> = {};
            columnMappings.forEach((col, idx) => {
                const colName = col.name || `Column ${idx + 1}`;
                const finalName = cleanRow[colName] !== undefined ? `${colName} (${idx})` : colName;
                cleanRow[finalName] = row[`col_${idx}`];
            });
            return cleanRow;
        });
        const worksheet = xlsx.utils.json_to_sheet(exportData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Results");
        xlsx.writeFile(workbook, "orchestrator_results.xlsx");
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

    // Remove early return, allow configuration before results populate

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
                        // Fallback for single-step results without steps array
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
                                            <div className="bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground">
                                                Request Body — {step.stepName}
                                            </div>
                                            <div className="flex-1 min-h-0 relative">
                                                <Editor
                                                    height="100%"
                                                    defaultLanguage="json"
                                                    theme="vs-dark"
                                                    value={
                                                        step.requestBody
                                                            ? JSON.stringify(step.requestBody, null, 2)
                                                            : "No Request Body Content"
                                                    }
                                                    options={{ readOnly: true, minimap: { enabled: false } }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col border rounded-md min-h-0 overflow-hidden shadow-inner bg-[#1e1e1e]">
                                            <div className="bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground">
                                                Response ({step.statusCode}) — {step.responseTimeMs}ms
                                            </div>
                                            <div className="flex-1 min-h-0 relative">
                                                <Editor
                                                    height="100%"
                                                    defaultLanguage="json"
                                                    theme="vs-dark"
                                                    value={
                                                        step.responseBody
                                                            ? JSON.stringify(step.responseBody, null, 2)
                                                            : step.error || "No Response Body Content"
                                                    }
                                                    options={{ readOnly: true, minimap: { enabled: false } }}
                                                />
                                            </div>
                                        </div>
                                    </TabsContent>
                                )) : (
                                    <TabsContent value="legacy" className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="flex flex-col border rounded-md min-h-0 overflow-hidden shadow-inner bg-[#1e1e1e]">
                                            <div className="bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground">
                                                Interpolated Request Body
                                            </div>
                                            <div className="flex-1 min-h-0 relative">
                                                <Editor
                                                    height="100%"
                                                    defaultLanguage="json"
                                                    theme="vs-dark"
                                                    value={
                                                        result?.requestBody
                                                            ? JSON.stringify(result.requestBody, null, 2)
                                                            : "No Request Body Content"
                                                    }
                                                    options={{ readOnly: true, minimap: { enabled: false } }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col border rounded-md min-h-0 overflow-hidden shadow-inner bg-[#1e1e1e]">
                                            <div className="bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider border-b shrink-0 text-foreground">
                                                Response Body
                                            </div>
                                            <div className="flex-1 min-h-0 relative">
                                                <Editor
                                                    height="100%"
                                                    defaultLanguage="json"
                                                    theme="vs-dark"
                                                    value={
                                                        result?.responseBody
                                                            ? JSON.stringify(result.responseBody, null, 2)
                                                            : "No Response Body Content"
                                                    }
                                                    options={{ readOnly: true, minimap: { enabled: false } }}
                                                />
                                            </div>
                                        </div>
                                    </TabsContent>
                                )}
                            </Tabs>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
