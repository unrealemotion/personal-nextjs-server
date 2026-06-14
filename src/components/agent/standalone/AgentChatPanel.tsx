"use client";

import React, { useEffect, useRef } from "react";
import {
    X,
    Trash2,
    Settings,
    Send,
    AlertCircle,
    Loader2,
    RefreshCw,
    Square,
    CornerLeftUp,
    MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { useAgentContext } from "./AgentContext";
import { AgentSettingsView } from "./AgentSettingsView";
import { AgentMessageItem } from "./AgentMessageItem";
import { EtherealAiSymbol } from "./EtherealAiSymbol";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

export interface AgentChatPanelProps {
    title?: string;
    presets?: { label: string; prompt: string }[];
    logo?: React.ReactNode;
    settingsPresetPermissions?: {
        name: string;
        label: string;
        toolNames: string[];
        colorClass?: string;
    }[];
}

export function AgentChatPanel({
    title = "Splurge",
    presets = [],
    logo,
    settingsPresetPermissions
}: AgentChatPanelProps) {
    const {
        isOpen,
        setIsOpen,
        view,
        setView,
        messages,
        revertTargetId,
        setRevertTargetId,
        hasCheckpoint,
        shouldRevertModification,
        setShouldRevertModification,
        input,
        setInput,
        messageQueue,
        handleRemoveQueuedMessage,
        isLoading,
        activeToolName,
        tempProfiles,
        setTempProfiles,
        tempActiveProfileId,
        setTempActiveProfileId,
        editingProfileId,
        setEditingProfileId,
        activeProfile,
        agentProfiles,
        saveConfig,
        changeActiveProfileId,
        handleSend,
        handleClearChat,
        handleRevert,
        confirmRevert,
        isDirty,
        agentPanelPosition,
        setAgentPanelPosition,
        agentPanelSize,
        setAgentPanelSize,
        handleStop,
        handleMergeQueuedMessage,
        tools
    } = useAgentContext();

    const [zoom, setZoom] = React.useState(1);
    const baselinePixelRatioRef = useRef(1);

    // Track browser zoom level reactively
    useEffect(() => {
        if (typeof window !== "undefined") {
            baselinePixelRatioRef.current = window.devicePixelRatio || 1;

            const handleZoom = () => {
                const currentRatio = window.devicePixelRatio || 1;
                const newZoom = currentRatio / baselinePixelRatioRef.current;
                setZoom(newZoom || 1);
            };

            window.addEventListener("resize", handleZoom);
            handleZoom();

            return () => window.removeEventListener("resize", handleZoom);
        }
    }, []);

    const zoomIndependentStyle = React.useMemo(() => {
        const width = agentPanelSize?.width ?? 450;
        const height = agentPanelSize?.height ?? 650;
        const baseStyle: React.CSSProperties = {
            position: "fixed",
            width: `${width / zoom}px`,
            height: `${height / zoom}px`,
            maxWidth: `calc(100vw - ${32 / zoom}px)`,
            maxHeight: `calc(100vh - ${48 / zoom}px)`,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(99, 102, 241, 0.15)',
            overscrollBehavior: "contain"
        };

        if (agentPanelPosition) {
            return {
                ...baseStyle,
                left: `${agentPanelPosition.x / zoom}px`,
                top: `${agentPanelPosition.y / zoom}px`,
                bottom: "auto",
                right: "auto",
            };
        } else {
            return {
                ...baseStyle,
                bottom: `${24 / zoom}px`,
                right: `${24 / zoom}px`,
                left: "auto",
                top: "auto",
            };
        }
    }, [agentPanelPosition, agentPanelSize, zoom]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ mouseX: number; mouseY: number; panelX: number; panelY: number } | null>(null);
    const resizeStartRef = useRef<{
        mouseX: number;
        mouseY: number;
        panelX: number;
        panelY: number;
        panelWidth: number;
        panelHeight: number;
        handle: string;
    } | null>(null);

    // Handle window resize to clamp panel inside the screen
    useEffect(() => {
        const handleResize = () => {
            if (agentPanelPosition) {
                const width = agentPanelSize?.width ?? 450;
                const height = agentPanelSize?.height ?? 650;
                const panelWidth = width / zoom;
                const panelHeight = height / zoom;
                const minX = 12;
                const maxX = window.innerWidth - panelWidth - 12;
                const minY = 12;
                const maxY = window.innerHeight - panelHeight - 12;

                const currentX = agentPanelPosition.x / zoom;
                const currentY = agentPanelPosition.y / zoom;

                const clampedX = Math.max(minX, Math.min(maxX, currentX));
                const clampedY = Math.max(minY, Math.min(maxY, currentY));

                if (clampedX !== currentX || clampedY !== currentY) {
                    setAgentPanelPosition({ x: clampedX * zoom, y: clampedY * zoom });
                }
            }
        };

        window.addEventListener("resize", handleResize);
        handleResize();
        return () => window.removeEventListener("resize", handleResize);
    }, [agentPanelPosition, agentPanelSize, zoom]);

    const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return; // Left click only

        const target = e.target as HTMLElement;
        if (
            target.closest('button') ||
            target.closest('a') ||
            target.closest('[data-slot="select-trigger"]') ||
            target.closest('[role="combobox"]')
        ) return;

        e.preventDefault();

        const panelEl = panelRef.current;
        if (!panelEl) return;

        const rect = panelEl.getBoundingClientRect();

        dragStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            panelX: rect.left,
            panelY: rect.top
        };

        document.body.style.cursor = 'grabbing';
        panelEl.style.transition = 'none';
        panelEl.style.willChange = 'transform';

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!dragStartRef.current || !panelRef.current) return;
            const dx = moveEvent.clientX - dragStartRef.current.mouseX;
            const dy = moveEvent.clientY - dragStartRef.current.mouseY;

            const newX = dragStartRef.current.panelX + dx;
            const newY = dragStartRef.current.panelY + dy;

            const width = agentPanelSize?.width ?? 450;
            const height = agentPanelSize?.height ?? 650;
            const panelWidth = width / zoom;
            const panelHeight = height / zoom;
            const minX = 12;
            const maxX = window.innerWidth - panelWidth - 12;
            const minY = 12;
            const maxY = window.innerHeight - panelHeight - 12;

            const clampedX = Math.max(minX, Math.min(maxX, newX));
            const clampedY = Math.max(minY, Math.min(maxY, newY));

            const tx = clampedX - dragStartRef.current.panelX;
            const ty = clampedY - dragStartRef.current.panelY;
            panelRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0px)`;
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = '';

            if (dragStartRef.current) {
                const dx = upEvent.clientX - dragStartRef.current.mouseX;
                const dy = upEvent.clientY - dragStartRef.current.mouseY;

                const newX = dragStartRef.current.panelX + dx;
                const newY = dragStartRef.current.panelY + dy;

                const width = agentPanelSize?.width ?? 450;
                const height = agentPanelSize?.height ?? 650;
                const panelWidth = width / zoom;
                const panelHeight = height / zoom;
                const minX = 12;
                const maxX = window.innerWidth - panelWidth - 12;
                const minY = 12;
                const maxY = window.innerHeight - panelHeight - 12;

                const clampedX = Math.max(minX, Math.min(maxX, newX));
                const clampedY = Math.max(minY, Math.min(maxY, newY));

                if (panelRef.current) {
                    panelRef.current.style.left = `${clampedX}px`;
                    panelRef.current.style.top = `${clampedY}px`;
                    panelRef.current.style.bottom = 'auto';
                    panelRef.current.style.right = 'auto';
                    panelRef.current.style.transform = 'none';

                    const el = panelRef.current;
                    setTimeout(() => {
                        if (el) {
                            el.style.transition = '';
                            el.style.willChange = '';
                        }
                    }, 50);
                }

                setAgentPanelPosition({ x: clampedX * zoom, y: clampedY * zoom });
            }
            dragStartRef.current = null;
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    const handleResizeMouseDown = (e: React.MouseEvent, handle: string) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const panelEl = panelRef.current;
        if (!panelEl) return;

        const rect = panelEl.getBoundingClientRect();

        resizeStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            panelX: rect.left,
            panelY: rect.top,
            panelWidth: rect.width,
            panelHeight: rect.height,
            handle
        };

        document.body.style.cursor =
            handle === "l" || handle === "r" ? "ew-resize" :
                handle === "t" || handle === "b" ? "ns-resize" :
                    handle === "tl" || handle === "br" ? "nwse-resize" :
                        "nesw-resize";

        panelEl.style.transition = 'none';
        panelEl.style.willChange = 'transform, width, height, left, top';

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!resizeStartRef.current || !panelRef.current) return;
            const start = resizeStartRef.current;
            const dx = moveEvent.clientX - start.mouseX;
            const dy = moveEvent.clientY - start.mouseY;

            let newWidth = start.panelWidth;
            let newHeight = start.panelHeight;
            let newLeft = start.panelX;
            let newTop = start.panelY;

            const minWidth = 320;
            const minHeight = 400;
            const maxWidth = window.innerWidth - 24;
            const maxHeight = window.innerHeight - 24;

            if (start.handle.includes("l")) {
                const requestedWidth = start.panelWidth - dx;
                newWidth = Math.max(minWidth, Math.min(maxWidth, requestedWidth));
                const actualDx = start.panelWidth - newWidth;
                newLeft = start.panelX + actualDx;
            } else if (start.handle.includes("r")) {
                const requestedWidth = start.panelWidth + dx;
                newWidth = Math.max(minWidth, Math.min(maxWidth, requestedWidth));
            }

            if (start.handle.includes("t")) {
                const requestedHeight = start.panelHeight - dy;
                newHeight = Math.max(minHeight, Math.min(maxHeight, requestedHeight));
                const actualDy = start.panelHeight - newHeight;
                newTop = start.panelY + actualDy;
            } else if (start.handle.includes("b")) {
                const requestedHeight = start.panelHeight + dy;
                newHeight = Math.max(minHeight, Math.min(maxHeight, requestedHeight));
            }

            panelRef.current.style.width = `${newWidth}px`;
            panelRef.current.style.height = `${newHeight}px`;
            panelRef.current.style.left = `${newLeft}px`;
            panelRef.current.style.top = `${newTop}px`;
            panelRef.current.style.bottom = 'auto';
            panelRef.current.style.right = 'auto';
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = '';

            if (resizeStartRef.current && panelRef.current) {
                const rect = panelRef.current.getBoundingClientRect();
                const finalWidth = rect.width * zoom;
                const finalHeight = rect.height * zoom;
                const finalX = rect.left * zoom;
                const finalY = rect.top * zoom;

                setAgentPanelSize({ width: finalWidth, height: finalHeight });
                setAgentPanelPosition({ x: finalX, y: finalY });

                const el = panelRef.current;
                setTimeout(() => {
                    if (el) {
                        el.style.transition = '';
                        el.style.willChange = '';
                    }
                }, 50);
            }
            resizeStartRef.current = null;
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    // Auto scroll chat list
    useEffect(() => {
        if (isOpen && messagesEndRef.current) {
            const timer = setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 60);
            return () => clearTimeout(timer);
        }
    }, [messages, isLoading, activeToolName, isOpen]);

    const resolvedLogo = logo || <EtherealAiSymbol className="w-5.5 h-5.5" />;

    const getToolLabel = (name: string) => {
        const found = tools.find(t => t.function.name === name);
        return found ? found.displayName : name;
    };

    return (
        <>
            {/* Floating Agent Chat Button */}
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 z-40 w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 group border border-indigo-500/35 ${isOpen
                        ? "opacity-0 pointer-events-none scale-75 translate-y-4"
                        : "opacity-100 scale-100 translate-y-0 hover:scale-110 active:scale-95"
                    }`}
                style={{
                    background: 'radial-gradient(circle at center, rgba(30, 27, 75, 0.9) 0%, rgba(9, 9, 11, 0.95) 100%)',
                    boxShadow: '0 0 25px rgba(99, 102, 241, 0.25), inset 0 0 14px rgba(129, 140, 248, 0.2)',
                    backdropFilter: 'blur(16px)',
                }}
            >
                <div className="absolute inset-[-4px] rounded-full opacity-40 group-hover:opacity-60 transition-opacity duration-500"
                    style={{
                        border: '1px dashed rgba(168, 85, 247, 0.4)',
                        animation: 'spin-clockwise 20s linear infinite',
                    }}
                />
                <div className="absolute inset-[-8px] rounded-full opacity-25 group-hover:opacity-50 transition-all duration-700 group-hover:scale-105"
                    style={{
                        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
                        animation: 'pulse 3s ease-in-out infinite',
                    }}
                />
                <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 60%)',
                        boxShadow: '0 0 35px rgba(139, 92, 246, 0.4)',
                    }}
                />
                {logo || <EtherealAiSymbol className="w-8 h-8 relative z-10 transition-transform duration-500 group-hover:scale-115" />}
            </button>

            {/* Chat Panel Window Container */}
            <div
                ref={panelRef}
                className={`z-50 flex flex-col bg-neutral-950/90 border border-indigo-500/30 rounded-2xl backdrop-blur-md overflow-hidden overscroll-contain origin-center chat-panel-transition ${isOpen
                        ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                        : "opacity-0 scale-95 translate-y-4 pointer-events-none"
                    }`}
                style={zoomIndependentStyle}
            >
                {/* Header bar */}
                <div
                    onMouseDown={handleHeaderMouseDown}
                    className="px-4 py-3 border-b border-white/5 bg-neutral-900/50 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
                >
                    <div className="flex items-center space-x-2">
                        {resolvedLogo}
                        <span className="text-sm font-bold text-white">{title}</span>
                        <Select
                            value={tempActiveProfileId || ""}
                            onValueChange={(val) => changeActiveProfileId(val)}
                            modal={false}
                        >
                            <SelectTrigger
                                size="sm"
                                className="bg-indigo-500/15 hover:bg-indigo-500/25 border-transparent shadow-none text-indigo-300 h-5 px-1.5 text-[9px] uppercase font-black tracking-wider rounded cursor-pointer transition-colors focus:ring-0 focus-visible:ring-[0px] focus-visible:ring-offset-0 focus:ring-offset-0 [&_svg]:size-3 shrink-0 select-none"
                            >
                                <SelectValue placeholder="Model" />
                            </SelectTrigger>
                            <SelectContent
                                position="popper"
                                className="bg-neutral-950 border-white/10 text-white min-w-[140px]"
                            >
                                {agentProfiles.map((p) => (
                                    <SelectItem
                                        key={p.id}
                                        value={p.id}
                                        className="hover:bg-white/5 cursor-pointer text-xs"
                                    >
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center space-x-1">
                        {view === "chat" && messages.length > 1 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleClearChat}
                                className="w-8 h-8 rounded-lg hover:bg-white/5 text-red-400 hover:text-red-300"
                                title="Clear Chat"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setView(view === "chat" ? "settings" : "chat")}
                            className="w-8 h-8 rounded-lg hover:bg-white/5 text-white/70 hover:text-white"
                            title={view === "settings" ? "Back to Chat" : "Agent Settings"}
                        >
                            {view === "settings" ? (
                                <MessageSquare className="w-4 h-4 text-indigo-400" />
                            ) : (
                                <Settings className="w-4 h-4" />
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsOpen(false)}
                            className="w-8 h-8 rounded-lg hover:bg-white/5 text-white/70 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {view === "settings" ? (
                    <AgentSettingsView
                        profiles={tempProfiles}
                        originalProfiles={agentProfiles}
                        activeProfileId={editingProfileId}
                        onChangeProfiles={setTempProfiles}
                        onChangeActiveProfileId={setEditingProfileId}
                        onSave={(newProfiles, savedProfileId) => {
                            saveConfig(newProfiles, savedProfileId);
                        }}
                        onCancel={() => setView("chat")}
                        tempActiveProfileId={tempActiveProfileId}
                        onChangeTempActiveProfileId={setTempActiveProfileId}
                        tools={tools}
                        presets={settingsPresetPermissions}
                    />
                ) : (
                    /* Chat Window View */
                    <div className="flex-grow flex flex-col min-h-0">
                        {/* Messages Container */}
                        <div
                            className="flex-grow p-4 overflow-y-auto overscroll-contain custom-scrollbar space-y-4 select-text"
                            style={{ overscrollBehavior: "contain" }}
                        >
                            {messages.filter((m) => m.role !== "tool").map((m) => (
                                <AgentMessageItem
                                    key={m.id}
                                    message={m}
                                    allMessages={messages}
                                    onRevert={handleRevert}
                                    tools={tools}
                                />
                            ))}

                            {/* Thinking Indicators */}
                            {isLoading && !activeToolName && (
                                <div className="flex justify-start items-center space-x-2">
                                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                                        {resolvedLogo}
                                    </div>
                                    <div className="bg-neutral-900 text-white/60 px-3 py-2 rounded-xl border border-white/5 flex items-center space-x-2 text-xs">
                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                                        <span>Thinking...</span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleStop}
                                        className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 flex items-center justify-center shrink-0 cursor-pointer backdrop-blur-sm"
                                        title="Stop Agent Execution"
                                    >
                                        <Square className="w-2.5 h-2.5 fill-red-400" />
                                    </Button>
                                </div>
                            )}

                            {isLoading && activeToolName && (
                                <div className="flex justify-start items-center space-x-2">
                                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                                        {resolvedLogo}
                                    </div>
                                    <div className="bg-neutral-900 text-white/80 px-3 py-2 rounded-xl border border-indigo-500/15 flex items-center space-x-2 text-xs animate-pulse">
                                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                                        <span>Running tool: <strong className="text-indigo-400 font-semibold">{getToolLabel(activeToolName)}</strong>...</span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleStop}
                                        className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 flex items-center justify-center shrink-0 cursor-pointer backdrop-blur-sm"
                                        title="Stop Agent Execution"
                                    >
                                        <Square className="w-2.5 h-2.5 fill-red-400" />
                                    </Button>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Presets and suggested triggers */}
                        {messages.length <= 1 && presets.length > 0 && (
                            <div className="px-4 py-2 border-t border-white/5 flex flex-wrap gap-1.5 bg-neutral-950/40">
                                {presets.map((preset, pIdx) => (
                                    <button
                                        key={pIdx}
                                        onClick={() => handleSend(preset.prompt)}
                                        className="text-[10px] text-indigo-400 hover:text-white bg-indigo-500/5 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/50 px-2 py-1 rounded-full cursor-pointer transition-colors border-0"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Message Queue Indicator */}
                        {messageQueue.length > 0 && (
                            <div
                                className={`px-4 py-2.5 border-t border-white/5 bg-indigo-950/20 backdrop-blur-md select-text shrink-0 flex flex-col ${messageQueue.length > 1
                                        ? "h-[160px] overflow-hidden"
                                        : "max-h-[110px] overflow-y-auto overscroll-contain custom-scrollbar"
                                    }`}
                                style={{ overscrollBehavior: "contain" }}
                            >
                                <div className="flex items-center justify-between text-[10px] font-bold text-indigo-400 uppercase tracking-widest select-none pb-1.5 shrink-0">
                                    <span>Queued prompts ({messageQueue.length})</span>
                                </div>
                                <div className="flex-grow flex flex-col min-h-0 space-y-2">
                                    <div
                                        className={`bg-indigo-500/15 border border-indigo-500/25 px-2.5 py-1.5 rounded-lg text-xs transition-colors flex flex-col space-y-0.5 relative group animate-fade-in shrink-0 ${messageQueue.length > 1 ? "max-h-[56px]" : "max-h-[75px]"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between text-[9px] font-semibold text-indigo-300 uppercase tracking-wider select-none shrink-0">
                                            <span>Next to send</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveQueuedMessage(0)}
                                                className="text-indigo-400 hover:text-red-400 transition-colors shrink-0 p-0.5 rounded hover:bg-white/5 cursor-pointer flex items-center justify-center bg-transparent border-0"
                                                title="Cancel prompt"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <div
                                            className="text-white text-xs leading-relaxed text-left whitespace-pre-wrap break-words pr-5 overflow-y-auto overscroll-contain custom-scrollbar min-h-0"
                                            style={{ overscrollBehavior: "contain" }}
                                        >
                                            {messageQueue[0]}
                                        </div>
                                    </div>

                                    {messageQueue.length > 1 && (
                                        <div className="flex-grow flex flex-col min-h-0 space-y-1.5 pt-0.5">
                                            <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider pl-1 select-none text-left shrink-0">
                                                Upcoming Queue
                                            </div>
                                            <div
                                                className="flex-grow overflow-y-auto overscroll-contain custom-scrollbar space-y-1"
                                                style={{ overscrollBehavior: "contain" }}
                                            >
                                                {messageQueue.slice(1).map((msg, idx) => {
                                                    const realIdx = idx + 1;
                                                    return (
                                                        <div
                                                            key={realIdx}
                                                            className="flex items-center justify-between gap-2 bg-neutral-900 border border-white/5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors shrink-0"
                                                        >
                                                            <span
                                                                onClick={() => handleMergeQueuedMessage(realIdx)}
                                                                className="text-white/60 hover:text-indigo-300 cursor-pointer truncate flex-grow text-left select-none transition-colors font-medium"
                                                                title="Click to merge as next line of 'Next to send'"
                                                            >
                                                                {realIdx}. {msg}
                                                            </span>
                                                            <div className="flex items-center space-x-1 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleMergeQueuedMessage(realIdx)}
                                                                    className="text-white/40 hover:text-indigo-400 transition-colors p-0.5 rounded hover:bg-white/5 cursor-pointer flex items-center justify-center bg-transparent border-0"
                                                                    title="Merge with 'Next to send' (adds as next line)"
                                                                >
                                                                    <CornerLeftUp className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveQueuedMessage(realIdx)}
                                                                    className="text-white/40 hover:text-red-400 transition-colors p-0.5 rounded hover:bg-white/5 cursor-pointer flex items-center justify-center bg-transparent border-0"
                                                                    title="Cancel prompt"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Input form */}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSend();
                            }}
                            className="p-3 border-t border-white/5 bg-neutral-950 flex items-center space-x-2 shrink-0 w-full"
                        >
                            {(() => {
                                const isDisabled = !activeProfile || (!activeProfile.apiKey && activeProfile.provider !== "custom");
                                const inputArea = (
                                    <div className="flex items-center space-x-2 flex-grow min-w-0">
                                        <Textarea
                                            disabled={isDisabled}
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSend();
                                                }
                                            }}
                                            placeholder={
                                                isDisabled
                                                    ? "Configure API Key in Settings first..."
                                                    : isLoading
                                                        ? "Type to queue next message..."
                                                        : "Ask AI agent a question..."
                                            }
                                            className="bg-neutral-900 border-white/10 text-white rounded-lg text-xs resize-none min-h-[36px] py-2 overscroll-contain custom-scrollbar flex-grow"
                                            style={{ overscrollBehavior: "contain" }}
                                        />
                                        <Button
                                            type="submit"
                                            size="icon"
                                            disabled={
                                                !input.trim() ||
                                                isLoading ||
                                                isDisabled
                                            }
                                            className="h-9 w-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shrink-0 border-0"
                                        >
                                            <Send className="w-4 h-4" />
                                        </Button>
                                    </div>
                                );

                                if (isDisabled) {
                                    return (
                                        <TooltipProvider delayDuration={200}>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="flex items-center space-x-2 w-full cursor-not-allowed">
                                                        {inputArea}
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent className="bg-neutral-950 border border-indigo-500/20 text-white text-xs px-3 py-1.5 rounded-lg shadow-2xl max-w-xs leading-relaxed">
                                                    To chat with the agent, configure a valid agent profile and API key in Settings (gear icon above).
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    );
                                }

                                return inputArea;
                            })()}
                        </form>
                    </div>
                )}

                {/* Resize handles */}
                <div className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize z-50 hover:bg-indigo-500/30 transition-colors duration-150" onMouseDown={(e) => handleResizeMouseDown(e, "l")} />
                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize z-50 hover:bg-indigo-500/30 transition-colors duration-150" onMouseDown={(e) => handleResizeMouseDown(e, "r")} />
                <div className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize z-50 hover:bg-indigo-500/30 transition-colors duration-150" onMouseDown={(e) => handleResizeMouseDown(e, "t")} />
                <div className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize z-50 hover:bg-indigo-500/30 transition-colors duration-150" onMouseDown={(e) => handleResizeMouseDown(e, "b")} />
                <div className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-50 hover:bg-indigo-500/50 transition-colors duration-150 rounded-tl-xl" onMouseDown={(e) => handleResizeMouseDown(e, "tl")} />
                <div className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-50 hover:bg-indigo-500/50 transition-colors duration-150 rounded-tr-xl" onMouseDown={(e) => handleResizeMouseDown(e, "tr")} />
                <div className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-50 hover:bg-indigo-500/50 transition-colors duration-150 rounded-bl-xl" onMouseDown={(e) => handleResizeMouseDown(e, "bl")} />
                <div className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-50 hover:bg-indigo-500/50 transition-colors duration-150 rounded-br-xl" onMouseDown={(e) => handleResizeMouseDown(e, "br")} />
            </div>

            {/* Warning Confirmation Dialog for Reverting prompt */}
            <Dialog open={revertTargetId !== null} onOpenChange={(open) => { if (!open) setRevertTargetId(null); }}>
                <DialogContent className="bg-neutral-950 border border-white/10 text-white max-w-sm rounded-xl">
                    <DialogHeader className="space-y-2">
                        <div className="flex items-center space-x-2 text-amber-500 font-semibold text-sm">
                            <AlertCircle className="w-5 h-5 shrink-0 animate-pulse" />
                            <DialogTitle>Revert & Edit Prompt</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs text-white/60 leading-relaxed pt-1">
                            Are you sure you want to pull this prompt back to the chat input box?
                            This message and all succeeding responses/actions will be <span className="text-red-400 font-semibold">permanently deleted</span> from history and cannot be recovered.
                        </DialogDescription>
                    </DialogHeader>
                    {hasCheckpoint && (
                        <div className="flex items-start space-x-2.5 p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 my-2">
                            <Checkbox
                                id="revert-modifications"
                                checked={shouldRevertModification}
                                onCheckedChange={(checked) => setShouldRevertModification(checked === true)}
                                className="mt-0.5 border-indigo-400/50 data-[state=checked]:border-indigo-500 data-[state=checked]:bg-indigo-600 text-white shrink-0 cursor-pointer"
                            />
                            <div className="grid gap-1">
                                <label
                                    htmlFor="revert-modifications"
                                    className="text-xs font-semibold text-indigo-200 cursor-pointer select-none leading-none"
                                >
                                    Revert workspace modifications
                                </label>
                                <p className="text-[10px] text-indigo-300/60 leading-normal select-none text-left">
                                    Restore entire app state to the exact moment this message was sent, overwriting all subsequent modifications.
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="flex space-x-2 pt-2 justify-end">
                        <Button
                            variant="ghost"
                            onClick={() => setRevertTargetId(null)}
                            className="text-xs border border-white/10 text-white hover:bg-white/5 hover:text-white h-8 px-3 rounded-lg"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmRevert}
                            className="text-xs bg-amber-600 hover:bg-amber-500 text-white h-8 px-3 rounded-lg font-semibold border border-amber-500/20"
                        >
                            Confirm Revert
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
