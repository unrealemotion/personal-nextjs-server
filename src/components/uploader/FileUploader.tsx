"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import * as xlsx from "xlsx";
import { UploadCloud, FileSpreadsheet, AlertCircle, Settings2, Table as TableIcon } from "lucide-react";
import { setFileData, setHeaderType, store, VariableType } from "@/lib/store";
import { useStore } from "@tanstack/react-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function FileUploader() {
    const [error, setError] = useState<string | null>(null);
    const fileData = useStore(store, (state) => state.fileData);
    const headers = useStore(store, (state) => state.headers);
    const headerTypes = useStore(store, (state) => state.headerTypes);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setError(null);
        const file = acceptedFiles[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = xlsx.read(data, { type: "array" });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Parse data forcing raw off to preserve pre-formatted strings (like '0' padded phones) natively
                const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "", raw: false });

                if (jsonData.length === 0) {
                    setError("File is empty or could not be parsed.");
                    return;
                }

                // Extract headers from the first row
                const extractedHeaders = Object.keys(jsonData[0]);
                setFileData(jsonData, extractedHeaders);
            } catch (err) {
                console.error(err);
                setError("Error parsing the file. Please ensure it is a valid .xlsx or .csv file.");
            }
        };
        reader.readAsArrayBuffer(file);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            "text/csv": [".csv"],
            "application/vnd.ms-excel": [".xls"]
        },
        maxFiles: 1,
    });

    return (
        <Card className="w-full h-full shadow-lg shadow-black/5 rounded-xl bg-card/60 backdrop-blur-sm border-muted-foreground/20 flex flex-col min-h-0">
            <CardHeader className="shrink-0">
                <CardTitle>Data Source</CardTitle>
                <CardDescription>Upload an Excel or CSV file to use as variables for your requests.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden flex flex-col space-y-4 min-h-0 pt-0">
                <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors shrink-0 ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                        }`}
                >
                    <input {...getInputProps()} />
                    <div className="flex items-center justify-center space-x-4">
                        <div className="p-2 bg-primary/10 rounded-full shrink-0">
                            <UploadCloud className="w-5 h-5 text-primary" />
                        </div>
                        {isDragActive ? (
                            <p className="text-sm font-medium">Drop the file here ...</p>
                        ) : (
                            <div className="text-left">
                                <p className="text-sm font-medium">
                                    {fileData.length > 0 ? "Replace file" : "Drag & drop or click to upload"}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    .xlsx, .xls, .csv
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-destructive/10 text-destructive rounded-md flex items-center space-x-2 text-sm shrink-0">
                        <AlertCircle className="w-4 h-4" />
                        <span>{error}</span>
                    </div>
                )}

                {fileData.length > 0 && (
                    <div className="flex-1 min-h-0 flex flex-col space-y-3 p-4 bg-muted/50 rounded-lg border overflow-hidden">
                        <div className="flex items-center justify-between shrink-0">
                            <div className="flex items-center space-x-2 text-sm font-medium text-foreground">
                                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                                <span>{fileData.length} rows loaded</span>
                            </div>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 px-3 font-bold border-primary/30 hover:bg-primary/5 active:scale-95 transition-all">
                                        <TableIcon className="w-4 h-4 mr-2" />
                                        Manage Data
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-none h-[90vh] flex flex-col p-0 overflow-hidden bg-background border-primary/20 shadow-2xl shadow-primary/10">
                                    <DialogHeader className="p-6 pb-2 border-b shrink-0">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <DialogTitle className="text-2xl font-black italic tracking-tighter uppercase">Data Management & Preview</DialogTitle>
                                                <DialogDescription className="text-sm font-medium">
                                                    Configure variable types and inspect your data before execution.
                                                </DialogDescription>
                                            </div>
                                        </div>
                                    </DialogHeader>

                                    <div className="flex-1 overflow-auto p-0 border-b relative">
                                        <Table className="border-collapse border-spacing-0">
                                            <TableHeader className="bg-muted/80 backdrop-blur-md sticky top-0 z-20 shadow-sm">
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="w-16 border-r text-center font-bold text-xs uppercase tracking-widest text-muted-foreground">#</TableHead>
                                                    {headers.map((header) => (
                                                        <TableHead key={header} className="min-w-[200px] border-r p-3 bg-muted/50">
                                                            <div className="flex flex-col space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-mono text-sm font-bold text-primary">{`{{${header}}}`}</span>
                                                                    <Badge variant="outline" className="text-[10px] uppercase font-black py-0 px-1 border-primary/20 text-primary/70">
                                                                        {headerTypes[header] || "string"}
                                                                    </Badge>
                                                                </div>
                                                                <Select
                                                                    value={headerTypes[header] || "string"}
                                                                    onValueChange={(val) => setHeaderType(header, val as VariableType)}
                                                                >
                                                                    <SelectTrigger className="h-7 text-[11px] font-bold bg-background/50 border-primary/20 shadow-none focus:ring-0">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="string" className="text-xs">String</SelectItem>
                                                                        <SelectItem value="number" className="text-xs">Number</SelectItem>
                                                                        <SelectItem value="boolean" className="text-xs">Boolean</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </TableHead>
                                                    ))}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {fileData.map((row, idx) => (
                                                    <TableRow key={idx} className="hover:bg-primary/5 transition-colors group">
                                                        <TableCell className="border-r text-center font-mono text-[11px] text-muted-foreground bg-muted/20">{idx + 1}</TableCell>
                                                        {headers.map((header) => {
                                                            const val = row[header];
                                                            const isNum = typeof val === 'number';
                                                            const isBool = typeof val === 'boolean';
                                                            return (
                                                                <TableCell key={header} className="border-r font-medium text-xs truncate max-w-[300px]" title={String(val)}>
                                                                    <span className={isNum ? "text-blue-400" : isBool ? "text-purple-400" : "text-white/80"}>
                                                                        {String(val)}
                                                                    </span>
                                                                </TableCell>
                                                            );
                                                        })}
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <div className="p-4 bg-muted/30 shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                        <p className="text-xs text-muted-foreground font-medium italic underline decoration-primary/30 underline-offset-4 tracking-tight">
                                            Tip: Ensure numeric headers are cast to 'Number' if you require mathematical operations in subsequent steps.
                                        </p>
                                        <Badge variant="secondary" className="font-black text-[10px] uppercase border">
                                            {fileData.length} Rows Ready
                                        </Badge>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col space-y-2">
                            <div className="flex items-center justify-between shrink-0">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Available Variables</p>
                                <p className="text-[9px] text-muted-foreground italic">Click to copy</p>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-primary/10 hover:scrollbar-thumb-primary/20">
                                <div className="flex flex-wrap gap-1.5 pb-2">
                                    {headers.map((header) => (
                                        <Badge
                                            variant="secondary"
                                            key={header}
                                            onClick={() => {
                                                const text = `{{${header}}}`;
                                                navigator.clipboard.writeText(text);
                                            }}
                                            className="font-mono text-[10px] bg-background shadow-sm border px-2 py-0 h-5 cursor-pointer hover:bg-primary/10 hover:border-primary/30 transition-all active:scale-95 group relative"
                                        >
                                            {`{{${header}}}`}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-tight pt-1 border-t shrink-0">
                                Inject variables into URL or Body using double curly braces.
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
