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
import { Download, Plus, Trash2, Eye } from "lucide-react";
import * as xlsx from "xlsx";
import Editor from "@monaco-editor/react";

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

    const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Mappings: e.g., { "User ID": { source: "response", path: "data.id" } }
    const [columnMappings, setColumnMappings] = useState<Array<{ name: string; source: "request" | "response" | "status" | "error"; path: string }>>([
        { name: "Status Code", source: "status", path: "" },
        { name: "Error", source: "error", path: "" },
    ]);

    const data = useMemo(() => {
        return results.map((res) => {
            const rowData = fileData[res.rowId] || {};
            const rowMap: Record<string, any> = {};

            columnMappings.forEach((col) => {
                if (col.source === "status") {
                    rowMap[col.name] = res.status === "pending" ? "Pending" : res.statusCode;
                }
                else if (col.source === "error") rowMap[col.name] = res.error || "";
                else if (col.source === "request") {
                    rowMap[col.name] = rowData[col.path] || "";
                } else if (col.source === "response") {
                    rowMap[col.name] = res.status === "pending" ? "..." : getByDotNotation(res.responseBody, col.path);
                }
            });
            rowMap.__status = res.status;
            // Attach internal hidden ID for Actions
            rowMap.__id = res.rowId;
            return rowMap;
        });
    }, [results, fileData, columnMappings]);

    const columns = useMemo<ColumnDef<any>[]>(() => {
        const dynamicCols: ColumnDef<any>[] = columnMappings.map((col) => ({
            accessorKey: col.name,
            header: col.name,
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
        const worksheet = xlsx.utils.json_to_sheet(data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Results");
        xlsx.writeFile(workbook, "orchestrator_results.xlsx");
    };

    const addColumnMapping = () => {
        setColumnMappings([...columnMappings, { name: `Column ${columnMappings.length + 1}`, source: "request", path: originalHeaders[0] || "" }]);
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
                <div className="flex items-center justify-between">
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
                            <div key={idx} className="flex space-x-2 items-center">
                                <Input
                                    value={col.name}
                                    onChange={(e) => updateColumnMapping(idx, { name: e.target.value })}
                                    placeholder="Column Name"
                                    className="w-[200px]"
                                />
                                <Select value={col.source} onValueChange={(val: any) => updateColumnMapping(idx, { source: val })}>
                                    <SelectTrigger className="w-[140px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="request">Request Row</SelectItem>
                                        <SelectItem value="response">Response JSON</SelectItem>
                                        <SelectItem value="status">Status Code</SelectItem>
                                        <SelectItem value="error">Error Message</SelectItem>
                                    </SelectContent>
                                </Select>
                                {(col.source === "request" || col.source === "response") && (
                                    <Input
                                        value={col.path}
                                        onChange={(e) => updateColumnMapping(idx, { path: e.target.value })}
                                        placeholder={col.source === "request" ? "e.g. Email" : "e.g. data.user.id"}
                                        className="flex-1 font-mono text-sm"
                                    />
                                )}
                                {!(col.source === "request" || col.source === "response") && (
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
                <div className="flex items-center justify-between">
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
                        <div className="text-sm text-muted-foreground min-w-[3rem] text-center">
                            {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                        </Button>
                    </div>
                </div>
            </CardContent>

            {/* View Details Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>Raw Execution Details</DialogTitle>
                        <DialogDescription>
                            Comparing the final interpolated JSON Request sent alongside the raw Response received.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedDetailId !== null && (
                        <div className="flex-1 min-h-0 grid grid-cols-2 gap-4 mt-4">
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
                                            results.find(r => r.rowId === selectedDetailId)?.requestBody
                                                ? JSON.stringify(results.find(r => r.rowId === selectedDetailId)?.requestBody, null, 2)
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
                                            results.find(r => r.rowId === selectedDetailId)?.responseBody
                                                ? JSON.stringify(results.find(r => r.rowId === selectedDetailId)?.responseBody, null, 2)
                                                : "No Response Body Content"
                                        }
                                        options={{ readOnly: true, minimap: { enabled: false } }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
