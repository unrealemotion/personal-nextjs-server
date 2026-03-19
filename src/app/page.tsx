import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Wrench, Zap, ChevronRight, Github, Code2, BookOpen } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-indigo-500/30 overflow-x-hidden relative">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-500/10 blur-[150px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>

      {/* Navbar */}


      <main className="max-w-7xl mx-auto px-6 pt-24 pb-32 relative">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-32 relative">


          <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-[1.1] mb-6">
            <span className="bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/40">
              UnrealEmo's Tools
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-white/50 leading-relaxed font-light mt-4">
            My personal tool collection
          </p>
        </div>

        {/* Tools Grid */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center space-x-3 mb-8">
            <Wrench className="w-6 h-6 text-indigo-400" />
            <span>Available Tools</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Tool Card: API Surge */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 rounded-[2rem] blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
              <div className="relative h-full flex flex-col p-8 rounded-3xl bg-[#0a0a0a] border border-white/10 hover:border-white/20 transition-all duration-300">
                <Link href="/surge" className="absolute inset-0 z-0">
                  <span className="sr-only">Go to API Surge</span>
                </Link>

                <div className="flex items-start justify-between mb-8 pointer-events-none">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/20">
                    <Zap className="w-7 h-7" />
                  </div>
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-white/40 group-hover:bg-indigo-500 group-hover:text-white transition-colors duration-300">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>

                <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-white/60 transition-all pointer-events-none">
                  API Surge
                </h3>

                <p className="text-white/50 leading-relaxed font-medium mb-6 flex-grow pointer-events-none">
                  High-performance API testing and orchestrator. Execute sequential chains across massive datasets with conditional logic.
                </p>

                <div className="flex flex-wrap gap-2 mt-auto relative z-10">
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-white/60 font-medium">Orchestration</span>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-white/60 font-medium">API Testing</span>
                  <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-400 font-medium">Active</span>
                  <Link
                    href="/surge/docs"
                    className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/60 hover:text-white transition-colors font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <BookOpen className="w-3 h-3" />
                    Docs
                  </Link>
                </div>
              </div>
            </div>

            {/* Placeholder for future tools */}
            <div className="h-full flex flex-col items-center justify-center p-8 rounded-3xl bg-[#0a0a0a]/50 border border-white/5 border-dashed text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 mb-4 ring-1 ring-white/5">
                <Wrench className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white/30 mb-2">More coming soon</h3>
              <p className="text-sm text-white/20">New tools are being crafted in the workshop.</p>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}
