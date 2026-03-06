"use client";

import React, { useState, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { store } from "@/lib/store";
import { runBulkExecution } from "@/lib/executor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Loader2, StopCircle, FlaskConical } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export function ExecutionPanel() {
    const fileData = useStore(store, (state) => state.fileData);
    const template = useStore(store, (state) => state.template);
    const [concurrency, setConcurrency] = useState(5);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    const totalRows = fileData.length;
    const canRun = totalRows > 0 && template.url.trim().length > 0;

    const handleRun = async () => {
        if (!canRun) return;
        setIsRunning(true);
        setProgress(0);
        abortControllerRef.current = new AbortController();

        await runBulkExecution(
            Math.max(1, concurrency),
            (completed, total) => {
                setProgress(Math.round((completed / total) * 100));
            },
            undefined,
            abortControllerRef.current.signal
        );

        setIsRunning(false);
        abortControllerRef.current = null;
    };

    const handleTestRun = async () => {
        if (!canRun) return;
        setIsRunning(true);
        setProgress(0);
        abortControllerRef.current = new AbortController();

        await runBulkExecution(
            1,
            (completed, total) => {
                setProgress(Math.round((completed / total) * 100));
            },
            0,
            abortControllerRef.current.signal
        ); // Execute only Row index 0

        setIsRunning(false);
        abortControllerRef.current = null;
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
                    <div className="grid grid-cols-2 gap-4">
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
                    </div>

                    <div className="flex space-x-3 pt-1">
                        {!isRunning ? (
                            <Button
                                className="flex-1 h-11 border-primary/30 text-foreground hover:bg-primary/10 transition-colors"
                                disabled={!canRun}
                                onClick={handleTestRun}
                                variant="outline"
                            >
                                <FlaskConical className="w-4 h-4 mr-2 text-primary" />
                                Test Row 1
                            </Button>
                        ) : (
                            <Button
                                className="flex-1 h-11 border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                                onClick={handleStop}
                                variant="outline"
                            >
                                <StopCircle className="w-4 h-4 mr-2" />
                                Stop Execution
                            </Button>
                        )}

                        <Button
                            className="flex-1 h-11 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground transition-all"
                            disabled={!canRun || isRunning}
                            onClick={handleRun}
                            variant={isRunning ? "secondary" : "default"}
                        >
                            {isRunning ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4 mr-2" />
                                    Run Engine
                                </>
                            )}
                        </Button>
                    </div>

                    {isRunning && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Progress</span>
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
