"use client";

import React, { useState, useEffect, useCallback } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { 
  ArrowRightLeft, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  FileJson,
  Upload,
  Split,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { EtherealAiSymbol } from "@/components/agent/EtherealAiSymbol";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast-provider";
import { computeSemanticDiff, getJSONStructure, normalizeJSONOrder, getSharedValueStructure, type SemanticDiff } from "@/lib/flattener";
import { readFileAsText } from "@/lib/file-utils";

// Mock Sample Data
const sampleLeft = {
  appName: "JSON Nexus",
  version: "1.0.0",
  active: true,
  author: {
    name: "UnrealEmo",
    role: "Lead Architect"
  },
  features: ["compare", "flatten", "excel-export"],
  settings: {
    theme: "dark",
    autoSave: false,
    maxHistory: 50
  }
};

const sampleRight = {
  appName: "JSON Nexus Pro",
  version: "1.1.0",
  active: true,
  author: {
    name: "UnrealEmo",
    role: "Lead Engineer",
    location: "Global"
  },
  features: ["compare", "flatten", "excel-export", "visualizer"],
  settings: {
    theme: "cyberpunk",
    autoSave: true
  }
};

function findLineForPath(jsonStr: string, path: string): number {
  if (!jsonStr || !path) return 1;
  const lines = jsonStr.split("\n");
  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalizedPath.split(".");
  let currentLine = 0;

  for (let pIdx = 0; pIdx < parts.length; pIdx++) {
    const part = parts[pIdx];
    const isIndex = /^\d+$/.test(part);

    for (let i = currentLine; i < lines.length; i++) {
      const line = lines[i];
      const hasKey = line.includes(`"${part}"`);
      const hasIndex = isIndex && (line.includes(`[`) || i - currentLine === parseInt(part) + 1);

      if (hasKey || hasIndex) {
        currentLine = i;
        break;
      }
    }
  }

  return currentLine + 1;
}

const MONACO_COMPARE_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 12,
  fontFamily: "var(--font-geist-mono), monospace",
  lineNumbersMinChars: 3,
  wordWrap: "on" as const,
  formatOnPaste: true,
  automaticLayout: true,
  scrollBeyondLastLine: false,
};

export function JSONCompare() {
  const [leftInput, setLeftInput] = useState<string>("");
  const [rightInput, setRightInput] = useState<string>("");
  const [leftValid, setLeftValid] = useState<boolean | null>(null);
  const [rightValid, setRightValid] = useState<boolean | null>(null);
  const [isDiffActive, setIsDiffActive] = useState<boolean>(false);
  const [showMonacoDiff, setShowMonacoDiff] = useState<boolean>(true);
  const [semanticDiff, setSemanticDiff] = useState<SemanticDiff | null>(null);

  // Syntax and Validation States
  const [leftError, setLeftError] = useState<string>("");
  const [rightError, setRightError] = useState<string>("");

  // Staged comparison values for DiffEditor (avoids runtime parsing crash while user is typing in Monaco)
  const [leftCompareVal, setLeftCompareVal] = useState<string>("");
  const [rightCompareVal, setRightCompareVal] = useState<string>("");

  type DiffMode = "granular" | "structure" | "values";
  const [diffMode, setDiffMode] = useState<DiffMode>("granular");
  const [ignoreArrayOrder, setIgnoreArrayOrder] = useState<boolean>(false);

  const getDiffViewText = (jsonStr: string, side: "left" | "right") => {
    if (!jsonStr) return "";
    try {
      const parsed = JSON.parse(jsonStr);
      
      if (diffMode === "structure") {
        const structure = getJSONStructure(parsed);
        return JSON.stringify(structure, null, 2);
      }
      
      if (diffMode === "values") {
        const otherStr = side === "left" ? rightCompareVal : leftCompareVal;
        if (!otherStr) return jsonStr;
        const otherParsed = JSON.parse(otherStr);
        const { leftIsolated, rightIsolated } = getSharedValueStructure(
          side === "left" ? parsed : otherParsed,
          side === "left" ? otherParsed : parsed
        );
        return JSON.stringify(side === "left" ? leftIsolated : rightIsolated, null, 2);
      }
      
      return jsonStr;
    } catch {
      return jsonStr;
    }
  };

  // Validate Left JSON
  useEffect(() => {
    if (!leftInput.trim()) {
      setLeftValid(null);
      setLeftError("");
      return;
    }
    try {
      JSON.parse(leftInput);
      setLeftValid(true);
      setLeftError("");
    } catch (err: any) {
      setLeftValid(false);
      setLeftError(err?.message || "Invalid JSON syntax");
    }
  }, [leftInput]);

  // Validate Right JSON
  useEffect(() => {
    if (!rightInput.trim()) {
      setRightValid(null);
      setRightError("");
      return;
    }
    try {
      JSON.parse(rightInput);
      setRightValid(true);
      setRightError("");
    } catch (err: any) {
      setRightValid(false);
      setRightError(err?.message || "Invalid JSON syntax");
    }
  }, [rightInput]);

  // Load from localStorage on mount (Safe from SSR Hydration Mismatch)
  useEffect(() => {
    const savedLeft = localStorage.getItem("json_nexus_compare_left");
    const savedRight = localStorage.getItem("json_nexus_compare_right");
    const savedIgnoreOrder = localStorage.getItem("json_nexus_compare_ignore_order");
    const savedDiffMode = localStorage.getItem("json_nexus_compare_diff_mode");

    const ignoreOrder = savedIgnoreOrder === "true";
    const mode = (savedDiffMode as DiffMode) || "granular";

    if (savedLeft) setLeftInput(savedLeft);
    if (savedRight) setRightInput(savedRight);
    setIgnoreArrayOrder(ignoreOrder);
    setDiffMode(mode);

    // Auto-compare on mount if both are valid!
    if (savedLeft && savedRight) {
      try {
        performComparison(savedLeft, savedRight, ignoreOrder);
      } catch {
        // Silent catch for invalid saved JSON
      }
    }
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem("json_nexus_compare_left", leftInput);
  }, [leftInput]);

  useEffect(() => {
    localStorage.setItem("json_nexus_compare_right", rightInput);
  }, [rightInput]);

  useEffect(() => {
    localStorage.setItem("json_nexus_compare_ignore_order", String(ignoreArrayOrder));
  }, [ignoreArrayOrder]);

  useEffect(() => {
    localStorage.setItem("json_nexus_compare_diff_mode", diffMode);
  }, [diffMode]);

  // Format JSON
  const formatJSON = (side: "left" | "right") => {
    const input = side === "left" ? leftInput : rightInput;
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      const formatted = JSON.stringify(parsed, null, 2);
      if (side === "left") setLeftInput(formatted);
      else setRightInput(formatted);
      toast.success(`${side === "left" ? "Left" : "Right"} JSON formatted successfully!`);
    } catch {
      toast.error(`Cannot format invalid ${side} JSON`);
    }
  };

  // Load Mock Data
  const loadSampleData = () => {
    const originalFormatted = JSON.stringify(sampleLeft, null, 2);
    const modifiedFormatted = JSON.stringify(sampleRight, null, 2);
    setLeftInput(originalFormatted);
    setRightInput(modifiedFormatted);
    setLeftCompareVal(originalFormatted);
    setRightCompareVal(modifiedFormatted);
    setIsDiffActive(false);
    setSemanticDiff(null);
    toast.success("Loaded sample comparison JSONs!");
  };

  // Swap Inputs
  const swapInputs = () => {
    const tempInput = leftInput;
    setLeftInput(rightInput);
    setRightInput(tempInput);
    
    const tempCompare = leftCompareVal;
    setLeftCompareVal(rightCompareVal);
    setRightCompareVal(tempCompare);

    setIsDiffActive(false);
    setSemanticDiff(null);
    toast.success("Inputs swapped!");
  };

  // Clear Inputs
  const clearAll = () => {
    setLeftInput("");
    setRightInput("");
    setLeftCompareVal("");
    setRightCompareVal("");
    setIsDiffActive(false);
    setSemanticDiff(null);
    toast.success("Cleared editors");
  };

  // Perform Comparison
  const performComparison = useCallback((leftStr: string, rightStr: string, ignoreOrder: boolean) => {
    const leftParsedRaw = JSON.parse(leftStr);
    const rightParsedRaw = JSON.parse(rightStr);
    const leftParsed = normalizeJSONOrder(leftParsedRaw, ignoreOrder);
    const rightParsed = normalizeJSONOrder(rightParsedRaw, ignoreOrder);
    
    const diff = computeSemanticDiff(leftParsed, rightParsed);
    setSemanticDiff(diff);
    
    setLeftCompareVal(JSON.stringify(leftParsed, null, 2));
    setRightCompareVal(JSON.stringify(rightParsed, null, 2));
    setIsDiffActive(true);
    return diff;
  }, []);

  // Compare Handler
  const handleCompare = useCallback(() => {
    if (!leftInput.trim() || !rightInput.trim()) {
      toast.warning("Please provide both left and right JSON inputs.");
      return;
    }

    try {
      const diff = performComparison(leftInput, rightInput, ignoreArrayOrder);
      if (diff.type === "identical") {
        toast.success("Success! The two JSONs are completely identical.", { duration: 5000 });
      } else {
        const totalChanges = diff.added.length + diff.removed.length + diff.modified.length;
        toast.info(`Comparison complete! Found ${totalChanges} differences.`);
      }
    } catch {
      toast.error("Both inputs must be valid JSON to execute comparison.");
    }
  }, [leftInput, rightInput, ignoreArrayOrder, performComparison]);

  const stateRef = React.useRef({ isDiffActive, leftInput, rightInput });
  useEffect(() => {
    stateRef.current = { isDiffActive, leftInput, rightInput };
  });

  const compareRef = React.useRef(handleCompare);
  useEffect(() => {
    compareRef.current = handleCompare;
  }, [handleCompare]);

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      compareRef.current();
    });
  }, []);

  const diffEditorRef = React.useRef<any>(null);

  useEffect(() => {
    const { isDiffActive: active, leftInput: left, rightInput: right } = stateRef.current;
    if (active && left.trim() && right.trim()) {
      compareRef.current();
    }
  }, [ignoreArrayOrder, diffMode]);

  const scrollToPath = (path: string) => {
    if (!diffEditorRef.current) return;
    try {
      const leftText = getDiffViewText(leftCompareVal, "left");
      const rightText = getDiffViewText(rightCompareVal, "right");
      
      const leftLine = findLineForPath(leftText, path);
      const rightLine = findLineForPath(rightText, path);
      
      const editor = diffEditorRef.current;
      editor.getOriginalEditor().revealLineInCenter(leftLine);
      editor.getModifiedEditor().revealLineInCenter(rightLine);
      
      editor.getOriginalEditor().setPosition({ lineNumber: leftLine, column: 1 });
      editor.getModifiedEditor().setPosition({ lineNumber: rightLine, column: 1 });
      
      toast.success(`Focused difference at: ${path}`, { duration: 1500 });
    } catch (e) {
      console.warn("Failed to scroll to path:", e);
    }
  };

  // Handle file uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, side: "left" | "right") => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      if (side === "left") setLeftInput(text);
      else setRightInput(text);
      toast.success(`Uploaded ${file.name} to ${side} panel.`);
    } catch (err) {
      toast.error("Failed to read file.");
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-neutral-900/40 border border-white/5 backdrop-blur-md">
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={loadSampleData} 
            className="text-xs text-white/60 hover:text-white"
          >
            <EtherealAiSymbol className="w-3.5 h-3.5 mr-2" />
            Sample Data
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={swapInputs} 
            className="text-xs text-white/60 hover:text-white"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 mr-2 text-indigo-400" />
            Swap
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAll} 
            className="text-xs text-red-400/80 hover:text-red-400 hover:bg-red-950/20"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Clear
          </Button>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 mr-2">
            <input
              type="checkbox"
              id="ignore-order"
              checked={ignoreArrayOrder}
              onChange={(e) => {
                setIgnoreArrayOrder(e.target.checked);
              }}
              className="rounded border-white/20 bg-neutral-950 text-indigo-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-indigo-500"
            />
            <label htmlFor="ignore-order" className="text-xs text-white/60 hover:text-white cursor-pointer select-none font-bold uppercase tracking-tight">
              Ignore Order (Keys & Arrays)
            </label>
          </div>
          <Button
            onClick={handleCompare}
            disabled={leftValid === false || rightValid === false || !leftInput || !rightInput}
            className="relative bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-600 hover:to-fuchsia-600 text-white font-bold px-6 shadow-lg shadow-indigo-500/20"
          >
            <Split className="w-4 h-4 mr-2" />
            Compare JSON
          </Button>
        </div>
      </div>

      {/* Raw Inputs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side */}
        <Card className="flex flex-col p-5 bg-[#0a0a0a] border border-white/10 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <h3 className="font-bold text-white/90 text-sm">Original JSON (Left)</h3>
            </div>
            <div className="flex items-center space-x-2">
              {leftValid === true && (
                <span className="flex items-center text-xs text-green-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Valid
                </span>
              )}
              {leftValid === false && (
                <span className="flex items-center text-xs text-red-400 font-medium">
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Invalid
                </span>
              )}
              <Button 
                variant="ghost" 
                size="xs" 
                onClick={() => formatJSON("left")}
                className="h-7 text-xs bg-white/5 border border-white/5 hover:bg-white/10"
              >
                Format
              </Button>
              <label className="h-7 px-2.5 text-xs bg-white/5 border border-white/5 hover:bg-white/10 rounded-md flex items-center justify-center cursor-pointer font-medium text-white/80 hover:text-white transition-colors">
                <Upload className="w-3 h-3 mr-1" />
                Upload
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={(e) => handleFileUpload(e, "left")} 
                  className="hidden" 
                />
              </label>
            </div>
          </div>
          <div className="w-full h-80 rounded-xl border border-white/5 overflow-hidden bg-neutral-950 p-1">
            <Editor
              height="100%"
              defaultLanguage="json"
              theme="vs-dark"
              value={leftInput}
              onChange={(value) => setLeftInput(value ?? "")}
              onMount={handleEditorMount}
              options={MONACO_COMPARE_OPTIONS}
            />
          </div>
          {leftError && (
            <div className="mt-2 text-xs text-red-400 bg-red-950/20 border border-red-900/50 rounded-lg p-2 font-mono flex items-start gap-1.5 animate-in fade-in duration-300">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400" />
              <span>{leftError}</span>
            </div>
          )}
        </Card>

        {/* Right Side */}
        <Card className="flex flex-col p-5 bg-[#0a0a0a] border border-white/10 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" />
              <h3 className="font-bold text-white/90 text-sm">Modified JSON (Right)</h3>
            </div>
            <div className="flex items-center space-x-2">
              {rightValid === true && (
                <span className="flex items-center text-xs text-green-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Valid
                </span>
              )}
              {rightValid === false && (
                <span className="flex items-center text-xs text-red-400 font-medium">
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Invalid
                </span>
              )}
              <Button 
                variant="ghost" 
                size="xs" 
                onClick={() => formatJSON("right")}
                className="h-7 text-xs bg-white/5 border border-white/5 hover:bg-white/10"
              >
                Format
              </Button>
              <label className="h-7 px-2.5 text-xs bg-white/5 border border-white/5 hover:bg-white/10 rounded-md flex items-center justify-center cursor-pointer font-medium text-white/80 hover:text-white transition-colors">
                <Upload className="w-3 h-3 mr-1" />
                Upload
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={(e) => handleFileUpload(e, "right")} 
                  className="hidden" 
                />
              </label>
            </div>
          </div>
          <div className="w-full h-80 rounded-xl border border-white/5 overflow-hidden bg-neutral-950 p-1">
            <Editor
              height="100%"
              defaultLanguage="json"
              theme="vs-dark"
              value={rightInput}
              onChange={(value) => setRightInput(value ?? "")}
              onMount={handleEditorMount}
              options={MONACO_COMPARE_OPTIONS}
            />
          </div>
          {rightError && (
            <div className="mt-2 text-xs text-red-400 bg-red-950/20 border border-red-900/50 rounded-lg p-2 font-mono flex items-start gap-1.5 animate-in fade-in duration-300">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400" />
              <span>{rightError}</span>
            </div>
          )}
        </Card>
      </div>

      {/* Comparison Results */}
      {isDiffActive && semanticDiff && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Semantic Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Status Panel */}
            <Card className={`p-6 border rounded-2xl flex flex-col items-center justify-center text-center ${
              semanticDiff.type === "identical" 
                ? "bg-green-950/10 border-green-500/20 text-green-400" 
                : "bg-indigo-950/10 border-indigo-500/20 text-indigo-400"
            }`}>
              {semanticDiff.type === "identical" ? (
                <>
                  <CheckCircle2 className="w-12 h-12 mb-3 text-green-400" />
                  <h4 className="text-lg font-bold text-white mb-1">Identical structures</h4>
                  <p className="text-xs text-white/50">Both JSON documents contain identical keys, values, and structures.</p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-12 h-12 mb-3 text-indigo-400" />
                  <h4 className="text-lg font-bold text-white mb-1">Differences Found</h4>
                  <p className="text-xs text-white/50">
                    Calculated {semanticDiff.added.length} additions, {semanticDiff.removed.length} removals, and {semanticDiff.modified.length} updates.
                  </p>
                </>
              )}
            </Card>

            {/* Added & Removed Breakdown */}
            <Card className="p-6 bg-[#0a0a0a] border border-white/10 rounded-2xl">
              <h4 className="font-bold text-white/90 text-sm mb-3 flex items-center justify-between">
                <span>Structure Modifications</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-white/40">Keys</span>
              </h4>
              <div className="space-y-4 max-h-[140px] overflow-y-auto pr-1">
                {semanticDiff.added.length === 0 && semanticDiff.removed.length === 0 ? (
                  <div className="text-xs text-white/40 italic flex items-center justify-center h-24">
                    No keys added or removed
                  </div>
                ) : (
                  <div className="space-y-2">
                    {semanticDiff.added.map((k) => (
                      <div key={`add-${k}`} className="flex items-center text-xs justify-between bg-green-500/10 border border-green-500/20 rounded-md p-1.5 text-green-400 font-mono cursor-pointer hover:bg-green-500/20 transition-colors" onClick={() => scrollToPath(k)}>
                        <span className="truncate max-w-[200px]" title={k}>+ {k}</span>
                        <span className="text-[9px] uppercase font-bold bg-green-500/20 px-1 py-0.2 rounded">Added</span>
                      </div>
                    ))}
                    {semanticDiff.removed.map((k) => (
                      <div key={`rem-${k}`} className="flex items-center text-xs justify-between bg-red-500/10 border border-red-500/20 rounded-md p-1.5 text-red-400 font-mono cursor-pointer hover:bg-red-500/20 transition-colors" onClick={() => scrollToPath(k)}>
                        <span className="truncate max-w-[200px]" title={k}>- {k}</span>
                        <span className="text-[9px] uppercase font-bold bg-red-500/20 px-1 py-0.2 rounded">Removed</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
 
            {/* Value Changes Breakdown */}
            <Card className="p-6 bg-[#0a0a0a] border border-white/10 rounded-2xl">
              <h4 className="font-bold text-white/90 text-sm mb-3 flex items-center justify-between">
                <span>Value Modifications</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-white/40">{semanticDiff.modified.length} Changed</span>
              </h4>
              <div className="space-y-3 max-h-[140px] overflow-y-auto pr-1">
                {semanticDiff.modified.length === 0 ? (
                  <div className="text-xs text-white/40 italic flex items-center justify-center h-24">
                    No values modified
                  </div>
                ) : (
                  <div className="space-y-2">
                    {semanticDiff.modified.map((item, idx) => (
                      <div key={`mod-${idx}`} className="text-xs bg-indigo-500/5 border border-indigo-500/10 hover:bg-indigo-500/10 transition-colors rounded-lg p-2 font-mono cursor-pointer" onClick={() => scrollToPath(item.path)}>
                        <div className="font-bold text-indigo-400 truncate text-[11px] mb-1" title={item.path}>
                          {item.path}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-white/55 mt-0.5">
                          <div className="truncate border-r border-white/5 pr-1">
                            <span className="text-red-400 mr-0.5">Old:</span> 
                            {typeof item.oldValue === "object" ? JSON.stringify(item.oldValue) : String(item.oldValue)}
                          </div>
                          <div className="truncate pl-1">
                            <span className="text-green-400 mr-0.5">New:</span> 
                            {typeof item.newValue === "object" ? JSON.stringify(item.newValue) : String(item.newValue)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Monaco Diff Editor Panel */}
          <Card className="border border-white/10 rounded-3xl overflow-hidden bg-neutral-950">
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#080808]">
              <div className="flex items-center space-x-2">
                <FileJson className="w-4 h-4 text-indigo-400" />
                <h4 className="font-bold text-white text-sm">Visual Diff Grid</h4>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {showMonacoDiff && (
                  <div className="flex items-center bg-neutral-900 border border-white/5 rounded-lg p-0.5 sm:p-1 gap-1">
                    <button
                      onClick={() => setDiffMode("granular")}
                      className={`px-3 py-1 text-[10px] uppercase font-bold tracking-tight rounded-md transition-all duration-200 cursor-pointer ${
                        diffMode === "granular"
                          ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 shadow-md shadow-indigo-500/5 font-bold"
                          : "text-white/40 hover:text-white/80"
                      }`}
                    >
                      Granular
                    </button>
                    <button
                      onClick={() => setDiffMode("structure")}
                      className={`px-3 py-1 text-[10px] uppercase font-bold tracking-tight rounded-md transition-all duration-200 cursor-pointer ${
                        diffMode === "structure"
                          ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 shadow-md shadow-indigo-500/5 font-bold"
                          : "text-white/40 hover:text-white/80"
                      }`}
                    >
                      Structure
                    </button>
                    <button
                      onClick={() => setDiffMode("values")}
                      className={`px-3 py-1 text-[10px] uppercase font-bold tracking-tight rounded-md transition-all duration-200 cursor-pointer ${
                        diffMode === "values"
                          ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 shadow-md shadow-indigo-500/5 font-bold"
                          : "text-white/40 hover:text-white/80"
                      }`}
                    >
                      Values Only
                    </button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowMonacoDiff(!showMonacoDiff)}
                  className="text-xs bg-white/5 text-white/60 hover:text-white h-8"
                >
                  {showMonacoDiff ? (
                    <>Hide Visual Diff <ChevronUp className="w-3.5 h-3.5 ml-1" /></>
                  ) : (
                    <>Show Visual Diff <ChevronDown className="w-3.5 h-3.5 ml-1" /></>
                  )}
                </Button>
              </div>
            </div>
            
            {showMonacoDiff && (
              <div className="border-t border-white/5 p-1 h-[450px]">
                <DiffEditor
                  original={getDiffViewText(leftCompareVal, "left")}
                  modified={getDiffViewText(rightCompareVal, "right")}
                  language="json"
                  theme="vs-dark"
                  height="100%"
                  onMount={(editor) => {
                    diffEditorRef.current = editor;
                  }}
                  options={{
                    automaticLayout: true,
                    originalEditable: false,
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    renderSideBySide: true,
                    wordWrap: "on",
                    fontFamily: "Geist Mono, monospace",
                    fontSize: 12,
                    lineNumbersMinChars: 3,
                    scrollbar: {
                      verticalScrollbarSize: 8,
                      horizontalScrollbarSize: 8
                    }
                  }}
                />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
