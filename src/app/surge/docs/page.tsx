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
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                              Code Block Helper                             */
/* -------------------------------------------------------------------------- */
function Code({ children, title }: { children: string; title?: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-[#0c0c0c] overflow-hidden">
            {title && (
                <div className="px-4 py-2 border-b border-white/10 text-xs font-semibold text-white/50 tracking-wide uppercase">
                    {title}
                </div>
            )}
            <pre className="p-4 overflow-x-auto text-sm leading-relaxed font-mono text-emerald-300/90 whitespace-pre">
                {children}
            </pre>
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
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 flex gap-4 items-start">
                    <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <h3 className="font-bold text-amber-300 text-base">CORS Restriction — Not Supported</h3>
                        <p className="text-sm text-amber-200/70 leading-relaxed">
                            Surge runs <strong>entirely in your browser</strong>. It sends requests directly from your
                            machine, which means servers that block cross-origin requests (CORS) will reject the call.
                            <br />
                            <br />
                            If you see a <code className="px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 text-xs font-mono">
                                Failed to fetch
                            </code>{" "}
                            or{" "}
                            <code className="px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 text-xs font-mono">
                                CORS policy
                            </code>{" "}
                            error, the target server is blocking browser requests. You&rsquo;ll need to either whitelist the
                            origin or use a server that allows CORS.
                        </p>
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
