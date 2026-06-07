"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useStore } from "@tanstack/react-store";
import { AlertCircle, Plus, Check, Braces } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { store } from "@/lib/store";
import { cn } from "@/lib/utils";

const normalizeKey = (key: string): string => {
    let k = key.trim();
    if (k.startsWith("{{") && k.endsWith("}}")) {
        k = k.slice(2, -2).trim();
    }
    return k;
};

interface VariableInputProps extends React.ComponentProps<"input"> {
    isBulk: boolean;
}

export function VariableInput({ 
    isBulk, 
    className, 
    value, 
    onChange, 
    onBlur, 
    onKeyDown, 
    ...props 
}: VariableInputProps) {
    const stringValue = typeof value === "string" ? value : String(value || "");
    
    // Manage input value locally to ensure 0ms typing lag
    const [localValue, setLocalValue] = useState(stringValue);

    // Keep local value in sync when value prop changes from the outside (e.g. tab switches)
    useEffect(() => {
        setLocalValue(stringValue);
    }, [stringValue]);

    // Performance optimization: select individual properties from store to prevent re-renders when typing
    const headers = useStore(store, (s) => s.headers);
    const environments = useStore(store, (s) => s.environments);
    const activeEnvironmentId = useStore(store, (s) => s.activeEnvironmentId);
    const collections = useStore(store, (s) => s.collections);
    const activeRequestId = useStore(store, (s) => {
        const activeTab = s.apiTabs.find(t => t.id === s.activeTabId);
        return activeTab ? activeTab.requestId : undefined;
    });

    // Form states for adding variables
    const [varValues, setVarValues] = useState<Record<string, string>>({});
    const [targetEnvs, setTargetEnvs] = useState<Record<string, "globals" | "active">>({});
    const [successKeys, setSuccessKeys] = useState<Record<string, boolean>>({});

    // Hover popover states
    const [isOpen, setIsOpen] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 300);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
        };
    }, []);

    // Debounced onChange propagation
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalValue(val);

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        // Persist the synthetic event to use it asynchronously
        e.persist();

        debounceTimeoutRef.current = setTimeout(() => {
            if (onChange) {
                onChange(e);
            }
        }, 300);
    };

    const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = null;
        }

        if (onChange && localValue !== stringValue) {
            // Immediately dispatch the final value on blur
            const syntheticEvent = {
                ...e,
                target: {
                    ...e.target,
                    value: localValue
                }
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
        }

        if (onBlur) {
            onBlur(e);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
                debounceTimeoutRef.current = null;
            }

            if (onChange && localValue !== stringValue) {
                // Immediately dispatch the final value on Enter key press
                const syntheticEvent = {
                    ...e,
                    target: {
                        ...e.target,
                        value: localValue
                    }
                } as unknown as React.ChangeEvent<HTMLInputElement>;
                onChange(syntheticEvent);
            }
        }

        if (onKeyDown) {
            onKeyDown(e);
        }
    };

    // Memoize active environment keys
    const envKeys = useMemo(() => {
        if (isBulk) return [];
        const activeEnv = environments.find(e => e.id === activeEnvironmentId);
        return activeEnv 
            ? activeEnv.variables.filter(v => v.enabled).map(v => v.key) 
            : [];
    }, [environments, activeEnvironmentId, isBulk]);

    // Memoize globals keys
    const globalKeys = useMemo(() => {
        if (isBulk) return [];
        const globalsEnv = environments.find(
            e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
        );
        return globalsEnv 
            ? globalsEnv.variables.filter(v => v.enabled).map(v => v.key) 
            : [];
    }, [environments, isBulk]);

    // Memoize collection variables
    const colVariables = useMemo(() => {
        if (isBulk || !activeRequestId) return [];
        
        const parentCol = collections.find(c => {
            const findInItems = (items: any[]): boolean => {
                return items.some(item => {
                    if (item.id === activeRequestId) return true;
                    if (item.items) return findInItems(item.items);
                    return false;
                });
            };
            return findInItems(c.items);
        });
        
        return parentCol && parentCol.variables
            ? parentCol.variables.filter(v => v.enabled !== false)
            : [];
    }, [collections, activeRequestId, isBulk]);

    // Parse variables and their statuses (based on fast localValue for instant UI response)
    const allVars = useMemo(() => {
        if (!localValue) return [];
        const matches = localValue.match(/\{\{(.+?)\}\}/g);
        if (!matches) return [];

        const uniqueKeys = Array.from(new Set(matches.map(m => m.slice(2, -2).trim())));

        if (isBulk) {
            const excelHeaders = (headers || []).map(h => normalizeKey(h));
            return uniqueKeys.map(key => {
                const normKey = normalizeKey(key);
                const isDefined = excelHeaders.includes(normKey);
                return {
                    key,
                    isDefined,
                    value: isDefined ? "Excel Column" : undefined,
                    source: isDefined ? "Excel" : undefined
                };
            });
        } else {
            return uniqueKeys.map(key => {
                let val: string | undefined = undefined;
                let source: string | undefined = undefined;

                // 1. Check Active Env
                const activeEnv = environments.find(e => e.id === activeEnvironmentId);
                if (activeEnv && envKeys.includes(key)) {
                    const found = activeEnv.variables.find(v => v.key === key && v.enabled);
                    if (found) {
                        val = found.value;
                        source = `Active Env: ${activeEnv.name}`;
                    }
                }

                // 2. Check Globals Env
                const globalsEnv = environments.find(
                    e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
                );
                if (val === undefined && globalsEnv && globalKeys.includes(key)) {
                    const found = globalsEnv.variables.find(v => v.key === key && v.enabled);
                    if (found) {
                        val = found.value;
                        source = `Globals`;
                    }
                }

                // 3. Check Collection
                if (val === undefined) {
                    const found = colVariables.find(v => v.key === key);
                    if (found) {
                        val = found.value;
                        source = `Collection`;
                    }
                }

                return {
                    key,
                    isDefined: val !== undefined,
                    value: val,
                    source
                };
            });
        }
    }, [localValue, headers, environments, activeEnvironmentId, collections, activeRequestId, isBulk, envKeys, globalKeys, colVariables]);

    const missingVars = useMemo(() => allVars.filter(v => !v.isDefined), [allVars]);
    const hasVariables = allVars.length > 0;
    const hasMissing = missingVars.length > 0;

    const handleAddVariable = (key: string) => {
        const matchingVar = allVars.find(v => v.key === key);
        const val = varValues[key] !== undefined 
            ? varValues[key] 
            : (matchingVar?.value || "");
        const targetType = targetEnvs[key] || "globals";

        store.setState(s => {
            let targetEnvId = targetType === "active" ? s.activeEnvironmentId : null;
            let newEnvironments = [...s.environments];

            // Ensure a Globals environment exists if targetEnvId is null
            if (!targetEnvId) {
                let globalsEnv = newEnvironments.find(
                    e => e.name.toLowerCase() === "globals" || e.name.toLowerCase() === "global"
                );
                if (!globalsEnv) {
                    globalsEnv = {
                        id: "globals-" + Math.random().toString(36).substring(2, 8),
                        name: "Globals",
                        variables: []
                    };
                    newEnvironments.push(globalsEnv);
                }
                targetEnvId = globalsEnv.id;
            }

            newEnvironments = newEnvironments.map(env => {
                if (env.id === targetEnvId) {
                    const exists = env.variables.some(v => v.key === key);
                    const variables = exists
                        ? env.variables.map(v => v.key === key ? { ...v, value: val, enabled: true } : v)
                        : [...env.variables, { key, value: val, enabled: true, type: "default" as const }];
                    return { ...env, variables };
                }
                return env;
            });

            return {
                ...s,
                environments: newEnvironments,
                activeEnvironmentId: s.activeEnvironmentId || targetEnvId
            };
        });

        // Set visual success indicator
        setSuccessKeys(prev => ({ ...prev, [key]: true }));
        setTimeout(() => {
            setSuccessKeys(prev => ({ ...prev, [key]: false }));
        }, 1500);
    };

    return (
        <div className="relative flex items-center w-full min-w-0">
            <Input 
                value={localValue} 
                onChange={handleChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                className={cn("w-full pr-8 min-w-0", className)} 
                {...props} 
            />
            {hasVariables && (
                <div className="absolute right-2 shrink-0 z-20">
                    <Popover open={isOpen} onOpenChange={setIsOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                                className={cn(
                                    "flex items-center justify-center p-1 focus:outline-none transition-colors cursor-pointer rounded-sm hover:bg-white/5",
                                    hasMissing ? "text-amber-500 hover:text-amber-400" : "text-indigo-400 hover:text-indigo-300"
                                )}
                                title={
                                    hasMissing 
                                        ? `Missing variables: ${missingVars.map(v => v.key).join(", ")}` 
                                        : "All variables defined"
                                }
                            >
                                {hasMissing ? (
                                    <AlertCircle className="w-3.5 h-3.5" />
                                ) : (
                                    <Braces className="w-3.5 h-3.5" />
                                )}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent 
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            className="w-80 bg-[#0c0c0d] border border-white/10 text-white p-4 shadow-2xl rounded-xl z-50" 
                            align="end"
                        >
                            <div className="space-y-3">
                                <div className={cn(
                                    "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider",
                                    hasMissing ? "text-amber-400" : "text-indigo-400"
                                )}>
                                    {hasMissing ? (
                                        <>
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            <span>Missing Variables ({missingVars.length})</span>
                                        </>
                                    ) : (
                                        <>
                                            <Braces className="w-3.5 h-3.5" />
                                            <span>Variables ({allVars.length})</span>
                                        </>
                                    )}
                                </div>
                                <p className="text-[10px] text-white/50 leading-relaxed">
                                    {isBulk 
                                        ? "Bulk runner check against Excel file columns."
                                        : "Variables used in this field and their status in environments."
                                    }
                                </p>

                                <div className="space-y-3.5 pt-1 max-h-[260px] overflow-y-auto pr-0.5 custom-scrollbar">
                                    {allVars.map(v => {
                                        const key = v.key;
                                        return (
                                            <div key={key} className="border-t border-white/5 pt-2.5 space-y-2">
                                                <div className="flex items-center justify-between text-xs font-bold text-white/90">
                                                    <span className="font-mono text-amber-300">{"{{" + key + "}}"}</span>
                                                    <span className={cn(
                                                        "text-[9px] px-1.5 py-0.5 rounded font-mono font-medium",
                                                        v.isDefined 
                                                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                                                    )}>
                                                        {v.isDefined ? (v.source || "Defined") : "Missing"}
                                                    </span>
                                                </div>

                                                {!isBulk ? (
                                                    <div className="space-y-2">
                                                        <Input
                                                            placeholder="Enter value..."
                                                            value={varValues[key] !== undefined ? varValues[key] : (v.value || "")}
                                                            onChange={e => setVarValues(prev => ({ ...prev, [key]: e.target.value }))}
                                                            className="h-7 text-[11px] font-mono bg-neutral-950 border-white/5"
                                                        />
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setTargetEnvs(prev => ({ ...prev, [key]: "globals" }))}
                                                                    className={cn(
                                                                        "text-[9px] font-bold px-2 py-0.5 rounded border transition-all cursor-pointer",
                                                                        (targetEnvs[key] || "globals") === "globals"
                                                                            ? "bg-white/10 border-white/20 text-white"
                                                                            : "bg-transparent border-transparent text-white/40 hover:text-white/70"
                                                                    )}
                                                                >
                                                                    Globals
                                                                </button>
                                                                {activeEnvironmentId && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setTargetEnvs(prev => ({ ...prev, [key]: "active" }))}
                                                                        className={cn(
                                                                            "text-[9px] font-bold px-2 py-0.5 rounded border transition-all cursor-pointer",
                                                                            targetEnvs[key] === "active"
                                                                                ? "bg-white/10 border-white/20 text-white"
                                                                                : "bg-transparent border-transparent text-white/40 hover:text-white/70"
                                                                        )}
                                                                    >
                                                                        Active Env
                                                                    </button>
                                                                )}
                                                            </div>

                                                            <Button
                                                                size="xs"
                                                                onClick={() => handleAddVariable(key)}
                                                                className={cn(
                                                                    "h-6 text-[10px] gap-1 font-bold rounded-lg cursor-pointer",
                                                                    successKeys[key]
                                                                        ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                                                                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                                                )}
                                                            >
                                                                {successKeys[key] ? (
                                                                    <>
                                                                        <Check className="w-3 h-3" />
                                                                        <span>Saved!</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Plus className="w-3 h-3" />
                                                                        <span>{v.isDefined ? "Save" : "Add"}</span>
                                                                    </>
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-white/30 italic">
                                                        {v.isDefined 
                                                            ? `Maps to Excel column: "${key}"`
                                                            : `Add a column header named "${key}" to your sheet.`
                                                        }
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            )}
        </div>
    );
}
