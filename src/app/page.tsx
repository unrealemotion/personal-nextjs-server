import React from "react";
import { FileUploader } from "@/components/uploader/FileUploader";
import { RequestDesigner } from "@/components/editor/RequestDesigner";
import { ExecutionPanel } from "@/components/execution/ExecutionPanel";
import { ResultsTable } from "@/components/results/ResultsTable";
import { Layers, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen relative bg-background text-foreground font-sans selection:bg-primary/20 overflow-hidden">
      {/* Premium Background Effects */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] rounded-full bg-primary/5 blur-[100px]" />
      </div>

      <header className="border-b border-border/40 bg-background/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-primary to-primary/60 p-2 rounded-xl shadow-lg shadow-primary/20">
              <Layers className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              API Orchestrator
            </h1>
          </div>
          <div className="hidden sm:flex items-center space-x-2 text-xs font-medium text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-full border border-border/50 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Premium Workspace</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl px-4 py-8 space-y-8 relative z-10">
        {/* Top Region: Uploader & Configurator */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:h-[700px]">
          <div className="lg:col-span-4 space-y-4 h-full flex flex-col min-h-0">
            <div className="flex-[1.5] min-h-0 flex">
              <FileUploader />
            </div>
            <div className="flex-1 shrink-0">
              <ExecutionPanel />
            </div>
          </div>

          <div className="lg:col-span-8 h-[600px] lg:h-full flex min-h-0">
            <RequestDesigner />
          </div>
        </div>

        {/* Bottom Region: Results */}
        <div className="pt-4 mt-8">
          <ResultsTable />
        </div>
      </main>
    </div>
  );
}
