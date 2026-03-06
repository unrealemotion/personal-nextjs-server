import React from "react";
import Link from "next/link";
import { Layers, Rocket, Zap, Shield, ChevronRight, BarChart3, Globe } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-primary/30 overflow-x-hidden">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Navigation */}
      <nav className="container mx-auto max-w-7xl px-6 py-8 flex items-center justify-between relative z-50">
        <div className="flex items-center space-x-3 group">
          <div className="bg-gradient-to-tr from-primary to-primary/60 p-2.5 rounded-2xl shadow-xl shadow-primary/20 transition-transform group-hover:scale-110 duration-300">
            <Layers className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            SURGE
          </span>
        </div>
        <div className="flex items-center space-x-8">
          <Link href="/surge" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            Our Tool
          </Link>
          <Link
            href="/surge"
            className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-bold hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/10"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="container mx-auto max-w-7xl px-6 pt-24 pb-32 relative z-10">
        <div className="max-w-4xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-widest uppercase mb-8 animate-fade-in">
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>High Performance API Testing</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40">
            Massive API Execution. <br />
            Zero Friction.
          </h1>

          <p className="text-xl md:text-2xl text-white/50 max-w-2xl leading-relaxed mb-12">
            Surge API is the ultimate orchestrator for high-volume requests. Execute sequential chains across thousands of data rows with surgical precision.
          </p>

          <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link
              href="/surge"
              className="w-full sm:w-auto px-8 py-5 rounded-2xl bg-primary text-primary-foreground text-lg font-black hover:bg-primary/90 transition-all hover:translate-y-[-4px] hover:shadow-2xl hover:shadow-primary/40 flex items-center justify-center group"
            >
              Get Started for Free
              <ChevronRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="#features"
              className="w-full sm:w-auto px-8 py-5 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all flex items-center justify-center"
            >
              View Capabilities
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-48">
          <FeatureCard
            icon={<Rocket className="w-6 h-6" />}
            title="Surge Concurrency"
            description="Execute thousands of requests simultaneously with intelligent row-level rate limiting and error recovery."
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6" />}
            title="Sequential Chains"
            description="Define complex request sequences per row. Pipe outputs from Step 1 into Step 2 with dynamic variable mapping."
          />
          <FeatureCard
            icon={<BarChart3 className="w-6 h-6" />}
            title="Real-time Analytics"
            description="Watch execution progress in real-time with granular result reporting and instant Excel export functionality."
          />
        </div>

        {/* Tool Preview Placeholder / Visual */}
        <div className="mt-32 p-4 rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent border border-white/10 backdrop-blur-3xl overflow-hidden shadow-2xl relative group">
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="aspect-[16/9] bg-[#0c0c0c] rounded-[1.5rem] border border-white/5 flex items-center justify-center overflow-hidden relative">
            {/* Abstract UI representation */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="grid grid-cols-12 gap-4 h-full p-8">
                <div className="col-span-3 space-y-4">
                  <div className="h-full bg-white/5 rounded-xl border border-white/5" />
                </div>
                <div className="col-span-9 flex flex-col space-y-4">
                  <div className="h-2/3 bg-white/5 rounded-xl border border-white/5" />
                  <div className="h-1/3 bg-white/5 rounded-xl border border-white/5" />
                </div>
              </div>
            </div>
            <div className="z-10 text-center space-y-4">
              <div className="bg-primary/20 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-primary/20">
                <Globe className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-black italic tracking-tighter px-8 py-2 border-y border-white/10">POWERED BY SURGE ENGINE</h3>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-black py-16">
        <div className="container mx-auto max-w-7xl px-6 flex flex-col md:row items-center justify-between space-y-8 md:space-y-0 text-white/40 text-sm">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4" />
            <span className="font-bold text-white/60">SURGE API</span>
          </div>
          <div>© 2026 Surge API Orchestrator. All rights reserved.</div>
          <div className="flex items-center space-x-6">
            <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-white transition-colors">Terms</Link>
            <Link href="#" className="hover:text-white transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-primary/40 transition-all hover:bg-white/[0.07] group">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform duration-500 shadow-lg shadow-primary/5">
        {icon}
      </div>
      <h3 className="text-xl font-black mb-3 text-white/90">{title}</h3>
      <p className="text-white/40 leading-relaxed font-medium">
        {description}
      </p>
    </div>
  );
}
