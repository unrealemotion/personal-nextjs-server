"use client";

import React, { useState, useEffect, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import {
    store,
    addEnvironment,
    updateEnvironment,
    deleteEnvironment,
    setActiveEnvironmentId,
    generateId
} from "@/lib/store";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Check, Settings, Eye, EyeOff, Search, Globe, Copy } from "lucide-react";
import { type Environment, type EnvVariable } from "@/lib/schema";
import { toast } from "sonner";

function InlineEditableText({
    value,
    onSave,
    className = "",
    placeholder = "Untitled"
}: {
    value: string;
    onSave: (val: string) => void;
    className?: string;
    placeholder?: string;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                    setIsEditing(false);
                    if (draft.trim() && draft !== value) {
                        onSave(draft.trim());
                    } else {
                        setDraft(value);
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        setIsEditing(false);
                        if (draft.trim()) onSave(draft.trim());
                    }
                    if (e.key === "Escape") {
                        setIsEditing(false);
                        setDraft(value);
                    }
                }}
                className={`bg-transparent border-b border-indigo-500/60 outline-none text-white px-0 py-0.5 ${className}`}
            />
        );
    }

    return (
        <span
            onDoubleClick={() => { setDraft(value); setIsEditing(true); }}
            className={`cursor-default select-none ${className}`}
            title="Double-click to rename"
        >
            {value || placeholder}
        </span>
    );
}

export function EnvironmentModal() {
    const environments = useStore(store, (state) => state.environments);
    const activeEnvironmentId = useStore(store, (state) => state.activeEnvironmentId);
    
    const [selectedEnvId, setSelectedEnvId] = useState<string | null>(environments[0]?.id || null);
    const [newEnvName, setNewEnvName] = useState("");
    const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [showSearch, setShowSearch] = useState(false);

    useEffect(() => {
        if (environments.length > 0) {
            if (!selectedEnvId || !environments.some(e => e.id === selectedEnvId)) {
                setSelectedEnvId(environments[0].id);
            }
        } else {
            setSelectedEnvId(null);
        }
    }, [environments, selectedEnvId]);

    const selectedEnv = environments.find(e => e.id === selectedEnvId);

    const filteredVariables = selectedEnv?.variables.filter(v => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return v.key.toLowerCase().includes(q) || v.value.toLowerCase().includes(q);
    }) ?? [];

    const handleCreateEnvironment = () => {
        if (!newEnvName.trim()) return;
        const newEnv: Environment = {
            id: generateId(),
            name: newEnvName.trim(),
            variables: []
        };
        addEnvironment(newEnv);
        setSelectedEnvId(newEnv.id);
        setNewEnvName("");
    };

    const handleDeleteEnvironment = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        deleteEnvironment(id);
        if (selectedEnvId === id) {
            const remaining = environments.filter(env => env.id !== id);
            setSelectedEnvId(remaining.length > 0 ? remaining[0].id : null);
        }
    };

    const handleDuplicateEnvironment = (env: Environment, e: React.MouseEvent) => {
        e.stopPropagation();
        const newEnv: Environment = {
            id: generateId(),
            name: `${env.name} (copy)`,
            variables: env.variables.map(v => ({ ...v }))
        };
        addEnvironment(newEnv);
        setSelectedEnvId(newEnv.id);
        toast.success(`Duplicated "${env.name}"`);
    };

    const handleRenameEnvironment = (id: string, newName: string) => {
        updateEnvironment(id, { name: newName });
    };

    const handleAddVariable = () => {
        if (!selectedEnvId || !selectedEnv) return;
        const newVar: EnvVariable = {
            key: "",
            value: "",
            enabled: true,
            type: "default"
        };
        updateEnvironment(selectedEnvId, {
            variables: [...selectedEnv.variables, newVar]
        });
    };

    const handleUpdateVariable = (index: number, key: keyof EnvVariable, value: any) => {
        if (!selectedEnvId || !selectedEnv) return;
        const newVars = [...selectedEnv.variables];
        newVars[index] = { ...newVars[index], [key]: value };
        updateEnvironment(selectedEnvId, { variables: newVars });
    };

    const handleRemoveVariable = (index: number) => {
        if (!selectedEnvId || !selectedEnv) return;
        const newVars = selectedEnv.variables.filter((_, i) => i !== index);
        updateEnvironment(selectedEnvId, { variables: newVars });
    };

    const toggleSecretReveal = (key: string) => {
        setRevealedSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const getOriginalIndex = (filteredIdx: number): number => {
        if (!selectedEnv || !searchQuery) return filteredIdx;
        const filteredVar = filteredVariables[filteredIdx];
        return selectedEnv.variables.indexOf(filteredVar);
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs font-bold text-white/70 hover:text-white flex items-center gap-1.5 bg-neutral-900/60 border border-white/5 hover:bg-neutral-800/80 rounded-lg">
                    <Settings className="w-3.5 h-3.5" />
                    <span>Environments</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl h-[650px] flex flex-col bg-[#1a1a1d] text-white border-white/[0.08] p-0 overflow-hidden rounded-2xl shadow-2xl shadow-black/60">
                {/* Header */}
                <div className="px-6 pt-5 pb-4 border-b border-white/[0.06] bg-[#1a1a1d]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                                <Globe className="w-4 h-4 text-indigo-400" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-bold tracking-tight">Environments</DialogTitle>
                                <DialogDescription className="text-white/35 text-[11px] mt-0.5">
                                    Manage variable sets for different contexts — dev, staging, prod.
                                </DialogDescription>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex min-h-0 overflow-hidden">
                    {/* Left Pane: Environment List */}
                    <div className="w-[220px] shrink-0 border-r border-white/[0.06] bg-[#141416] flex flex-col">
                        <div className="p-3 space-y-2">
                            <div className="flex gap-1.5">
                                <Input
                                    placeholder="New environment..."
                                    value={newEnvName}
                                    onChange={(e) => setNewEnvName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCreateEnvironment()}
                                    className="h-8 text-[11px] bg-white/[0.04] border-white/[0.08] placeholder:text-white/25 focus:border-indigo-500/40 rounded-lg"
                                />
                                <Button
                                    size="icon"
                                    className="h-8 w-8 shrink-0 bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 transition-all"
                                    onClick={handleCreateEnvironment}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 custom-scrollbar">
                            {environments.map((env) => {
                                const isActive = activeEnvironmentId === env.id;
                                const isSelected = selectedEnvId === env.id;
                                return (
                                    <div
                                        key={env.id}
                                        onClick={() => setSelectedEnvId(env.id)}
                                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] cursor-pointer group transition-all relative ${
                                            isSelected
                                                ? "bg-indigo-500/[0.12] text-white"
                                                : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"
                                        }`}
                                    >
                                        {/* Active indicator dot */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveEnvironmentId(isActive ? null : env.id);
                                            }}
                                            className={`h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center transition-all ${
                                                isActive
                                                    ? "bg-emerald-500 border-emerald-400 shadow-sm shadow-emerald-500/40"
                                                    : "border-white/20 hover:border-white/40"
                                            }`}
                                            title={isActive ? "Active environment (click to deactivate)" : "Click to activate"}
                                        >
                                            {isActive && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
                                        </button>

                                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                            <span className="font-semibold truncate">{env.name}</span>
                                            {isActive && (
                                                <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                                                    active
                                                </span>
                                            )}
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            <button
                                                onClick={(e) => handleDuplicateEnvironment(env, e)}
                                                className="p-0.5 text-white/30 hover:text-white/70 rounded"
                                                title="Duplicate"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteEnvironment(env.id, e)}
                                                className="p-0.5 text-white/30 hover:text-red-400 rounded"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {environments.length === 0 && (
                                <div className="text-center py-12 px-4">
                                    <Globe className="w-8 h-8 mx-auto text-white/10 mb-3 stroke-[1.5]" />
                                    <p className="text-[10px] text-white/25 leading-relaxed">
                                        Create an environment to store reusable variables.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Pane: Variable Editor */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#1a1a1d]">
                        {selectedEnv ? (
                            <>
                                {/* Environment Header */}
                                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#1a1a1d]">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <InlineEditableText
                                            value={selectedEnv.name}
                                            onSave={(name) => handleRenameEnvironment(selectedEnv.id, name)}
                                            className="text-sm font-bold"
                                        />
                                        <span className="text-[10px] text-white/25 font-medium">
                                            {selectedEnv.variables.length} variable{selectedEnv.variables.length !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => { setShowSearch(!showSearch); setSearchQuery(""); }}
                                            className={`p-1.5 rounded-md transition-colors ${showSearch ? "bg-indigo-500/15 text-indigo-400" : "text-white/30 hover:text-white/60 hover:bg-white/[0.04]"}`}
                                            title="Search variables"
                                        >
                                            <Search className="w-3.5 h-3.5" />
                                        </button>
                                        <Button
                                            size="sm"
                                            onClick={handleAddVariable}
                                            className="h-7 text-[11px] bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm font-semibold gap-1 px-3"
                                        >
                                            <Plus className="w-3 h-3" />
                                            Add
                                        </Button>
                                    </div>
                                </div>

                                {/* Search bar */}
                                {showSearch && (
                                    <div className="px-5 py-2 border-b border-white/[0.06] bg-[#16161a]">
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                                            <Input
                                                autoFocus
                                                placeholder="Filter variables..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="h-7 text-[11px] pl-8 bg-white/[0.04] border-white/[0.08] placeholder:text-white/20 focus:border-indigo-500/40 rounded-lg"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Variable Table */}
                                <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                                    <table className="w-full text-left text-[11px] border-collapse">
                                        <thead className="sticky top-0 z-10">
                                            <tr className="bg-[#16161a] border-b border-white/[0.06]">
                                                <th className="py-2 px-3 w-8 text-white/30 font-medium"></th>
                                                <th className="py-2 px-3 text-white/40 font-semibold uppercase tracking-wider text-[10px] w-[30%]">Variable</th>
                                                <th className="py-2 px-3 text-white/40 font-semibold uppercase tracking-wider text-[10px]">Value</th>
                                                <th className="py-2 px-3 text-white/40 font-semibold uppercase tracking-wider text-[10px] w-[90px]">Type</th>
                                                <th className="py-2 px-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredVariables.map((v, filteredIdx) => {
                                                const idx = getOriginalIndex(filteredIdx);
                                                const uniqueSecretKey = `${selectedEnv.id}-${idx}`;
                                                const isSecret = v.type === "secret";
                                                const isRevealed = revealedSecrets[uniqueSecretKey];

                                                return (
                                                    <tr
                                                        key={`${selectedEnv.id}-${idx}`}
                                                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group"
                                                    >
                                                        {/* Checkbox */}
                                                        <td className="py-1.5 px-3">
                                                            <div className="flex items-center justify-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={v.enabled}
                                                                    onChange={(e) => handleUpdateVariable(idx, "enabled", e.target.checked)}
                                                                    className="rounded-[3px] border-white/15 bg-transparent text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer transition-colors"
                                                                />
                                                            </div>
                                                        </td>

                                                        {/* Variable Name */}
                                                        <td className="py-1 px-2">
                                                            <input
                                                                placeholder="VARIABLE_NAME"
                                                                value={v.key}
                                                                onChange={(e) => handleUpdateVariable(idx, "key", e.target.value)}
                                                                className={`w-full h-7 px-2 font-mono text-[11px] rounded-md bg-transparent border border-transparent focus:border-indigo-500/40 focus:bg-white/[0.03] outline-none transition-all placeholder:text-white/15 ${
                                                                    v.enabled ? "text-orange-300/90" : "text-white/25 line-through"
                                                                }`}
                                                            />
                                                        </td>

                                                        {/* Value */}
                                                        <td className="py-1 px-2">
                                                            <div className="relative flex items-center">
                                                                <input
                                                                    type={isSecret && !isRevealed ? "password" : "text"}
                                                                    placeholder="value"
                                                                    value={v.value}
                                                                    onChange={(e) => handleUpdateVariable(idx, "value", e.target.value)}
                                                                    className={`w-full h-7 px-2 font-mono text-[11px] rounded-md bg-transparent border border-transparent focus:border-indigo-500/40 focus:bg-white/[0.03] outline-none transition-all placeholder:text-white/15 ${
                                                                        isSecret ? "pr-8" : ""
                                                                    } ${v.enabled ? "text-emerald-300/80" : "text-white/25"}`}
                                                                />
                                                                {isSecret && (
                                                                    <button
                                                                        onClick={() => toggleSecretReveal(uniqueSecretKey)}
                                                                        className="absolute right-1.5 p-0.5 text-white/25 hover:text-white/60 transition-colors rounded"
                                                                    >
                                                                        {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Type */}
                                                        <td className="py-1 px-2">
                                                            <select
                                                                value={v.type || "default"}
                                                                onChange={(e) => handleUpdateVariable(idx, "type", e.target.value)}
                                                                className="h-7 w-full bg-transparent text-[10px] border border-transparent rounded-md px-1.5 focus:border-indigo-500/40 focus:bg-white/[0.03] outline-none text-white/50 cursor-pointer transition-all font-medium appearance-none"
                                                            >
                                                                <option value="default" className="bg-[#1a1a1d]">Default</option>
                                                                <option value="secret" className="bg-[#1a1a1d]">Secret</option>
                                                            </select>
                                                        </td>

                                                        {/* Delete */}
                                                        <td className="py-1.5 px-2">
                                                            <button
                                                                onClick={() => handleRemoveVariable(idx)}
                                                                className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {/* Empty row for quick add */}
                                            {!searchQuery && (
                                                <tr
                                                    onClick={handleAddVariable}
                                                    className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors"
                                                >
                                                    <td className="py-2 px-3">
                                                        <div className="flex items-center justify-center">
                                                            <Plus className="w-3 h-3 text-white/15" />
                                                        </div>
                                                    </td>
                                                    <td className="py-2 px-3 text-white/15 text-[11px] font-mono" colSpan={4}>
                                                        Add new variable...
                                                    </td>
                                                </tr>
                                            )}

                                            {/* Empty state */}
                                            {selectedEnv.variables.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-20">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                                                                <Settings className="w-6 h-6 text-white/10 stroke-[1.5]" />
                                                            </div>
                                                            <p className="text-[11px] text-white/25 font-medium">No variables defined</p>
                                                            <p className="text-[10px] text-white/15 max-w-[220px]">
                                                                Click &quot;Add&quot; or the row above to create your first variable.
                                                            </p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}

                                            {/* No search results */}
                                            {searchQuery && filteredVariables.length === 0 && selectedEnv.variables.length > 0 && (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-12">
                                                        <p className="text-[11px] text-white/25">No variables match &quot;{searchQuery}&quot;</p>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-white/15 px-8">
                                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] mb-4">
                                    <Globe className="w-10 h-10 stroke-[1.2]" />
                                </div>
                                <p className="text-xs font-semibold text-white/25 mb-1">No environment selected</p>
                                <p className="text-[10px] text-white/15 text-center max-w-[240px]">
                                    Select an environment from the sidebar or create a new one to get started.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
