"use client";

import React, { useState } from "react";
import { useLocalTransition } from "@/lib/transitions";
import { LoadingTransition } from "@/components/layout/LoadingTransition";
import { JSONToTable } from "@/components/json-nexus/JSONToTable";
import { JSONCompare } from "@/components/json-nexus/JSONCompare";
import { Table as TableIcon, ArrowRightLeft, Sparkles } from "lucide-react";

export default function JSONNexusPage() {
  const [activeTab, setActiveTab] = useState("to-table");
  const [isPending, startLocalTransition] = useLocalTransition();

  return (
    <div className="flex flex-col flex-grow relative bg-[#050505] text-white font-sans selection:bg-indigo-500/30">
      
      {/* Premium Ambient Background Effects */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[130px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-fuchsia-500/5 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      {/* Compact Sticky Header */}
      <header className="sticky top-16 z-45 w-full bg-neutral-950/80 backdrop-blur-md border-b border-white/5 shadow-sm shrink-0">
        <div className="w-full px-4 lg:px-8 xl:px-12 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-2 text-xs font-bold text-white/60">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>JSON Nexus Workspace</span>
          </div>

          {/* View Switcher Tabs */}
          <div className="flex items-center bg-neutral-900/50 p-0.5 rounded-xl border border-white/5">
            <button
              onClick={() => startLocalTransition(() => setActiveTab("to-table"))}
              className={`px-3.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "to-table"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <TableIcon className="w-3.5 h-3.5" />
                JSON to Table
              </span>
            </button>
            <button
              onClick={() => startLocalTransition(() => setActiveTab("compare"))}
              className={`px-3.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "compare"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                JSON Compare
              </span>
            </button>
          </div>

          <div className="w-24 hidden md:block" />
        </div>
      </header>

      {/* Main Feature Container */}
      <main className="flex-grow w-full px-4 lg:px-8 xl:px-12 py-6 relative z-10 flex flex-col min-h-0">
        <div className="relative flex-grow flex flex-col min-h-[500px]">
          <LoadingTransition local isLoading={isPending} />
          {activeTab === "to-table" ? (
            <JSONToTable />
          ) : (
            <JSONCompare />
          )}
        </div>
      </main>

    </div>
  );
}
