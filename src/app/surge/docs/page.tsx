"use client";

import React from "react";
import Link from "next/link";
import {
    AlertTriangle,
    UploadCloud,
    PenTool,
    Layers,
    Play,
    BarChart3,
    ArrowLeft,
    FileJson,
    ChevronRight,
    Info,
    Lightbulb,
    Copy,
    Check,
    AlertCircle,
} from "lucide-react";
import { useState } from "react";

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
                        className="p-1 rounded-md hover:bg-white/5 text-white/30 hover:text-white/70 transition-all flex items-center gap-1.5"
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
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 text-white/40 hover:text-white/90 hover:bg-black/70 transition-all"
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

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */
export default function DocsPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-indigo-500/30 relative">
            {/* Background Effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-500/10 blur-[150px]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
            </div>

            <main className="max-w-3xl mx-auto px-6 pt-12 pb-32 space-y-16">
                {/* Back link */}
                <Link
                    href="/surge"
                    className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/80 transition-colors group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                    Back to Surge
                </Link>

                {/* Title */}
                <div className="space-y-4">
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.1]">
                        <span className="bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/40">
                            Surge API Docs
                        </span>
                    </h1>
                    <p className="text-lg text-white/50 max-w-xl">
                        A no-nonsense guide for testers and technical support. Read it once, you&rsquo;ll be running bulk
                        API calls in under 5 minutes.
                    </p>
                </div>

                {/* ============================================================ */}
                {/*  CORS WARNING                                                */}
                {/* ============================================================ */}
                <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.08] to-transparent p-8 md:p-10">
                    {/* Background Shine */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

                    <div className="relative space-y-8 flex flex-col items-center text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="p-3 rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
                                <AlertCircle className="w-8 h-8 text-amber-500" />
                            </div>
                            <h3 className="text-2xl font-black text-amber-400 tracking-tight">
                                CORS Restriction — Not Supported
                            </h3>
                        </div>

                        <div className="max-w-2xl space-y-4">
                            <p className="text-[15px] text-amber-100/70 leading-relaxed">
                                Surge executes commands <strong className="text-amber-300">directly in your browser engine</strong>.
                                This means that servers without permissive CORS headers will block your requests to protect against cross-site attacks.
                            </p>
                            <p className="text-[15px] text-amber-100/70 leading-relaxed">
                                If you see a{" "}
                                <code className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono font-bold">
                                    FAILED TO FETCH
                                </code>{" "}
                                or{" "}
                                <code className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono font-bold">
                                    CORS POLICY
                                </code>{" "}
                                error, the target server is intentionally blocking browser-initiated traffic.
                            </p>
                        </div>

                        <div className="w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

                        <div className="w-full space-y-6">
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest text-amber-400">
                                    <Lightbulb className="w-3.5 h-3.5" />
                                    The Workaround
                                </div>
                                <p className="text-sm text-amber-200/50 max-w-lg leading-relaxed mt-2">
                                    For local development or technical support, bypass these restrictions by launching
                                    a temporary, insecure instance of Microsoft Edge.
                                </p>
                            </div>

                            <div className="max-w-3xl mx-auto w-full group">
                                <div className="p-1 rounded-xl bg-amber-500/5 border border-amber-500/10 transition-colors group-hover:border-amber-500/20">
                                    <Code title="Launch Edge (Windows CMD)">
                                        {`"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --user-data-dir=C:\\msedge-dev-data\\ --disable-web-security --disable-site-isolation-trials`}
                                    </Code>
                                </div>
                                <div className="mt-3 flex items-center justify-center gap-4 text-[11px] font-medium text-amber-500/40">
                                    <span className="flex items-center gap-1.5 uppercase tracking-wider">
                                        <AlertTriangle className="w-3 h-3 text-red-500/60" />
                                        Caution: Insecure Session
                                    </span>
                                    <div className="w-1 h-1 rounded-full bg-amber-500/20" />
                                    <span className="uppercase tracking-wider hover:text-amber-500/70 cursor-help transition-colors decoration-dotted underline underline-offset-4">
                                        Trusted Endpoints Only
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ============================================================ */}
                {/*  WHAT IS SURGE?                                              */}
                {/* ============================================================ */}
                <Section icon={<Info className="w-5 h-5" />} title="What is Surge?">
                    <p>
                        Surge is a <strong className="text-white">browser-based bulk API orchestrator</strong>. You
                        upload a spreadsheet of data, design one (or many) API request templates, and Surge fires them
                        all — in parallel or sequentially — row by row. Think of it as &ldquo;mail merge&rdquo; for API
                        calls.
                    </p>
                    <p>
                        It&rsquo;s built for repetitive tasks: bulk-creating customers, verifying records, migrating
                        data, or smoke-testing an endpoint across thousands of inputs.
                    </p>
                </Section>

                {/* ============================================================ */}
                {/*  STEP 1 — UPLOAD DATA                                        */}
                {/* ============================================================ */}
                <Section icon={<UploadCloud className="w-5 h-5" />} step={1} title="Upload Your Data">
                    <p>
                        Drag & drop (or click to browse) a <strong className="text-white">.csv</strong>,{" "}
                        <strong className="text-white">.xlsx</strong>, or{" "}
                        <strong className="text-white">.xls</strong> file into the <em>Data Source</em> panel on the
                        left.
                    </p>
                    <p>Surge will parse the file automatically. Each column header becomes a variable you can reference later.</p>

                    <Code title="Example CSV — customers.csv">
                        {`name,email,phone
Alice,alice@example.com,+84 912 345 678
Bob,bob@acme.co,+84 987 654 321
Charlie,charlie@test.org,+84 901 234 567`}
                    </Code>

                    <p>
                        After uploading, the panel shows a preview table. You can change the <strong className="text-white">data type</strong>{" "}
                        for each column (string, number, boolean) — this controls how the value is serialised when it
                        gets injected into request bodies.
                    </p>
                </Section>

                {/* ============================================================ */}
                {/*  STEP 2 — DESIGN REQUESTS                                   */}
                {/* ============================================================ */}
                <Section icon={<PenTool className="w-5 h-5" />} step={2} title="Design Your Request">
                    <p>
                        In the <em>Request Designer</em> panel, configure the API call you want to make for
                        <strong className="text-white"> every row</strong> of your spreadsheet.
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">Method &amp; URL</h3>
                    <p>
                        Pick a method (<code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">GET</code>,{" "}
                        <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">POST</code>,{" "}
                        <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">PUT</code>,{" "}
                        <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">PATCH</code>,{" "}
                        <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">DELETE</code>,{" "}
                        <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">QUERY</code>)
                        and enter the endpoint URL. Use <code className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-mono">{`{{column_name}}`}</code> placeholders to inject values from your spreadsheet.
                    </p>
                    <Code title="Example URL">
                        {`https://api.example.com/customers/{{email}}`}
                    </Code>

                    <h3 className="text-lg font-semibold text-white pt-2">Headers</h3>
                    <p>
                        Add headers like <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Authorization</code> or{" "}
                        <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Content-Type</code>. If you
                        don&rsquo;t set <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Content-Type</code>,
                        Surge auto-adds <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">application/json</code>{" "}
                        when a JSON body is detected.
                    </p>
                    <Code title="Example Header">
                        {`Authorization: Bearer eyJhbGciOiJIUzI1NiIs...`}
                    </Code>

                    <h3 className="text-lg font-semibold text-white pt-2">Query Params</h3>
                    <p>
                        You can add query parameters as key-value pairs. They support <code className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-mono">{`{{variable}}`}</code> interpolation too.
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">Body (JSON)</h3>
                    <p>
                        Write your JSON body in the built-in Monaco editor. Use the same <code className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-mono">{`{{column_name}}`}</code> syntax.
                    </p>
                    <Code title="Example Body">
                        {`{
  "name": "{{name}}",
  "email": "{{email}}",
  "phone": "{{phone}}",
  "source": "bulk_import"
}`}
                    </Code>
                    <p className="text-sm text-white/50">
                        When the column type is set to <strong className="text-white/70">number</strong> or{" "}
                        <strong className="text-white/70">boolean</strong>, the value is injected without quotes so the
                        resulting JSON is valid.
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">cURL Import &amp; Export</h3>
                    <p>
                        Already have a cURL command? Paste it into the URL field — Surge auto-parses method, URL,
                        headers, and body. You can also copy the current template out as cURL to share with colleagues.
                    </p>
                    <Code title="Example — Paste a cURL">
                        {`curl --request POST \\
  --url 'https://api.example.com/customers' \\
  --header 'Authorization: Bearer token123' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "name": "{{name}}",
    "email": "{{email}}"
  }'`}
                    </Code>
                </Section>

                {/* ============================================================ */}
                {/*  STEP 3 — CHAIN STEPS                                        */}
                {/* ============================================================ */}
                <Section icon={<Layers className="w-5 h-5" />} step={3} title="Chain Multiple Steps">
                    <p>
                        Need to call more than one endpoint per row? Click <strong className="text-white">+ Add Step</strong> in the
                        left sidebar of the Request Designer.
                    </p>
                    <p>
                        Steps execute <strong className="text-white">sequentially</strong> for each row. For example:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 pl-2">
                        <li>
                            <strong className="text-white/90">Step 1</strong> — Create a customer via <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">POST /customers</code>
                        </li>
                        <li>
                            <strong className="text-white/90">Step 2</strong> — Verify the customer via <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">GET /customers/{`{{email}}`}</code>
                        </li>
                    </ol>
                    <p>
                        Drag and drop steps to reorder them. If any step fails, the chain is marked as an error but
                        continues to subsequent steps so you still get partial data.
                    </p>
                </Section>

                {/* ============================================================ */}
                {/*  STEP 4 — EXECUTE                                            */}
                {/* ============================================================ */}
                <Section icon={<Play className="w-5 h-5" />} step={4} title="Execute">
                    <p>
                        The <em>Execution Engine</em> panel lets you configure:
                    </p>
                    <ul className="list-disc list-inside space-y-1 pl-2">
                        <li>
                            <strong className="text-white/90">Concurrency Limit</strong> — how many rows are processed in
                            parallel (1–50). Setting it to 1 means purely sequential.
                        </li>
                    </ul>

                    <h3 className="text-lg font-semibold text-white pt-2">Test Row 1</h3>
                    <p>
                        Before blasting all rows, click <strong className="text-white">Test Row 1</strong> to
                        execute only the first row as a dry run. Check the result, inspect the response body, and make
                        sure everything is correct before committing.
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">Run Engine</h3>
                    <p>
                        Click <strong className="text-white">Run Engine</strong> to execute all rows. A progress bar
                        shows how far along you are. You can <strong className="text-white">Stop Execution</strong> at
                        any time — already-completed rows are kept, pending rows are cancelled.
                    </p>
                </Section>

                {/* ============================================================ */}
                {/*  STEP 5 — RESULTS                                            */}
                {/* ============================================================ */}
                <Section icon={<BarChart3 className="w-5 h-5" />} step={5} title="View &amp; Export Results">
                    <p>
                        After execution, scroll down to the <em>Results</em> table. Each row shows status, status code,
                        response time, and the raw response body.
                    </p>

                    <h3 className="text-lg font-semibold text-white pt-2">Column Mapping</h3>
                    <p>
                        Need to pull specific values out of the response? Use <strong className="text-white">column mappings</strong>.
                        For each column you define:
                    </p>
                    <ul className="list-disc list-inside space-y-1 pl-2">
                        <li><strong className="text-white/90">Name</strong> — column header in the export</li>
                        <li><strong className="text-white/90">Source</strong> — one of: <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Variable</code>, <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Request Body</code>, <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Request Param</code>, <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Response</code>, <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Status</code>, <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Error</code></li>
                        <li>
                            <strong className="text-white/90">Path</strong> — dot-notation path into the JSON, e.g.{" "}
                            <code className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-mono">data.customer.id</code>
                        </li>
                    </ul>
                    <Code title="Example — Extracting nested response data">
                        {`Response JSON:
{
  "data": {
    "customer": {
      "id": "cust_abc123",
      "status": "active"
    }
  }
}

Column Mapping:
  Name: "Customer ID"   → Source: Response  → Path: data.customer.id
  Name: "Status"        → Source: Response  → Path: data.customer.status`}
                    </Code>

                    <h3 className="text-lg font-semibold text-white pt-2">Export to Excel</h3>
                    <p>
                        Click the <strong className="text-white">Export</strong> button in the results table header to
                        download an <strong className="text-white">.xlsx</strong> file with all mapped columns.
                    </p>
                </Section>

                {/* ============================================================ */}
                {/*  WORKSPACE IMPORT / EXPORT                                   */}
                {/* ============================================================ */}
                <Section icon={<FileJson className="w-5 h-5" />} title="Import &amp; Export Workspace">
                    <p>
                        Your entire Surge workspace — uploaded data, request templates, and results — persists in
                        <strong className="text-white"> localStorage</strong>. You can also export it as a{" "}
                        <strong className="text-white">.json</strong> file and import it later or share it with a colleague.
                    </p>
                    <ul className="list-disc list-inside space-y-1 pl-2">
                        <li>
                            <strong className="text-white/90">Export</strong> — downloads a{" "}
                            <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">surge-workspace-YYYY-MM-DD.json</code> file
                        </li>
                        <li>
                            <strong className="text-white/90">Import</strong> — opens a file picker, loads the workspace JSON
                        </li>
                        <li>
                            <strong className="text-white/90">Clear</strong> — nukes everything (asks for confirmation first)
                        </li>
                    </ul>
                </Section>

                {/* ============================================================ */}
                {/*  TIPS & GOTCHAS                                              */}
                {/* ============================================================ */}
                <Section icon={<Lightbulb className="w-5 h-5" />} title="Tips &amp; Gotchas">
                    <div className="space-y-4">
                        <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                            <h4 className="font-semibold text-white text-sm">Data Types Matter</h4>
                            <p className="text-sm">
                                If your body expects <code className="px-1 py-0.5 rounded bg-white/10 text-xs font-mono">{`"quantity": 5`}</code> (a number, not a string),
                                change the column type to <strong className="text-white/80">number</strong> in the data source panel. Otherwise it&rsquo;ll be sent as <code className="px-1 py-0.5 rounded bg-white/10 text-xs font-mono">{`"quantity": "5"`}</code>.
                            </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                            <h4 className="font-semibold text-white text-sm">Empty Variables</h4>
                            <p className="text-sm">
                                If a cell is empty, the <code className="px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-mono">{`{{variable}}`}</code>{" "}
                                is replaced with an empty string. Make sure your API can handle that.
                            </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                            <h4 className="font-semibold text-white text-sm">Content-Type Auto-Detection</h4>
                            <p className="text-sm">
                                If you don&rsquo;t explicitly set a <code className="px-1 py-0.5 rounded bg-white/10 text-xs font-mono">Content-Type</code> header and
                                the body parses as valid JSON, Surge auto-adds{" "}
                                <code className="px-1 py-0.5 rounded bg-white/10 text-xs font-mono">application/json</code>.
                            </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                            <h4 className="font-semibold text-white text-sm">Large Datasets</h4>
                            <p className="text-sm">
                                Workspace state is stored in localStorage which has a ~5 MB limit. If you&rsquo;re running
                                thousands of rows, export results frequently and clear stale workspaces.
                            </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                            <h4 className="font-semibold text-white text-sm">Concurrency</h4>
                            <p className="text-sm">
                                Higher concurrency = faster, but some APIs rate-limit aggressively. Start with 2–5 and
                                increase only if the target server can handle it.
                            </p>
                        </div>
                    </div>
                </Section>

                {/* Footer CTA */}
                <div className="pt-8 border-t border-white/10">
                    <Link
                        href="/surge"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 transition-colors text-sm font-semibold"
                    >
                        Open Surge
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>
            </main>
        </div>
    );
}
