"use client";

import React, { useState, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { store, setMaxRetries, setRetryStatusCodes, setStopOnFailure, setThrottleDelayMs, setRowIterations } from "@/lib/store";
import { runBulkExecution, pauseBulkExecution, resumeBulkExecution } from "@/lib/executor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Loader2, StopCircle, FlaskConical } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export function ExecutionPanel() {
    const fileData = useStore(store, (state) => state.fileData);
    const templates = useStore(store, (state) => state.templates);
    const maxRetries = useStore(store, (state) => state.maxRetries);
    const retryStatusCodes = useStore(store, (state) => state.retryStatusCodes);
    const stopOnFailure = useStore(store, (state) => state.stopOnFailure);
    const throttleDelayMs = useStore(store, (state) => state.throttleDelayMs);
    const rowIterations = useStore(store, (state) => state.rowIterations);
    const [concurrency, setConcurrency] = useState(2);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);


    const totalRows = fileData.length;
    const canRun = totalRows > 0 && templates.some(t => t.url.trim().length > 0);

    const handleRun = async () => {
        if (!canRun) return;
        setIsRunning(true);
        setProgress(0);
        setIsPaused(false);
        abortControllerRef.current = new AbortController();

        try {
            await runBulkExecution(
                Math.max(1, concurrency),
                (completed, total) => {
                    setProgress(Math.round((completed / total) * 100));
                },
                undefined,
                abortControllerRef.current.signal
            );
        } catch (err: any) {
            toast.error(err?.message || "Execution engine crashed");
        } finally {
            setIsRunning(false);
            setIsPaused(false);
            abortControllerRef.current = null;
        }
    };


    const handleTestRun = async () => {
        if (!canRun) return;
        setIsRunning(true);
        setProgress(0);
        setIsPaused(false);
        abortControllerRef.current = new AbortController();

        try {
            await runBulkExecution(
                1,
                (completed, total) => {
                    setProgress(Math.round((completed / total) * 100));
                },
                0,
                abortControllerRef.current.signal
            ); // Execute only Row index 0
        } catch (err: any) {
            toast.error(err?.message || "Test execution crashed");
        } finally {
            setIsRunning(false);
            setIsPaused(false);
            abortControllerRef.current = null;
        }
    };

    const handlePause = () => {
        pauseBulkExecution();
        setIsPaused(true);
        toast.info("Execution paused");
    };

    const handleResume = () => {
        resumeBulkExecution();
        setIsPaused(false);
        toast.info("Execution resumed");
    };


    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    return (
        <Card className="w-full shadow-lg shadow-black/5 rounded-xl bg-card/60 backdrop-blur-sm border-muted-foreground/20 overflow-hidden relative">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl -z-10" />
            <CardHeader>
                <CardTitle>Execution Engine</CardTitle>
                <CardDescription>Configure concurrency and execute the bulk requests.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="concurrency" className="text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis block" title="Concurrency Limit">
                                Concurrency Limit
                            </Label>
                            <Input
                                id="concurrency"
                                type="number"
                                min={1}
                                max={50}
                                value={concurrency}
                                onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
                                className="h-10 bg-background/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Total Operations</Label>
                            <div className="h-10 flex items-center px-3 border rounded-md bg-muted/30 font-medium text-sm text-foreground/80 shadow-inner">
                                {totalRows} {totalRows === 1 ? 'Request' : 'Requests'}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="maxRetries" className="text-xs text-muted-foreground block">
                                Max Retry Count
                            </Label>
                            <Input
                                id="maxRetries"
                                type="number"
                                min={0}
                                max={10}
                                placeholder="0 (no retries)"
                                value={maxRetries ?? ""}
                                onChange={(e) => setMaxRetries(e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value) || 0))}
                                className="h-10 bg-background/50 font-mono text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="retryStatusCodes" className="text-xs text-muted-foreground block" title="Retry Status Codes (e.g. 429, 500-599)">
                                Retry Status Ranges
                            </Label>
                            <Input
                                id="retryStatusCodes"
                                placeholder="e.g. 429, 500-599"
                                value={retryStatusCodes ?? ""}
                                onChange={(e) => setRetryStatusCodes(e.target.value)}
                                className="h-10 bg-background/50 font-mono text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="throttleDelayMs" className="text-xs text-muted-foreground block" title="Delay (ms) between each row's request batch execution">
                                Throttling Delay (ms)
                            </Label>
                            <Input
                                id="throttleDelayMs"
                                type="number"
                                min={0}
                                max={10000}
                                placeholder="0 (no delay)"
                                value={throttleDelayMs ?? ""}
                                onChange={(e) => setThrottleDelayMs(e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value) || 0))}
                                className="h-10 bg-background/50 font-mono text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="rowIterations" className="text-xs text-muted-foreground block" title="Number of times each row should be executed">
                                Row Iterations
                            </Label>
                            <Input
                                id="rowIterations"
                                type="number"
                                min={1}
                                max={100}
                                placeholder="1 (run once)"
                                value={rowIterations ?? 1}
                                onChange={(e) => setRowIterations(e.target.value === "" ? 1 : Math.max(1, parseInt(e.target.value) || 1))}
                                className="h-10 bg-background/50 font-mono text-sm"
                            />
                        </div>

                        <div className="space-y-2 flex flex-col justify-end pb-2.5">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="stopOnFailure"
                                    checked={stopOnFailure}
                                    onCheckedChange={(checked) => setStopOnFailure(!!checked)}
                                    className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <Label htmlFor="stopOnFailure" className="text-xs text-muted-foreground cursor-pointer select-none font-bold uppercase tracking-tight">
                                    Stop on failure
                                </Label>
                            </div>
                        </div>
                    </div>

                    <div className="flex space-x-3 pt-1">
                        {!isRunning ? (
                            <>
                                <Button
                                    className="flex-1 h-11 border-primary/30 text-foreground hover:bg-primary/10 transition-colors"
                                    disabled={!canRun}
                                    onClick={handleTestRun}
                                    variant="outline"
                                >
                                    <FlaskConical className="w-4 h-4 mr-2 text-primary" />
                                    Test Row 1
                                </Button>

                                <Button
                                    className="flex-1 h-11 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground transition-all"
                                    disabled={!canRun}
                                    onClick={handleRun}
                                    variant="default"
                                >
                                    <Play className="w-4 h-4 mr-2" />
                                    Run Engine
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    className="flex-1 h-11 border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                                    onClick={handleStop}
                                    variant="outline"
                                >
                                    <StopCircle className="w-4 h-4 mr-2" />
                                    Stop
                                </Button>

                                {isPaused ? (
                                    <Button
                                        className="flex-1 h-11 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20 transition-all"
                                        onClick={handleResume}
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        Resume
                                    </Button>
                                ) : (
                                    <Button
                                        className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition-all"
                                        onClick={handlePause}
                                    >
                                        <Loader2 className="w-4 h-4 mr-2 animate-pulse" />
                                        Pause
                                    </Button>
                                )}
                            </>
                        )}
                    </div>


                    {isRunning && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Progress {isPaused && "(Paused)"}</span>
                                <span>{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                        </div>
                    )}

                </div>
            </CardContent>
        </Card>
    );
}
