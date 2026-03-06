"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import * as xlsx from "xlsx";
import { UploadCloud, FileSpreadsheet, AlertCircle, Settings2 } from "lucide-react";
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
        <Card className="w-full shadow-lg shadow-black/5 rounded-xl bg-card/60 backdrop-blur-sm border-muted-foreground/20 flex flex-col min-h-0">
            <CardHeader className="shrink-0">
                <CardTitle>Data Source</CardTitle>
                <CardDescription>Upload an Excel or CSV file to use as variables for your requests.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto space-y-4 min-h-0">
                <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                        }`}
                >
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="p-4 bg-primary/10 rounded-full">
                            <UploadCloud className="w-8 h-8 text-primary" />
                        </div>
                        {isDragActive ? (
                            <p className="text-sm font-medium">Drop the file here ...</p>
                        ) : (
                            <div className="space-y-1">
                                <p className="text-sm font-medium">
                                    Drag & drop a file here, or click to select
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Supports .xlsx, .xls, and .csv
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md flex items-center space-x-2 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>{error}</span>
                    </div>
                )}

                {fileData.length > 0 && (
                    <div className="mt-6 space-y-3 p-4 bg-muted/50 rounded-lg border">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-sm font-medium">
                                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                                <span>File loaded successfully ({fileData.length} rows)</span>
                            </div>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8">
                                        <Settings2 className="w-4 h-4 mr-2" />
                                        Manage Data Types
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>Variable Data Types</DialogTitle>
                                        <DialogDescription>
                                            Explicitly cast variables to a string, number, or boolean to prevent formatting issues (e.g. dropping leading 0s).
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="max-h-[60vh] overflow-auto border rounded-md mt-4">
                                        <Table>
                                            <TableHeader className="bg-muted sticky top-0 z-10">
                                                <TableRow>
                                                    <TableHead className="w-[60%]">Variable Name</TableHead>
                                                    <TableHead>Data Type</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {headers.map((header) => (
                                                    <TableRow key={header}>
                                                        <TableCell className="font-mono text-sm">
                                                            {`{{${header}}}`}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Select
                                                                value={headerTypes[header] || "string"}
                                                                onValueChange={(val) => setHeaderType(header, val as VariableType)}
                                                            >
                                                                <SelectTrigger className="h-8 shadow-none focus:ring-0">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="string">String</SelectItem>
                                                                    <SelectItem value="number">Number</SelectItem>
                                                                    <SelectItem value="boolean">Boolean</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <div className="space-y-2 flex-1 min-h-0 flex flex-col">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">Available Variables</p>
                            <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[150px] pr-2 pb-2">
                                {headers.map((header) => (
                                    <Badge variant="secondary" key={header} className="font-mono bg-background shadow-sm border">
                                        {`{{${header}}}`}
                                    </Badge>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 shrink-0">
                                Use these exact variable names in your URL or Request Body.
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
