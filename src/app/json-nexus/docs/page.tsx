"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft,
  BookOpen,
  Info,
  Table,
  ArrowRightLeft,
  Layers,
  Sparkles,
  Command,
  FileSpreadsheet,
  Split,
  Lightbulb,
  Copy,
  Check,
  ChevronRight
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                              Code Block Helper                             */
/* -------------------------------------------------------------------------- */
function Code({ children, title }: { children: string; title?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group relative rounded-xl border border-white/10 bg-[#0c0c0c] overflow-hidden">
            {title && (
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/[0.02]">
                    <span className="text-[10px] font-bold text-white/40 tracking-[0.1em] uppercase">
                        {title}
                    </span>
                    <button
                        onClick={handleCopy}
                        className="p-1 rounded-md hover:bg-white/5 text-white/30 hover:text-white/70 transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Copy to clipboard"
                    >
                        {copied ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-[10px] font-bold text-emerald-400 uppercase">Copied!</span>
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase">Copy</span>
                            </>
                        )}
                    </button>
                </div>
            )}
            <div className="relative">
                <pre className="p-4 pt-3 overflow-x-auto max-w-full text-[13px] leading-relaxed font-mono text-emerald-400/90 whitespace-pre scrollbar-hide">
                    {children}
                </pre>
                {!title && (
                    <button
                        onClick={handleCopy}
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 text-white/40 hover:text-white/90 hover:bg-black/70 transition-all cursor-pointer"
                    >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                )}
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*                               Section Wrapper                              */
/* -------------------------------------------------------------------------- */
function Section({
    icon,
    step,
    title,
    children,
}: {
    icon: React.ReactNode;
    step?: number;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
                {step !== undefined && (
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-black ring-1 ring-indigo-500/30">
                        {step}
                    </span>
                )}
                <div className="text-indigo-400">{icon}</div>
                <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            </div>
            <div className="space-y-4 text-white/70 leading-relaxed">{children}</div>
        </section>
    );
}

export default function JSONNexusDocsPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-indigo-500/30 relative">
            {/* Ambient Background Effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-500/10 blur-[150px]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
            </div>

            <main className="max-w-3xl mx-auto px-6 pt-12 pb-32 space-y-16 relative z-10">
                {/* Back link */}
                <Link
                    href="/json-nexus"
                    className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/80 transition-colors group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                    Back to JSON Nexus
                </Link>

                {/* Title */}
                <div className="space-y-4">
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.1]">
                        <span className="bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/40">
                            JSON Nexus Docs
                        </span>
                    </h1>
                    <p className="text-lg text-white/50 max-w-xl font-light">
                        A utility to flatten, structure, and compare JSON data.
                    </p>
                </div>

                {/* ============================================================ */}
                {/*  WHAT IS JSON NEXUS?                                         */}
                {/* ============================================================ */}
                <Section icon={<Info className="w-5 h-5" />} title="What is JSON Nexus?">
                    <p>
                        JSON Nexus is a client-side tool for parsing and comparing JSON data. It provides two main tabs:
                    </p>
                    <ul className="list-disc list-inside space-y-2 pl-2">
                        <li>
                            <strong className="text-white">JSON to Table Grid</strong>: Flattens nested objects and splits arrays into columns and rows with CSV and Excel export options.
                        </li>
                        <li>
                            <strong className="text-white">JSON Compare & Diff</strong>: Compares two JSON objects side-by-side with optional filters for structure and values.
                        </li>
                    </ul>
                </Section>

                {/* ============================================================ */}
                {/*  SECTION 1 — JSON TO TABLE SCHEMA                            */}
                {/* ============================================================ */}
                <Section icon={<Table className="w-5 h-5" />} step={1} title="JSON to Table Conversion Rules">
                    <p>
                        JSON Nexus shapes nested data structures into a table using two options:
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">1. Flatten Nested Objects</h3>
                    <p>
                        Recursive object properties are flattened into dot-separated header strings. If disabled, sub-objects are kept intact as simple stringified JSON.
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">2. Split Arrays into Rows (Cartesian Splitting)</h3>
                    <p>
                        If a field contains multiple array values (e.g. `skills: ["TypeScript", "Bun"]`), splitting will perform a Cartesian expansion. 
                        It duplicates the parallel property values and spans them over multiple distinct rows recursively.
                    </p>

                    <Code title="Input Nested JSON">
{`{
  "id": "USR-101",
  "profile": {
    "fullName": "Alice Vance"
  },
  "skills": ["TypeScript", "Bun"]
}`}
                    </Code>

                    <Code title="Output Spread Rows (Flatten & Split Active)">
{`[
  { "id": "USR-101", "profile.fullName": "Alice Vance", "skills": "TypeScript" },
  { "id": "USR-101", "profile.fullName": "Alice Vance", "skills": "Bun" }
]`}
                    </Code>
                </Section>

                {/* ============================================================ */}
                {/*  SECTION 2 — DOWNLOAD & EXPORTS                              */}
                {/* ============================================================ */}
                <Section icon={<FileSpreadsheet className="w-5 h-5" />} step={2} title="Datagrids & Spreadsheets">
                    <p>
                        Parsed data is rendered in a table powered by <strong className="text-white">@tanstack/react-table</strong>.
                    </p>
                    <ul className="list-disc list-inside space-y-2 pl-2">
                        <li>
                            <strong className="text-white">Sorting & Filtering</strong>: Columns can be sorted alphabetically or numerically, and a global search filter matches values across the active grid.
                        </li>
                        <li>
                            <strong className="text-white">CSV & Excel Exports</strong>: Generates standard CSV files or binary `.xlsx` files using the `xlsx` package for local download.
                        </li>
                    </ul>
                </Section>

                {/* ============================================================ */}
                {/*  SECTION 3 — COMPARE MODES                                   */}
                {/* ============================================================ */}
                <Section icon={<ArrowRightLeft className="w-5 h-5" />} step={3} title="Monaco Compare Modes">
                    <p>
                        JSON Nexus provides three diff filter modes to view changes side-by-side:
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">📊 Granular (Default)</h3>
                    <p>
                        Standard diff showing all text modifications, additions, and deletions.
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">🔧 Structure Only</h3>
                    <p>
                        Compares schemas by mapping leaf nodes to their types (e.g., `{"\"<string>\""}`, `{"\"<number>\""}`). This mode isolates added, deleted, or migrated fields.
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">💎 Values Only</h3>
                    <p>
                        Ignores unique structural updates (additions and removals). It uses a recursive intersection algorithm to isolate **only shared keys** and display their value changes, keeping the rest completely hidden.
                    </p>
                </Section>

                {/* ============================================================ */}
                {/*  SECTION 4 — ORDER NORMALIZATION                             */}
                {/* ============================================================ */}
                <Section icon={<Split className="w-5 h-5" />} step={4} title="Ignoring Key & Array Order">
                    <p>
                        Often, two JSON objects represent the exact same database records, but their fields are positioned differently or their array items are shifted in index order.
                    </p>
                    <p>
                        Checking the **`Ignore Order (Keys & Arrays)`** option in the Action Bar recursively:
                    </p>
                    <ol className="list-decimal list-inside space-y-2 pl-2">
                        <li>
                            Sorts all object fields **alphabetically** by key.
                        </li>
                        <li>
                            Sorts all array elements **alphabetically** by their stringified value.
                        </li>
                    </ol>
                    <p>
                        This normalizes the structural positioning on both sides, ensuring Monaco only highlights true value changes rather than simple key re-ordering!
                    </p>
                </Section>

                {/* ============================================================ */}
                {/*  SECTION 5 — HOTKEYS & Polish                                */}
                {/* ============================================================ */}
                <Section icon={<Command className="w-5 h-5" />} step={5} title="Keyboard Shortcuts">
                    <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest text-indigo-400 w-fit">
                            Keyboard Shortcuts
                        </div>
                        <p className="text-sm">
                            Shortcuts available inside the editor panels:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                            <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-white/5">
                                <span className="text-white/60">Generate Table Grid</span>
                                <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-sans text-[10px] font-bold">Ctrl + Enter</kbd>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-white/5">
                                <span className="text-white/60">Compare JSON Diffs</span>
                                <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-sans text-[10px] font-bold">Ctrl + Enter</kbd>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-white/5">
                                <span className="text-white/60">Format JSON Document</span>
                                <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-sans text-[10px] font-bold">Alt + Shift + F</kbd>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-white/5">
                                <span className="text-white/60">Auto-Save State</span>
                                <span className="text-emerald-400 font-bold font-sans">Automatic</span>
                            </div>
                        </div>
                    </div>
                </Section>

                {/* ============================================================ */}
                {/*  TIPS & TRICKS                                               */}
                {/* ============================================================ */}
                <Section icon={<Lightbulb className="w-5 h-5" />} title="Tips & Gotchas">
                    <div className="space-y-4">
                        <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                            <h4 className="font-semibold text-white text-sm">Large JSON Tables</h4>
                            <p className="text-sm">
                                If you have high Cartesian array-splitting factors (e.g. nested lists containing dozens of entries), 
                                the number of generated rows can expand exponentially. Keep the **Split Arrays** setting checked only when relational row expansion is needed, otherwise leave it unchecked to keep arrays stringified.
                            </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                            <h4 className="font-semibold text-white text-sm">Browser Storage Safety</h4>
                            <p className="text-sm">
                                Inputs are stored in your browser's `localStorage` so reload actions don't wipe your workspace. 
                                However, extremely massive JSON strings might hit browser quota ceilings (~5MB). Hit the **Clear** button regularly to clean your staging workspace.
                            </p>
                        </div>
                    </div>
                </Section>

                {/* Footer CTA */}
                <div className="pt-8 border-t border-white/10">
                    <Link
                        href="/json-nexus"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors text-sm font-semibold"
                    >
                        Open JSON Nexus
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>
            </main>
        </div>
    );
}
