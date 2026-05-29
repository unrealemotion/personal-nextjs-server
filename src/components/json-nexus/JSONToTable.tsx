"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  useReactTable, 
  getCoreRowModel, 
  getPaginationRowModel, 
  getFilteredRowModel, 
  getSortedRowModel, 
  flexRender, 
  type ColumnDef 
} from "@tanstack/react-table";
import { 
  Table as TableIcon, 
  Download, 
  Trash2, 
  Sparkles, 
  Eye, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Search, 
  SlidersHorizontal,
  Info,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Upload,
  ArrowUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import Editor from "@monaco-editor/react";
import { jsonToTableData, getColumnsFromRows } from "@/lib/flattener";

// Sample Data
const sampleComplexJSON = [
  {
    "id": "USR-101",
    "info": {
      "fullName": "Alice Vance",
      "department": "Engineering"
    },
    "skills": ["TypeScript", "Bun"],
    "systems": ["Ubuntu", "macOS"]
  },
  {
    "id": "USR-102",
    "info": {
      "fullName": "Bob Mercer",
      "department": "Design"
    },
    "skills": ["Figma", "Tailwind"],
    "systems": ["Windows"]
  }
];

// Helper to instantiate inline Web Worker for CPU-intensive JSON parsing & flattening
const createParserWorker = () => {
  const code = `
    function jsonToTableData(jsonVal, options) {
      if (jsonVal === null || jsonVal === undefined) return [];
      if (Array.isArray(jsonVal)) {
        const allRows = [];
        for (let i = 0; i < jsonVal.length; i++) {
          allRows.push(...expandItem(jsonVal[i], options));
        }
        return allRows;
      }
      return expandItem(jsonVal, options);
    }

    function expandItem(item, options) {
      if (item === null || typeof item !== "object") {
        return [{ value: item }];
      }
      let currentRows = [{}];
      function processField(rows, val, path) {
        if (val === null || val === undefined) {
          return rows.map(r => {
            const next = {};
            for (let k in r) next[k] = r[k];
            next[path] = null;
            return next;
          });
        }
        if (Array.isArray(val)) {
          if (options.splitArrays) {
            if (val.length === 0) {
              return rows.map(r => {
                const next = {};
                for (let k in r) next[k] = r[k];
                next[path] = null;
                return next;
              });
            }
            const nextRows = [];
            for (let i = 0; i < rows.length; i++) {
              const r = rows[i];
              for (let j = 0; j < val.length; j++) {
                const el = val[j];
                const subRows = expandValue(el, path);
                for (let k = 0; k < subRows.length; k++) {
                  const subRow = subRows[k];
                  const next = {};
                  for (let key in r) next[key] = r[key];
                  for (let key in subRow) next[key] = subRow[key];
                  nextRows.push(next);
                }
              }
            }
            return nextRows;
          } else {
            return rows.map(r => {
              const next = {};
              for (let k in r) next[k] = r[k];
              next[path] = JSON.stringify(val);
              return next;
            });
          }
        }
        if (typeof val === "object") {
          if (options.flattenObjects) {
            const keys = Object.keys(val);
            if (keys.length === 0) {
              return rows.map(r => {
                const next = {};
                for (let k in r) next[k] = r[k];
                next[path] = "{}";
                return next;
              });
            }
            let tempRows = [...rows];
            for (let i = 0; i < keys.length; i++) {
              const k = keys[i];
              const subPath = path ? path + "." + k : k;
              tempRows = processField(tempRows, val[k], subPath);
            }
            return tempRows;
          } else {
            return rows.map(r => {
              const next = {};
              for (let k in r) next[k] = r[k];
              next[path] = JSON.stringify(val);
              return next;
            });
          }
        }
        return rows.map(r => {
          const next = {};
          for (let k in r) next[k] = r[k];
          next[path] = val;
          return next;
        });
      }

      function expandValue(val, path) {
        if (val === null || val === undefined) {
          return [{ [path]: null }];
        }
        if (Array.isArray(val)) {
          if (options.splitArrays) {
            if (val.length === 0) {
              return [{ [path]: null }];
            }
            const nextRows = [];
            for (let i = 0; i < val.length; i++) {
              nextRows.push(...expandValue(val[i], path));
            }
            return nextRows;
          } else {
            return [{ [path]: JSON.stringify(val) }];
          }
        }
        if (typeof val === "object") {
          if (options.flattenObjects) {
            let subRows = [{}];
            const keys = Object.keys(val);
            if (keys.length === 0) {
              return [{ [path]: "{}" }];
            }
            for (let i = 0; i < keys.length; i++) {
              const k = keys[i];
              const subPath = path ? path + "." + k : k;
              subRows = processField(subRows, val[k], subPath);
            }
            return subRows;
          } else {
            return [{ [path]: JSON.stringify(val) }];
          }
        }
        return [{ [path]: val }];
      }

      const keys = Object.keys(item);
      if (keys.length === 0) {
        return [{}];
      }
      for (let i = 0; i < keys.length; i++) {
        currentRows = processField(currentRows, item[keys[i]], keys[i]);
      }
      return currentRows;
    }

    function getColumnsFromRows(rows) {
      const columnsSet = new Set();
      for (let i = 0; i < rows.length; i++) {
        const keys = Object.keys(rows[i]);
        for (let j = 0; j < keys.length; j++) {
          columnsSet.add(keys[j]);
        }
      }
      return Array.from(columnsSet);
    }

    self.onmessage = function(e) {
      const { jsonInput, flattenObjects, splitArrays } = e.data;
      try {
        const parsed = JSON.parse(jsonInput);
        const originalItemCount = Array.isArray(parsed) ? parsed.length : 1;
        const flatRows = jsonToTableData(parsed, { flattenObjects, splitArrays });
        const columns = getColumnsFromRows(flatRows);
        self.postMessage({
          success: true,
          flatRows: flatRows,
          columns: columns,
          originalItemCount: originalItemCount
        });
      } catch (err) {
        self.postMessage({
          success: false,
          error: err.message || "Failed to parse JSON content"
        });
      }
    };
  `;
  const blob = new Blob([code], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob));
};

// Component to only render rows in-view for high performance with large tables
function ObservedRow({ row, children }: { row: any; children: React.ReactNode }) {
  const [isInView, setIsInView] = useState(false);
  const ref = React.useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      {
        rootMargin: "300px 0px", // Pre-render buffer for smooth scrolling
        threshold: 0.001,
      }
    );

    observer.observe(el);
    return () => {
      observer.unobserve(el);
    };
  }, []);

  if (!isInView) {
    return (
      <tr ref={ref} className="h-[45px]">
        <td colSpan={row.getVisibleCells().length} className="p-0">
          <div className="h-[45px] w-full" />
        </td>
      </tr>
    );
  }

  return (
    <tr ref={ref} className="hover:bg-white/[0.02] transition-colors">
      {children}
    </tr>
  );
}

export function JSONToTable() {
  const [jsonInput, setJsonInput] = useState<string>("");
  const [flattenObjects, setFlattenObjects] = useState<boolean>(true);
  const [splitArrays, setSplitArrays] = useState<boolean>(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

  // Converted results state
  const [convertedRows, setConvertedRows] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [originalCount, setOriginalCount] = useState<number>(0);
  const [isConverted, setIsConverted] = useState<boolean>(false);

  // Syntax and Validation States
  const [jsonError, setJsonError] = useState<string>("");
  const [isValidJson, setIsValidJson] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    if (!jsonInput.trim()) {
      setIsValidJson(null);
      setJsonError("");
      return;
    }
    try {
      JSON.parse(jsonInput);
      setIsValidJson(true);
      setJsonError("");
    } catch (err: any) {
      setIsValidJson(false);
      setJsonError(err?.message || "Invalid JSON syntax");
    }
  }, [jsonInput]);

  // Load from localStorage on mount (Safe from SSR Hydration Mismatch)
  useEffect(() => {
    const savedInput = localStorage.getItem("json_nexus_table_input");
    const savedFlatten = localStorage.getItem("json_nexus_table_flatten");
    const savedSplit = localStorage.getItem("json_nexus_table_split");

    const optFlatten = savedFlatten !== null ? savedFlatten === "true" : true;
    const optSplit = savedSplit !== null ? savedSplit === "true" : true;

    if (savedInput) {
      setJsonInput(savedInput);
      setFlattenObjects(optFlatten);
      setSplitArrays(optSplit);
      
      // Auto-convert on mount if JSON is valid!
      try {
        const parsed = JSON.parse(savedInput);
        const originalItemCount = Array.isArray(parsed) ? parsed.length : 1;
        setOriginalCount(originalItemCount);
        
        const flatRows = jsonToTableData(parsed, { flattenObjects: optFlatten, splitArrays: optSplit });
        const columns = getColumnsFromRows(flatRows);
        
        setConvertedRows(flatRows);
        setTableColumns(columns);
        setIsConverted(true);
        
        const vis: Record<string, boolean> = {};
        columns.forEach(col => { vis[col] = true; });
        setColumnVisibility(vis);
      } catch {
        // Silent catch for invalid saved JSON
      }
    }
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem("json_nexus_table_input", jsonInput);
  }, [jsonInput]);

  useEffect(() => {
    localStorage.setItem("json_nexus_table_flatten", String(flattenObjects));
  }, [flattenObjects]);

  useEffect(() => {
    localStorage.setItem("json_nexus_table_split", String(splitArrays));
  }, [splitArrays]);

  // Load Mock Data
  const loadSample = () => {
    setJsonInput(JSON.stringify(sampleComplexJSON, null, 2));
    setIsConverted(false);
    setConvertedRows([]);
    toast.success("Loaded complex sample JSON!");
  };

  // Clear Editor
  const clearAll = () => {
    setJsonInput("");
    setConvertedRows([]);
    setTableColumns([]);
    setIsConverted(false);
    setGlobalFilter("");
    setColumnVisibility({});
    toast.success("Cleared inputs & outputs");
  };

  // Parse and Convert via Web Worker
  const handleConvert = () => {
    if (!jsonInput.trim()) {
      toast.warning("Please enter some JSON content first.");
      return;
    }

    setIsProcessing(true);
    const worker = createParserWorker();

    worker.onmessage = (e) => {
      setIsProcessing(false);
      worker.terminate();

      if (e.data.success) {
        const { flatRows, columns, originalItemCount } = e.data;
        setOriginalCount(originalItemCount);
        setConvertedRows(flatRows);
        setTableColumns(columns);
        setIsConverted(true);

        const vis: Record<string, boolean> = {};
        columns.forEach((col: string) => {
          vis[col] = true;
        });
        setColumnVisibility(vis);

        const expFactor = flatRows.length / originalItemCount;
        if (expFactor > 1) {
          toast.success(`Success! Generated ${flatRows.length} rows (${expFactor.toFixed(1)}x expansion due to array splitting).`);
        } else {
          toast.success(`Success! Generated ${flatRows.length} rows.`);
        }
      } else {
        toast.error(`Invalid JSON: ${e.data.error || "Failed to parse content"}`);
      }
    };

    worker.onerror = (err) => {
      setIsProcessing(false);
      worker.terminate();
      toast.error(`Worker error: ${err.message || "Failed to convert JSON"}`);
    };

    worker.postMessage({
      jsonInput,
      flattenObjects,
      splitArrays
    });
  };

  const convertRef = React.useRef(handleConvert);
  useEffect(() => {
    convertRef.current = handleConvert;
  }, [handleConvert]);

  // Export to CSV
  const handleExportCSV = () => {
    if (convertedRows.length === 0) return;
    try {
      const worksheet = XLSX.utils.json_to_sheet(convertedRows);
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
      
      const blob = new Blob([csvOutput], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "json_nexus_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("CSV file downloaded successfully!");
    } catch (err) {
      toast.error("Failed to export CSV file.");
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (convertedRows.length === 0) return;
    try {
      const worksheet = XLSX.utils.json_to_sheet(convertedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "JSON_Nexus_Export");
      
      XLSX.writeFile(workbook, "json_nexus_export.xlsx");
      toast.success("Excel file (.xlsx) downloaded successfully!");
    } catch (err) {
      toast.error("Failed to export Excel file.");
    }
  };

  // Handle Drag & Drop / File Uploads
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        setJsonInput(text);
        setIsConverted(false);
        setConvertedRows([]);
        toast.success(`Uploaded ${file.name} successfully.`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // TanStack Table Setup
  const memoizedColumns = useMemo<ColumnDef<any>[]>(() => {
    return tableColumns.map((col) => ({
      accessorFn: (row) => row[col],
      id: col,
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="hover:bg-white/5 text-[11px] font-bold text-white/70 uppercase tracking-wider p-1"
          >
            {col}
            <ArrowUpDown className="ml-1 w-3 h-3" />
          </Button>
        );
      },
      cell: (info) => {
        const val = info.getValue();
        if (val === null || val === undefined) {
          return <span className="text-white/25 italic text-xs">null</span>;
        }
        if (typeof val === "boolean") {
          return (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              val ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" : "bg-rose-500/10 text-rose-400 border border-rose-500/25"
            }`}>
              {String(val)}
            </span>
          );
        }
        if (typeof val === "object") {
          return <span className="font-mono text-white/50 text-[11px] truncate max-w-[150px]" title={JSON.stringify(val)}>{JSON.stringify(val)}</span>;
        }
        return <span className="text-xs text-white/80">{String(val)}</span>;
      }
    }));
  }, [tableColumns]);

  const table = useReactTable({
    data: convertedRows,
    columns: memoizedColumns,
    state: {
      globalFilter,
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Editor Inputs */}
        <div className="lg:col-span-8 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white/90 flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-indigo-400" />
              Source JSON Editor
              {isValidJson === true && (
                <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/25 px-1.5 py-0.5 rounded font-mono font-bold uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Valid JSON
                </span>
              )}
              {isValidJson === false && (
                <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 rounded font-mono font-bold uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Syntax Error
                </span>
              )}
            </h3>
            <div className="flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={loadSample}
                className="text-xs text-white/60 hover:text-white"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                Load Sample
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearAll}
                className="text-xs text-red-400/80 hover:text-red-400 hover:bg-red-950/20"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
              <label className="h-8 px-3 text-xs bg-white/5 border border-white/5 hover:bg-white/10 rounded-md flex items-center justify-center cursor-pointer font-medium text-white/80 hover:text-white transition-colors">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload File
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
              </label>
            </div>
          </div>
          
          <div className="w-full h-80 rounded-2xl border border-white/5 overflow-hidden bg-neutral-950 p-1">
            <Editor
              height="100%"
              defaultLanguage="json"
              theme="vs-dark"
              value={jsonInput}
              onChange={(value) => {
                setJsonInput(value ?? "");
                setIsConverted(false);
              }}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                  convertRef.current();
                });
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                fontFamily: "var(--font-geist-mono), monospace",
                lineNumbersMinChars: 3,
                wordWrap: "on",
                formatOnPaste: true,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          </div>
          {jsonError && (
            <div className="text-xs text-red-400 bg-red-950/20 border border-red-900/50 rounded-xl p-3 flex items-start gap-2 font-mono animate-in fade-in duration-300">
              <Info className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
              <span>{jsonError}</span>
            </div>
          )}
        </div>

        {/* Configuration Panel */}
        <div className="lg:col-span-4 flex flex-col space-y-4">
          <Card className="p-6 bg-[#0a0a0a] border border-white/10 rounded-2xl h-full flex flex-col justify-between">
            <div className="space-y-6">
              <h3 className="font-bold text-sm text-white/90 border-b border-white/5 pb-2">
                Conversion Options
              </h3>

              {/* Toggles */}
              <div className="space-y-5">
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="flatten" 
                    checked={flattenObjects} 
                    onCheckedChange={(checked) => {
                      setFlattenObjects(!!checked);
                      setIsConverted(false);
                    }}
                    className="border-white/20 mt-0.5 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="flatten" className="text-sm font-bold text-white/85 cursor-pointer">
                      Flatten Nested Objects
                    </Label>
                    <p className="text-xs text-white/40 leading-relaxed">
                      Converts sub-objects recursively using dot-notation schemas (e.g. `info.fullName`).
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="split" 
                    checked={splitArrays} 
                    onCheckedChange={(checked) => {
                      setSplitArrays(!!checked);
                      setIsConverted(false);
                    }}
                    className="border-white/20 mt-0.5 data-[state=checked]:bg-fuchsia-500 data-[state=checked]:border-fuchsia-500"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="split" className="text-sm font-bold text-white/85 cursor-pointer">
                      Split Arrays into Rows
                    </Label>
                    <p className="text-xs text-white/40 leading-relaxed">
                      Breaks multiple values in lists (e.g. `skills: [TS, Bun]`) recursively into distinct parallel lines.
                    </p>
                  </div>
                </div>
              </div>

              {/* Informative Alert */}
              <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3.5 flex items-start space-x-2.5">
                <Info className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-white/50 leading-normal">
                  Skipped configurations will stringify items into raw fields (e.g. JSON strings), preserving the record boundary structure.
                </p>
              </div>
            </div>

            <Button
              onClick={handleConvert}
              disabled={!jsonInput.trim() || isProcessing}
              className="w-full mt-6 bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-600 hover:to-fuchsia-600 text-white font-bold h-11 rounded-xl shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                "Generate Table Grid"
              )}
            </Button>
          </Card>
        </div>
      </div>

      {/* Grid Results Section */}
      {isConverted && convertedRows.length > 0 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 bg-[#0a0a0a] border border-white/5 flex items-center space-x-3.5 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-white/40">Generated Rows</div>
                <div className="font-bold text-white text-lg flex items-baseline space-x-1.5">
                  <span>{convertedRows.length}</span>
                  {convertedRows.length > originalCount && (
                    <span className="text-[10px] text-green-400 bg-green-500/10 px-1 rounded">
                      +{convertedRows.length - originalCount} expanded
                    </span>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-[#0a0a0a] border border-white/5 flex items-center space-x-3.5 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-white/40">Unique Columns</div>
                <div className="font-bold text-white text-lg">{tableColumns.length} fields</div>
              </div>
            </Card>

            <Card className="p-4 bg-[#0a0a0a] border border-white/5 flex items-center space-x-3.5 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-400">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-white/40">Input Records</div>
                <div className="font-bold text-white text-lg">{originalCount} original items</div>
              </div>
            </Card>
          </div>

          {/* Grid Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-neutral-900/40 border border-white/5 backdrop-blur-md">
            
            {/* Left: Search input */}
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                placeholder="Search across all fields..."
                value={globalFilter ?? ""}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-10 h-9 bg-neutral-950 border-white/10 text-white rounded-lg text-xs placeholder:text-white/20 focus:border-indigo-500/50"
              />
            </div>

            {/* Right: Columns hide/show & Download Exports */}
            <div className="flex items-center space-x-3">
              {/* Export CSV */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="h-9 text-xs border-white/10 text-white/80 hover:text-white bg-neutral-950 hover:bg-neutral-900 gap-1.5 rounded-lg"
              >
                <FileText className="w-3.5 h-3.5 text-orange-400" />
                Export CSV
              </Button>

              {/* Export Excel */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="h-9 text-xs border-white/10 text-white/80 hover:text-white bg-neutral-950 hover:bg-neutral-900 gap-1.5 rounded-lg"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-green-400" />
                Export Excel
              </Button>
            </div>
          </div>

          {/* Table Container */}
          <Card className="border border-white/5 rounded-2xl bg-[#080808] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-white/5 bg-[#0a0a0a]">
                      {headerGroup.headers.map((header) => (
                        <th 
                          key={header.id} 
                          className="px-4 py-3 text-xs font-bold text-white/70 tracking-wide select-none"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-white/5">
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={tableColumns.length} className="px-4 py-12 text-center text-xs text-white/30 italic">
                        No rows found matching search query
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <ObservedRow key={row.id} row={row}>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3 text-xs align-middle">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </ObservedRow>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {table.getPageCount() > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-white/5 bg-[#0a0a0a]">
                <div className="flex items-center gap-4 text-xs text-white/40 flex-wrap">
                  <span>
                    Showing page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} ({convertedRows.length} rows)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span>Rows per page:</span>
                    <select
                      value={table.getState().pagination.pageSize}
                      onChange={(e) => {
                        table.setPageSize(Number(e.target.value));
                      }}
                      className="bg-neutral-950 border border-white/10 text-white rounded px-2 py-0.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      {[10, 50, 100, 500, 1000].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                    className="w-8 h-8 rounded-md bg-white/5 border border-white/5 hover:bg-white/10"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="w-8 h-8 rounded-md bg-white/5 border border-white/5 hover:bg-white/10"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="w-8 h-8 rounded-md bg-white/5 border border-white/5 hover:bg-white/10"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                    className="w-8 h-8 rounded-md bg-white/5 border border-white/5 hover:bg-white/10"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
