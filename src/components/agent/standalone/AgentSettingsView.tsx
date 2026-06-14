import React, { useState, useRef } from "react";
import { Sliders, Eye, EyeOff, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type AgentProfile, type ToolDefinition } from "./types";

const DEFAULT_CONFIGS: Record<"gemini" | "openai" | "custom", { endpoint: string; model: string }> = {
    gemini: {
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/",
        model: "gemini-2.5-flash"
    },
    openai: {
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o-mini"
    },
    custom: {
        endpoint: "http://localhost:11434/v1",
        model: "llama3"
    }
};

const generateLocalId = () => `profile_${Math.random().toString(36).substring(2, 9)}`;

interface AgentSettingsViewProps {
    profiles: AgentProfile[];
    originalProfiles: AgentProfile[];
    activeProfileId: string | null;
    onChangeProfiles: (profiles: AgentProfile[]) => void;
    onChangeActiveProfileId: (id: string) => void;
    onSave: (profiles: AgentProfile[], savedProfileId: string) => void;
    onCancel: () => void;
    tempActiveProfileId?: string | null;
    onChangeTempActiveProfileId?: (id: string) => void;
    
    tools: ToolDefinition[];
    presets?: {
        name: string;
        label: string;
        toolNames: string[];
        colorClass?: string;
    }[];
}

export function AgentSettingsView({
    profiles,
    originalProfiles,
    activeProfileId,
    onChangeProfiles,
    onChangeActiveProfileId,
    onSave,
    onCancel,
    tempActiveProfileId,
    onChangeTempActiveProfileId,
    tools = [],
    presets
}: AgentSettingsViewProps) {
    const [showKey, setShowKey] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
    const [showTooltip, setShowTooltip] = useState(false);

    const selectedProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

    const allToolNames = React.useMemo(() => tools.map(t => t.function.name), [tools]);

    // Group tools by category
    const categories = React.useMemo(() => {
        const groups: Record<string, string[]> = {};
        tools.forEach(t => {
            const cat = t.category || "General Operations";
            if (!groups[cat]) {
                groups[cat] = [];
            }
            groups[cat].push(t.function.name);
        });
        return groups;
    }, [tools]);

    const activePresetOptions = React.useMemo(() => {
        if (presets && presets.length > 0) return presets;
        return [
            {
                name: "all",
                label: "All (Default)",
                toolNames: allToolNames,
                colorClass: "bg-indigo-600 border-indigo-400 shadow-indigo-600/50"
            }
        ];
    }, [presets, allToolNames]);

    const determinePresetType = (allowedTools?: string[]): string => {
        if (!allowedTools) return "all";
        
        for (const preset of activePresetOptions) {
            const match = preset.toolNames.length === allowedTools.length && 
                          preset.toolNames.every(t => allowedTools.includes(t));
            if (match) return preset.name;
        }

        return "custom";
    };

    const [selectedPreset, setSelectedPreset] = useState<string>("all");
    const prevProfileIdRef = useRef<string | null>(null);
    if (selectedProfile && selectedProfile.id !== prevProfileIdRef.current) {
        prevProfileIdRef.current = selectedProfile.id;
        setSelectedPreset(determinePresetType(selectedProfile.allowedTools));
    }

    const handleAddProfile = () => {
        const newId = generateLocalId();
        let baseName = `Profile ${profiles.length + 1}`;
        let counter = profiles.length + 1;
        while (profiles.some(p => p.name.trim().toLowerCase() === baseName.trim().toLowerCase())) {
            counter++;
            baseName = `Profile ${counter}`;
        }
        const newProfile: AgentProfile = {
            id: newId,
            name: baseName,
            provider: "gemini",
            apiKey: "",
            endpoint: DEFAULT_CONFIGS.gemini.endpoint,
            model: DEFAULT_CONFIGS.gemini.model,
            allowedTools: allToolNames
        };
        const updated = [...profiles, newProfile];
        onChangeProfiles(updated);
        onChangeActiveProfileId(newId);
    };

    const handleDeleteProfile = () => {
        if (profiles.length <= 1 || !activeProfileId) return;
        const index = profiles.findIndex(p => p.id === activeProfileId);
        if (index === -1) return;
        const updated = profiles.filter(p => p.id !== activeProfileId);
        const nextActiveId = updated[index] ? updated[index].id : updated[updated.length - 1].id;
        onChangeProfiles(updated);
        onChangeActiveProfileId(nextActiveId);
        if (tempActiveProfileId === activeProfileId && onChangeTempActiveProfileId) {
            onChangeTempActiveProfileId(nextActiveId);
        }
    };

    const handleUpdateField = (field: keyof AgentProfile, value: any) => {
        if (!selectedProfile) return;
        const updated = profiles.map(p => {
            if (p.id === selectedProfile.id) {
                return { ...p, [field]: value };
            }
            return p;
        });
        onChangeProfiles(updated);
    };

    const handleProviderChange = (prov: "gemini" | "openai" | "custom") => {
        if (!selectedProfile) return;
        const updated = profiles.map(p => {
            if (p.id === selectedProfile.id) {
                return {
                    ...p,
                    provider: prov,
                    apiKey: p.provider === prov ? p.apiKey : "",
                    endpoint: DEFAULT_CONFIGS[prov].endpoint,
                    model: DEFAULT_CONFIGS[prov].model
                };
            }
            return p;
        });
        onChangeProfiles(updated);
    };

    const originalProfile = selectedProfile
        ? originalProfiles.find(p => p.id === selectedProfile.id)
        : undefined;

    const isProfileEqual = (a?: AgentProfile, b?: AgentProfile): boolean => {
        if (!a || !b) return false;
        const toolsA = a.allowedTools || allToolNames;
        const toolsB = b.allowedTools || allToolNames;
        const toolsEqual = toolsA.length === toolsB.length && toolsA.every(t => toolsB.includes(t));
        return (
            a.id === b.id &&
            (a.name || "").trim() === (b.name || "").trim() &&
            a.provider === b.provider &&
            (a.apiKey || "") === (b.apiKey || "") &&
            (a.endpoint || "") === (b.endpoint || "") &&
            (a.model || "") === (b.model || "") &&
            !!a.enableJsonFallback === !!b.enableJsonFallback &&
            !!a.bypassCorsWithExtension === !!b.bypassCorsWithExtension &&
            (a.maxExecutionLimit ?? 6) === (b.maxExecutionLimit ?? 6) &&
            toolsEqual
        );
    };

    const isCurrentProfileDirty = selectedProfile
        ? (!originalProfile || !isProfileEqual(selectedProfile, originalProfile))
        : false;

    const isNameDuplicate = selectedProfile && selectedProfile.name
        ? profiles.some(p => p && p.id !== selectedProfile.id && p.name && p.name.trim().toLowerCase() === selectedProfile.name.trim().toLowerCase())
        : false;
    const isNameEmpty = selectedProfile
        ? !selectedProfile.name || !selectedProfile.name.trim()
        : false;
    const isNameInvalid = isNameDuplicate || isNameEmpty;

    const isSaveDisabled = !selectedProfile || !isCurrentProfileDirty || isNameInvalid;

    const currentAllowed = selectedProfile?.allowedTools || allToolNames;

    const handleApplyPreset = (presetName: string) => {
        setSelectedPreset(presetName);
        if (presetName === "custom") {
            handleUpdateField("allowedTools", currentAllowed);
            return;
        }
        const opt = activePresetOptions.find(p => p.name === presetName);
        if (opt) {
            handleUpdateField("allowedTools", opt.toolNames);
        }
    };

    const handleToggleTool = (toolName: string) => {
        let updated: string[];
        if (currentAllowed.includes(toolName)) {
            updated = currentAllowed.filter(t => t !== toolName);
        } else {
            updated = [...currentAllowed, toolName];
        }
        setSelectedPreset("custom");
        handleUpdateField("allowedTools", updated);
    };

    const handleToggleCategory = (categoryTools: string[], allSelected: boolean) => {
        let updated: string[];
        if (allSelected) {
            updated = currentAllowed.filter(t => !categoryTools.includes(t));
        } else {
            const newTools = categoryTools.filter(t => !currentAllowed.includes(t));
            updated = [...currentAllowed, ...newTools];
        }
        setSelectedPreset("custom");
        handleUpdateField("allowedTools", updated);
    };

    const getToolLabel = (name: string) => {
        const found = tools.find(t => t.function.name === name);
        return found ? found.displayName : name;
    };

    const renderCategorySection = (title: string, categoryTools: string[]) => {
        const selectedInCat = categoryTools.filter(t => currentAllowed.includes(t));
        const allSelected = selectedInCat.length === categoryTools.length;
        const isCollapsed = !!collapsedCats[title];
        
        return (
            <div className="border border-white/5 rounded-lg overflow-hidden bg-neutral-950/40" key={title}>
                <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/40 text-xs border-b border-white/5">
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => handleToggleCategory(categoryTools, allSelected)}
                            className="w-3.5 h-3.5 rounded border-white/10 bg-neutral-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="font-semibold text-white/90">{title}</span>
                        <span className="text-[10px] text-white/40 font-mono ml-1">
                            ({selectedInCat.length}/{categoryTools.length})
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCollapsedCats(prev => ({ ...prev, [title]: !prev[title] }))}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider cursor-pointer bg-transparent border-0"
                    >
                        {isCollapsed ? "Expand" : "Collapse"}
                    </button>
                </div>

                {!isCollapsed && (
                    <div className="p-3 grid grid-cols-1 gap-2 bg-neutral-900/10">
                        {categoryTools.map(tool => {
                            const isChecked = currentAllowed.includes(tool);
                            return (
                                <div key={tool} className="flex items-start space-x-2 text-[11px] py-0.5">
                                    <input
                                        type="checkbox"
                                        id={`tool-${tool}`}
                                        checked={isChecked}
                                        onChange={() => handleToggleTool(tool)}
                                        className="w-3.5 h-3.5 mt-0.5 rounded border-white/10 bg-neutral-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <div className="leading-tight">
                                        <label
                                            htmlFor={`tool-${tool}`}
                                            className="font-medium text-white/80 hover:text-white cursor-pointer select-none"
                                        >
                                            {getToolLabel(tool)}
                                        </label>
                                        <p className="text-[9px] text-white/30 font-mono mt-0.5">
                                            {tool}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="relative flex flex-col flex-grow min-h-0 bg-neutral-950 text-white overflow-hidden select-none">
            <div 
                className="flex-grow p-5 pb-28 space-y-4 overflow-y-auto overscroll-contain custom-scrollbar"
                style={{ overscrollBehavior: "contain" }}
            >
                <div className="flex items-center space-x-2 border-b border-white/5 pb-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold">Model Configuration</h3>
                </div>

                {/* Profile Selector */}
                <div className="space-y-2">
                    <Label className="text-xs text-white/60">Profile</Label>
                    <div className="flex space-x-2">
                        <div className="flex-grow">
                            <Select
                                value={selectedProfile?.id || ""}
                                onValueChange={(val) => onChangeActiveProfileId(val)}
                                modal={false}
                            >
                                <SelectTrigger className="bg-neutral-900 border-white/10 text-white h-9 rounded-lg">
                                    <SelectValue placeholder="Select active profile" />
                                </SelectTrigger>
                                <SelectContent position="popper" className="bg-neutral-900 border-white/10 text-white">
                                    {profiles.map((p) => (
                                        <SelectItem key={p.id} value={p.id} className="hover:bg-white/5">
                                            {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleAddProfile}
                            className="w-9 h-9 border-white/10 text-white hover:bg-white/5 shrink-0 cursor-pointer"
                            title="Add Profile"
                        >
                            <Plus className="w-4 h-4" />
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={profiles.length <= 1}
                            onClick={handleDeleteProfile}
                            className="w-9 h-9 border-white/10 text-red-400 hover:text-red-300 hover:bg-white/5 shrink-0 cursor-pointer disabled:opacity-40 disabled:hover:text-red-400"
                            title="Delete Selected Profile"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {selectedProfile && (
                    <>
                        {/* Profile Name */}
                        <div className="space-y-2">
                            <Label className="text-xs text-white/60">Profile Name</Label>
                            <Input
                                value={selectedProfile.name}
                                onChange={(e) => handleUpdateField("name", e.target.value)}
                                className={`bg-neutral-900 text-white h-9 text-xs ${
                                    isNameInvalid ? "border-red-500 focus-visible:ring-red-500" : "border-white/10"
                                }`}
                                placeholder="Enter profile name"
                            />
                            {isNameDuplicate && (
                                <p className="text-[10px] text-red-400 mt-1">Profile name must be unique.</p>
                            )}
                            {isNameEmpty && (
                                <p className="text-[10px] text-red-400 mt-1">Profile name cannot be empty.</p>
                            )}
                        </div>

                        {/* Provider Select */}
                        <div className="space-y-2">
                            <Label className="text-xs text-white/60">Provider</Label>
                            <Select
                                value={selectedProfile.provider}
                                onValueChange={handleProviderChange}
                                modal={false}
                            >
                                <SelectTrigger className="bg-neutral-900 border-white/10 text-white h-9 rounded-lg">
                                    <SelectValue placeholder="Select provider" />
                                </SelectTrigger>
                                <SelectContent position="popper" className="bg-neutral-900 border-white/10 text-white">
                                    <SelectItem value="gemini" className="hover:bg-white/5">Google Gemini</SelectItem>
                                    <SelectItem value="openai" className="hover:bg-white/5">OpenAI (GPT)</SelectItem>
                                    <SelectItem value="custom" className="hover:bg-white/5">Custom OpenAI-Compatible (Ollama, etc.)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Base Endpoint */}
                        <div className="space-y-2">
                            <Label className="text-xs text-white/60">API Base Endpoint</Label>
                            <Input
                                value={selectedProfile.endpoint}
                                onChange={(e) => handleUpdateField("endpoint", e.target.value)}
                                className="bg-neutral-900 border-white/10 text-white h-9 font-mono text-xs"
                                placeholder="Endpoint URL"
                            />
                        </div>

                        {/* Model ID */}
                        <div className="space-y-2">
                            <Label className="text-xs text-white/60">Model Name</Label>
                            <Input
                                value={selectedProfile.model}
                                onChange={(e) => handleUpdateField("model", e.target.value)}
                                className="bg-neutral-900 border-white/10 text-white h-9 font-mono text-xs"
                                placeholder="Model identifier"
                            />
                        </div>

                        {/* JSON Fallback Checkbox */}
                        <div className="flex items-start space-x-2 pt-1">
                            <input
                                type="checkbox"
                                id="enableJsonFallback"
                                checked={!!selectedProfile.enableJsonFallback}
                                onChange={(e) => handleUpdateField("enableJsonFallback", e.target.checked)}
                                className="w-4 h-4 mt-0.5 rounded border-white/10 bg-neutral-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-neutral-950 cursor-pointer"
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="enableJsonFallback"
                                    className="text-xs font-semibold text-white/80 cursor-pointer select-none"
                                >
                                    Enable Markdown JSON Fallback
                                </label>
                                <p className="text-[10px] text-white/40 leading-normal text-left">
                                    Automatically parses tool calls outputted as markdown JSON blocks or raw JSON responses (highly recommended for smaller local models).
                                </p>
                            </div>
                        </div>

                        {/* Bypass CORS via Extension Checkbox */}
                        <div className="flex items-start space-x-2 pt-1">
                            <input
                                type="checkbox"
                                id="bypassCorsWithExtension"
                                checked={selectedProfile.bypassCorsWithExtension !== undefined ? selectedProfile.bypassCorsWithExtension : (
                                    (() => {
                                        let hostname = "";
                                        try {
                                            const parsed = new URL(selectedProfile.endpoint);
                                            hostname = parsed.hostname;
                                        } catch (e) {}
                                        return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname === "localhost" || hostname.endsWith(".local");
                                    })()
                                )}
                                onChange={(e) => handleUpdateField("bypassCorsWithExtension", e.target.checked)}
                                className="w-4 h-4 mt-0.5 rounded border-white/10 bg-neutral-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-neutral-950 cursor-pointer"
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="bypassCorsWithExtension"
                                    className="text-xs font-semibold text-white/80 cursor-pointer select-none"
                                >
                                    Bypass CORS via Proxy Helper
                                </label>
                                <p className="text-[10px] text-white/40 leading-normal text-left">
                                    Route LLM requests through the local proxy/extension helper to bypass browser CORS restrictions (auto-enabled for local addresses).
                                </p>
                            </div>
                        </div>

                        {/* Execution Limit */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label className="text-xs text-white/60">Max Tool Execution Turns</Label>
                                <span className="text-[10px] text-white/40 font-mono">0 = Infinite turns</span>
                            </div>
                            <Input
                                type="number"
                                min="0"
                                value={selectedProfile.maxExecutionLimit !== undefined ? selectedProfile.maxExecutionLimit : 6}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    handleUpdateField("maxExecutionLimit", isNaN(val) ? 6 : val);
                                }}
                                className="bg-neutral-900 border-white/10 text-white h-9 font-mono text-xs"
                                placeholder="6"
                            />
                        </div>

                        {/* API Key */}
                        {selectedProfile.provider !== "custom" && (
                            <div className="space-y-2">
                                <Label className="text-xs text-white/60">API Key</Label>
                                <div className="relative">
                                    <Input
                                        type={showKey ? "text" : "password"}
                                        value={selectedProfile.apiKey || ""}
                                        onChange={(e) => handleUpdateField("apiKey", e.target.value)}
                                        className="bg-neutral-900 border-white/10 text-white h-9 pr-10 font-mono text-xs"
                                        placeholder="Enter API Key"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowKey(!showKey)}
                                        className="absolute right-3 top-2.5 text-white/40 hover:text-white cursor-pointer bg-transparent border-0"
                                    >
                                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Advanced Configuration Accordion */}
                        <div className="border border-white/10 rounded-lg overflow-hidden bg-neutral-900/30">
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold bg-neutral-900 hover:bg-neutral-800/80 transition-colors border-b border-white/5 cursor-pointer text-white/80 border-0"
                            >
                                <span>Advanced Configuration</span>
                                <span className="text-[10px] text-indigo-400 uppercase tracking-widest flex items-center space-x-1 font-bold">
                                    {showAdvanced ? (
                                        <>
                                            <span>Hide</span>
                                            <ChevronUp className="w-3 h-3" />
                                        </>
                                    ) : (
                                        <>
                                            <span>Show</span>
                                            <ChevronDown className="w-3 h-3" />
                                        </>
                                    )}
                                </span>
                            </button>

                            {showAdvanced && (
                                <div className="p-4 space-y-4">
                                    {/* Presets Section */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-white/60">Preset Permissions</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {activePresetOptions.map((preset) => (
                                                <button
                                                    key={preset.name}
                                                    type="button"
                                                    onClick={() => handleApplyPreset(preset.name)}
                                                    className={
                                                        selectedPreset === preset.name
                                                            ? `h-7 px-3 text-[9px] uppercase font-black tracking-wider border-2 text-white rounded-md cursor-pointer transition-all shadow-md scale-[1.03] ${preset.colorClass || "bg-indigo-600 border-indigo-400"}`
                                                            : "h-7 px-3 text-[9px] uppercase font-bold tracking-wider border border-white/15 bg-neutral-900/40 text-white/50 hover:text-white/80 hover:bg-neutral-800/60 rounded-md cursor-pointer transition-all"
                                                    }
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => handleApplyPreset("custom")}
                                                className={
                                                    selectedPreset === "custom"
                                                        ? "h-7 px-3 text-[9px] uppercase font-black tracking-wider bg-indigo-500/20 border-2 border-indigo-400 text-indigo-200 rounded-md cursor-pointer transition-all shadow-md shadow-indigo-500/35 scale-[1.03]"
                                                        : "h-7 px-3 text-[9px] uppercase font-bold tracking-wider border border-white/15 bg-neutral-900/40 text-white/50 hover:text-white/80 hover:bg-neutral-800/60 rounded-md cursor-pointer transition-all"
                                                }
                                            >
                                                Customization
                                            </button>
                                        </div>
                                    </div>

                                    {/* Permission Tree */}
                                    {selectedPreset === "custom" && (
                                        <div className="space-y-3 pt-2">
                                            <Label className="text-xs text-white/60 font-semibold text-white/80">Tool Access Control</Label>
                                            {Object.entries(categories).map(([catTitle, catTools]) => 
                                                renderCategorySection(catTitle, catTools)
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Action Buttons */}
            <Button
                onClick={onCancel}
                variant="outline"
                className="absolute bottom-4 left-4 right-[calc(50%+4px)] border-white/10 text-white bg-neutral-900/80 hover:bg-neutral-900/90 backdrop-blur-md h-9 rounded-lg cursor-pointer opacity-60 hover:opacity-100 transition-all duration-200 z-10 shadow-lg shadow-black/25"
            >
                Cancel
            </Button>
            <div 
                className="absolute bottom-4 right-4 left-[calc(50%+4px)] z-10"
                onMouseEnter={() => isSaveDisabled && setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
            >
                <Button
                    disabled={isSaveDisabled}
                    onClick={() => selectedProfile && onSave(profiles, selectedProfile.id)}
                    className="w-full bg-indigo-600/80 hover:bg-indigo-500 text-white backdrop-blur-md h-9 rounded-lg shadow-lg shadow-indigo-600/20 disabled:opacity-40 disabled:hover:bg-indigo-600 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed opacity-60 hover:opacity-100 transition-all duration-200"
                >
                    Save Config
                </Button>
                {showTooltip && isSaveDisabled && (
                    <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 bg-neutral-950/95 border border-indigo-500/35 text-indigo-200 text-[10px] font-semibold py-1.5 px-3 rounded-lg shadow-xl shadow-black/50 backdrop-blur-md z-20 pointer-events-none whitespace-nowrap animate-fade-in">
                        No changes have been made
                    </div>
                )}
            </div>
        </div>
    );
}
