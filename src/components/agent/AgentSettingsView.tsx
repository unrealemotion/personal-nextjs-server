import React, { useState } from "react";
import { Sliders, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateId } from "@/lib/store";
import { DEFAULT_CONFIGS } from "./agent-prompts";
import { type AgentProfile } from "@/lib/schema";

interface AgentSettingsViewProps {
    profiles: AgentProfile[];
    activeProfileId: string | null;
    onChangeProfiles: (profiles: AgentProfile[]) => void;
    onChangeActiveProfileId: (id: string) => void;
    onSave: (profiles: AgentProfile[]) => void;
    onCancel: () => void;
    isDirty: boolean;
    tempActiveProfileId?: string | null;
    onChangeTempActiveProfileId?: (id: string) => void;
}

export function AgentSettingsView({
    profiles,
    activeProfileId,
    onChangeProfiles,
    onChangeActiveProfileId,
    onSave,
    onCancel,
    isDirty,
    tempActiveProfileId,
    onChangeTempActiveProfileId
}: AgentSettingsViewProps) {
    const [showKey, setShowKey] = useState(false);

    const selectedProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

    const handleAddProfile = () => {
        const newId = `profile_${generateId()}`;
        const newProfile: AgentProfile = {
            id: newId,
            name: `Profile ${profiles.length + 1}`,
            provider: "gemini",
            apiKey: "",
            endpoint: DEFAULT_CONFIGS.gemini.endpoint,
            model: DEFAULT_CONFIGS.gemini.model
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

    return (
        <div 
            className="flex-grow p-5 space-y-4 !overflow-y-auto overscroll-contain custom-scrollbar bg-neutral-950 text-white"
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
                            className="bg-neutral-900 border-white/10 text-white h-9 text-xs"
                            placeholder="Enter profile name"
                        />
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
                            <p className="text-[10px] text-white/40 leading-normal">
                                Automatically parses tool calls outputted as markdown JSON blocks or raw JSON responses (highly recommended for smaller local models).
                            </p>
                        </div>
                    </div>

                    {/* API Key */}
                    {selectedProfile.provider !== "custom" && (
                        <div className="space-y-2">
                            <Label className="text-xs text-white/60">API Key</Label>
                            <div className="relative">
                                <Input
                                    type={showKey ? "text" : "password"}
                                    value={selectedProfile.apiKey}
                                    onChange={(e) => handleUpdateField("apiKey", e.target.value)}
                                    className="bg-neutral-900 border-white/10 text-white h-9 pr-10 font-mono text-xs"
                                    placeholder="Enter API Key"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-2.5 text-white/40 hover:text-white cursor-pointer"
                                >
                                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="pt-4 flex space-x-2">
                <Button
                    onClick={onCancel}
                    variant="outline"
                    className="flex-1 border-white/10 text-white hover:bg-white/5 h-9 rounded-lg"
                >
                    Cancel
                </Button>
                <Button
                    disabled={!isDirty}
                    onClick={() => onSave(profiles)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white h-9 rounded-lg shadow-lg shadow-indigo-600/20 disabled:opacity-40 disabled:hover:bg-indigo-600 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed"
                >
                    Save Config
                </Button>
            </div>
        </div>
    );
}
