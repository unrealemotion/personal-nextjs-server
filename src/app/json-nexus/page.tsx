"use client";

import React from "react";
import Link from "next/link";
import { JSONToTable } from "@/components/json-nexus/JSONToTable";
import { JSONCompare } from "@/components/json-nexus/JSONCompare";
import { Table as TableIcon, ArrowRightLeft, Layers, Sparkles, BookOpen } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function JSONNexusPage() {
  return (
    <div className="min-h-screen relative bg-[#050505] text-white font-sans selection:bg-indigo-500/30 overflow-x-hidden">

      {/* Premium Ambient Background Effects */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[130px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-fuchsia-500/5 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <main className="container mx-auto max-w-7xl px-6 py-8 md:py-12 relative z-10">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-none mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/50">
              JSON Nexus
            </h2>
            <p className="text-sm md:text-base text-white/50 leading-relaxed font-light">
              An environment to compare complex JSON structures side-by-side or convert, flatten, and split nested objects and lists recursively into dynamic grids.
            </p>
          </div>
          <Link
            href="/json-nexus/docs"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-white/80 hover:text-white transition-all w-fit cursor-pointer shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            View Docs
          </Link>
        </div>

        {/* Tab Selection */}
        <Tabs defaultValue="to-table" className="space-y-8">
          <div className="flex justify-center md:justify-start">
            <TabsList className="bg-neutral-900/80 border border-white/5 p-1 rounded-xl h-11">
              <TabsTrigger
                value="to-table"
                className="px-5 py-2 text-xs font-bold gap-2 tracking-wide uppercase duration-300 data-[state=active]:bg-white/10"
              >
                <TableIcon className="w-3.5 h-3.5 text-indigo-400" />
                JSON to Table Grid
              </TabsTrigger>
              <TabsTrigger
                value="compare"
                className="px-5 py-2 text-xs font-bold gap-2 tracking-wide uppercase duration-300 data-[state=active]:bg-white/10"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-fuchsia-400" />
                JSON Compare & Diff
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="to-table" className="outline-none focus:outline-none">
            <JSONToTable />
          </TabsContent>

          <TabsContent value="compare" className="outline-none focus:outline-none">
            <JSONCompare />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
