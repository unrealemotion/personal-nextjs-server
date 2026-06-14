import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { type Message, type AgentProfile, type ToolDefinition, type CheckpointProvider } from "./types";
import { callLLM } from "./agent-executor";

interface AgentContextType {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    view: "chat" | "settings";
    setView: (view: "chat" | "settings") => void;
    messages: Message[];
    setMessages: (messages: Message[]) => void;
    revertTargetId: string | null;
    setRevertTargetId: (id: string | null) => void;
    hasCheckpoint: boolean;
    shouldRevertModification: boolean;
    setShouldRevertModification: (revert: boolean) => void;
    input: string;
    setInput: (input: string) => void;
    messageQueue: string[];
    setMessageQueue: (queue: string[]) => void;
    isLoading: boolean;
    activeToolName: string | null;
    
    // Settings staging state
    tempProfiles: AgentProfile[];
    setTempProfiles: (profiles: AgentProfile[]) => void;
    tempActiveProfileId: string | null;
    setTempActiveProfileId: (id: string | null) => void;
    editingProfileId: string | null;
    setEditingProfileId: (id: string | null) => void;
    isDirty: boolean;
    
    // Active profiles (synced or defaults)
    activeProfile: AgentProfile | undefined;
    agentProfiles: AgentProfile[];
    
    // Action triggers
    saveConfig: (newProfiles: AgentProfile[], activeId: string) => void;
    handleSend: (text?: string) => Promise<void>;
    handleStop: () => void;
    handleClearChat: () => Promise<void>;
    handleRevert: (messageId: string) => Promise<void>;
    confirmRevert: () => Promise<void>;
    handleRemoveQueuedMessage: (idx: number) => void;
    handleMergeQueuedMessage: (idx: number) => void;
    
    // Panel sizing and position
    agentPanelPosition: { x: number; y: number } | null;
    setAgentPanelPosition: (pos: { x: number; y: number } | null) => void;
    agentPanelSize: { width: number; height: number };
    setAgentPanelSize: (size: { width: number; height: number }) => void;
    tools: ToolDefinition[];
    changeActiveProfileId: (id: string) => void;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export interface AgentProviderProps {
    children: React.ReactNode;
    tools: ToolDefinition[];
    initialProfiles?: AgentProfile[];
    initialActiveProfileId?: string | null;
    welcomeMessage?: string;
    systemPrompt?: string;
    
    onSaveProfiles?: (profiles: AgentProfile[], activeProfileId: string) => void;
    onStateChange?: () => void;
    checkpointProvider?: CheckpointProvider;
    fetchProxy?: (url: string, options: any) => Promise<{ success: boolean; status: number; body: string; error?: string }>;
    
    initialPanelPosition?: { x: number; y: number } | null;
    initialPanelSize?: { width: number; height: number };
    onPanelPositionChange?: (pos: { x: number; y: number } | null) => void;
    onPanelSizeChange?: (size: { width: number; height: number }) => void;
    
    toast?: {
        success: (msg: string) => void;
        error: (msg: string) => void;
        info: (msg: string) => void;
        warning: (msg: string) => void;
    };

    onActiveProfileIdChange?: (id: string) => void;
    currentView?: "bulk" | "api_client";
}

const DEFAULT_WELCOME = "👋 Hello! I am your AI agent. How can I help you today?";
const DEFAULT_SYSTEM = "You are a helpful assistant.";

export const AgentProvider: React.FC<AgentProviderProps> = ({
    children,
    tools,
    initialProfiles = [],
    initialActiveProfileId = null,
    welcomeMessage = DEFAULT_WELCOME,
    systemPrompt = DEFAULT_SYSTEM,
    onSaveProfiles,
    onStateChange,
    checkpointProvider,
    fetchProxy,
    initialPanelPosition = null,
    initialPanelSize = { width: 450, height: 650 },
    onPanelPositionChange,
    onPanelSizeChange,
    toast,
    onActiveProfileIdChange,
    currentView
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<"chat" | "settings">("chat");
    const [messages, setMessages] = useState<Message[]>([]);
    const [revertTargetId, setRevertTargetId] = useState<string | null>(null);
    const [hasCheckpoint, setHasCheckpoint] = useState(false);
    const [revertCheckpointData, setRevertCheckpointData] = useState<any | null>(null);
    const [shouldRevertModification, setShouldRevertModification] = useState(true);
    const [input, setInput] = useState("");
    const [messageQueue, setMessageQueue] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeToolName, setActiveToolName] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    const isClearingChatRef = useRef(false);

    // Profile settings management
    const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>(initialProfiles);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(initialActiveProfileId);

    // Temp settings staging state
    const [tempProfiles, setTempProfiles] = useState<AgentProfile[]>([]);
    const [tempActiveProfileId, setTempActiveProfileId] = useState<string | null>(null);
    const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    // Panel position & size state
    const [agentPanelPosition, setLocalPanelPosition] = useState<{ x: number; y: number } | null>(initialPanelPosition);
    const [agentPanelSize, setLocalPanelSize] = useState<{ width: number; height: number }>(initialPanelSize);

    // Refs to avoid closure-locking during async loops
    const currentViewRef = useRef(currentView);
    const systemPromptRef = useRef(systemPrompt);

    useEffect(() => {
        currentViewRef.current = currentView;
    }, [currentView]);

    useEffect(() => {
        systemPromptRef.current = systemPrompt;
    }, [systemPrompt]);

    const setAgentPanelPosition = (pos: { x: number; y: number } | null) => {
        setLocalPanelPosition(pos);
        if (onPanelPositionChange) onPanelPositionChange(pos);
    };

    const setAgentPanelSize = (size: { width: number; height: number }) => {
        setLocalPanelSize(size);
        if (onPanelSizeChange) onPanelSizeChange(size);
    };

    // Update internal state if initial props change
    useEffect(() => {
        setAgentProfiles(initialProfiles);
    }, [initialProfiles]);

    useEffect(() => {
        setActiveProfileId(initialActiveProfileId);
    }, [initialActiveProfileId]);

    const activeProfile = agentProfiles.find(p => p.id === activeProfileId) || agentProfiles[0];

    // Sync store configurations to temp local state when in settings view
    useEffect(() => {
        if (view === "settings") {
            setTempProfiles(agentProfiles);
            setTempActiveProfileId(activeProfileId);
            setEditingProfileId(activeProfileId);
            setIsDirty(false);
        }
    }, [view, agentProfiles, activeProfileId]);

    // Sync active selection when in chat view
    useEffect(() => {
        if (view === "chat") {
            setTempActiveProfileId(activeProfileId);
        }
    }, [view, activeProfileId]);

    // Debounced check for unsaved configurations edits
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsDirty(!areProfilesEqual(tempProfiles, agentProfiles));
        }, 150);
        return () => clearTimeout(timer);
    }, [tempProfiles, agentProfiles]);

    // Initialize welcome message
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([
                {
                    id: "welcome",
                    role: "assistant",
                    content: welcomeMessage
                }
            ]);
        }
    }, [welcomeMessage, messages.length]);

    const showToast = useCallback((type: "success" | "error" | "info" | "warning", msg: string) => {
        if (toast && toast[type]) {
            toast[type](msg);
        } else {
            console.log(`[Agent Toast - ${type}]`, msg);
        }
    }, [toast]);

    const saveConfig = (newProfiles: AgentProfile[], activeId: string) => {
        setAgentProfiles(newProfiles);
        setActiveProfileId(activeId);
        if (onSaveProfiles) {
            onSaveProfiles(newProfiles, activeId);
        }
        const savedProfile = newProfiles.find(p => p.id === activeId);
        if (savedProfile) {
            showToast("success", `Configuration saved for profile: ${savedProfile.name}`);
        } else {
            showToast("success", "Agent configuration saved successfully");
        }
    };

    const changeActiveProfileId = (id: string) => {
        setActiveProfileId(id);
        setTempActiveProfileId(id);
        if (onActiveProfileIdChange) {
            onActiveProfileIdChange(id);
        }
    };

    // Main execution wrapper for tool calls
    const runToolHandler = useCallback(async (name: string, args: any): Promise<any> => {
        setActiveToolName(name);
        try {
            // Find tool configuration
            const tool = tools.find(t => t.function.name === name);
            if (!tool) {
                return { error: `Tool '${name}' is not registered.` };
            }

            // Check profile permissions
            if (activeProfile?.allowedTools && !activeProfile.allowedTools.includes(name)) {
                return { error: `Tool '${name}' is disabled in the active agent profile's permissions.` };
            }

            // Check view permissions
            const activeView = currentViewRef.current;
            if (activeView) {
                const isTabRestricted = 
                    (tool.category === "Bulk Runner" && activeView !== "bulk") ||
                    (tool.category === "API Client" && activeView !== "api_client");
                if (isTabRestricted) {
                    const activeTabName = activeView === "api_client" ? "API Client" : "Bulk Runner";
                    return { error: `Tool '${name}' is not permitted in the current '${activeTabName}' tab. Please instruct the user to switch tabs if they need you to perform this action.` };
                }
            }

            // Execute the custom handler supplied by parent
            const result = await tool.handler(args);
            
            // Notify parent that the application state might have changed
            if (onStateChange) {
                onStateChange();
            }

            return result;
        } catch (e: any) {
            return { error: `Execution error in tool '${name}': ${e.message || String(e)}` };
        } finally {
            setActiveToolName(null);
        }
    }, [tools, activeProfile, onStateChange]);

    const handleQueueMessage = useCallback((text: string) => {
        if (!text.trim()) return;
        setMessageQueue(prev => [...prev, text]);
    }, []);

    const handleRemoveQueuedMessage = (index: number) => {
        setMessageQueue(prev => prev.filter((_, idx) => idx !== index));
        showToast("success", "Prompt removed from queue");
    };

    const handleMergeQueuedMessage = (index: number) => {
        if (index <= 0) return;
        setMessageQueue(prev => {
            if (prev.length <= index) return prev;
            const nextToSend = prev[0];
            const merged = `${nextToSend}\n${prev[index]}`;
            const newQueue = [...prev];
            newQueue[0] = merged;
            newQueue.splice(index, 1);
            return newQueue;
        });
        showToast("success", "Prompt merged with 'Next to send'");
    };

    const handleSend = useCallback(async (userText: string = input) => {
        if (!userText.trim()) return;

        if (isLoading) {
            handleQueueMessage(userText);
            setInput("");
            return;
        }

        if (!validateActiveProfile(activeProfile, showToast, setView)) {
            return;
        }

        let preStateSnapshot: any = null;
        if (checkpointProvider && checkpointProvider.getCheckpointState) {
            preStateSnapshot = checkpointProvider.getCheckpointState();
        }

        const newUserMessage: Message = {
            id: `msg_${Date.now()}`,
            role: "user",
            content: userText
        };

        const updatedHistory = [...messages, newUserMessage];
        setMessages(updatedHistory);
        setInput("");
        setIsLoading(true);

        const activeHistory = [...updatedHistory];
        let maxIterations = activeProfile!.maxExecutionLimit !== undefined ? activeProfile!.maxExecutionLimit : 6;
        const isInfinite = maxIterations === 0;

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        try {
            while (isInfinite || maxIterations > 0) {
                if (signal.aborted) {
                    throw new DOMException("The user aborted a request.", "AbortError");
                }

                // Filter tools to only those registered and allowed in profile
                const allowedTools = tools.filter(t => 
                    !activeProfile!.allowedTools || activeProfile!.allowedTools.includes(t.function.name)
                );

                const response = await callLLM(
                    activeHistory,
                    activeProfile!,
                    systemPromptRef.current || DEFAULT_SYSTEM,
                    allowedTools,
                    fetchProxy,
                    signal
                );

                if (response.toolCalls && response.toolCalls.length > 0) {
                    const assistantMessage: Message = {
                        id: `msg_${Date.now()}_assistant`,
                        role: "assistant",
                        content: response.text || "Executing tools...",
                        tool_calls: response.toolCalls,
                        geminiParts: response.geminiParts,
                        reasoning: response.reasoning
                    };

                    activeHistory.push(assistantMessage);
                    setMessages([...activeHistory]);

                    for (const tc of response.toolCalls) {
                        await executeSingleTool(tc, signal, runToolHandler, activeHistory, setMessages);
                    }

                    if (!isInfinite) {
                        maxIterations--;
                    }
                } else {
                    const assistantMessage: Message = {
                        id: `msg_${Date.now()}_assistant`,
                        role: "assistant",
                        content: response.text,
                        geminiParts: response.geminiParts,
                        reasoning: response.reasoning
                    };
                    activeHistory.push(assistantMessage);
                    setMessages([...activeHistory]);
                    break;
                }
            }

            if (!isInfinite && maxIterations === 0) {
                showToast("warning", "Agent loop hit maximum function execution limit.");
            }
        } catch (e: any) {
            console.error(e);
            let errMsg = e.message || String(e);

            if (e.name === "AbortError" || errMsg.includes("aborted") || errMsg.includes("AbortError")) {
                if (!isClearingChatRef.current) {
                    activeHistory.push({
                        id: `msg_${Date.now()}_error`,
                        role: "assistant",
                        content: "⚠️ Execution stopped by user."
                    });
                    setMessages([...activeHistory]);
                }
            } else {
                if (errMsg === "Failed to fetch") {
                    errMsg = "Failed to fetch. This is usually caused by:\n" +
                             "1. Network disconnection or incorrect API Endpoint URL.\n" +
                             "2. CORS policy restrictions. Note: OpenAI's official API endpoint blocks browser-direct calls due to CORS rules to prevent exposing API keys. If you are using OpenAI/Custom, please ensure you use a proxy, local endpoint with CORS enabled (like Ollama), or verify that the Surge Chrome Extension is installed and active to bypass CORS.";
                }
                activeHistory.push({
                    id: `msg_${Date.now()}_error`,
                    role: "assistant",
                    content: `⚠️ Error executing agent request: ${errMsg}`
                });
                setMessages([...activeHistory]);
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;

            if (isClearingChatRef.current) {
                isClearingChatRef.current = false;
                return;
            }

            // Save checkpoint if state was modified during execution
            if (checkpointProvider) {
                const currentState = checkpointProvider.getCheckpointState ? checkpointProvider.getCheckpointState() : null;
                if (checkpointProvider.hasStateDiscrepancy(currentState, preStateSnapshot)) {
                    checkpointProvider.saveCheckpoint(newUserMessage.id, preStateSnapshot).catch(err => {
                        console.error("Failed to save checkpoint:", err);
                    });
                }
            }
        }
    }, [input, isLoading, activeProfile, messages, tools, checkpointProvider, fetchProxy, runToolHandler, showToast, setView, setMessages, setInput, handleQueueMessage]);



    // Process next message in queue when current loading finishes
    useEffect(() => {
        if (!isLoading && messageQueue.length > 0) {
            const nextPrompt = messageQueue[0];
            setMessageQueue(prev => prev.slice(1));
            handleSend(nextPrompt);
        }
    }, [isLoading, messageQueue, handleSend]);

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            showToast("info", "Agent execution stopped.");
        }
    };

    const handleClearChat = async () => {
        if (abortControllerRef.current) {
            isClearingChatRef.current = true;
            abortControllerRef.current.abort();
        }

        setMessageQueue([]);

        const userMessageIds = messages.filter(m => m.role === "user").map(m => m.id);
        setMessages([
            {
                id: "welcome",
                role: "assistant",
                content: welcomeMessage
            }
        ]);
        showToast("info", "Chat history cleared");

        if (checkpointProvider) {
            Promise.all(userMessageIds.map(id => checkpointProvider.deleteCheckpoint(id)))
                .catch(err => console.error("Failed to clean up checkpoints on chat clear:", err));
        }
    };

    const handleRevert = async (messageId: string) => {
        setRevertTargetId(messageId);
        setShouldRevertModification(true);
        if (checkpointProvider) {
            try {
                const checkpoint = await checkpointProvider.loadCheckpoint(messageId);
                if (checkpoint) {
                    setRevertCheckpointData(checkpoint);
                    // Check if there is discrepancy from current state
                    // This uses parent-provided comparator
                    const hasDiscrepancy = checkpointProvider.hasStateDiscrepancy(null, checkpoint); // passing null lets comparator compare active state
                    setHasCheckpoint(hasDiscrepancy);
                } else {
                    setRevertCheckpointData(null);
                    setHasCheckpoint(false);
                }
            } catch (err) {
                console.error("Failed to load checkpoint", err);
                setRevertCheckpointData(null);
                setHasCheckpoint(false);
            }
        }
    };

    const confirmRevert = async () => {
        if (!revertTargetId) return;
        const targetIdx = messages.findIndex(m => m.id === revertTargetId);
        if (targetIdx !== -1) {
            const targetMessage = messages[targetIdx];

            // Revert workspace modifications if selected
            if (shouldRevertModification && revertCheckpointData && checkpointProvider) {
                // Trigger parent-level restore state
                if (checkpointProvider.revertWorkspaceState) {
                    await checkpointProvider.revertWorkspaceState(revertCheckpointData);
                }
                showToast("success", "Workspace state reverted to checkpoint");
            }

            const truncated = messages.slice(0, targetIdx);
            setMessages(truncated);
            setInput(prev => prev ? `${targetMessage.content}\n${prev}` : targetMessage.content);
            showToast("success", "Message loaded back into input field");

            const deletedMessages = messages.slice(targetIdx);
            if (checkpointProvider) {
                Promise.all(deletedMessages.filter(m => m.role === "user").map(m => checkpointProvider.deleteCheckpoint(m.id)))
                    .catch(err => console.error("Error deleting checkpoints during revert:", err));
            }
        }
        setRevertTargetId(null);
        setRevertCheckpointData(null);
        setHasCheckpoint(false);
    };

    return (
        <AgentContext.Provider
            value={{
                isOpen,
                setIsOpen,
                view,
                setView,
                messages,
                setMessages,
                revertTargetId,
                setRevertTargetId,
                hasCheckpoint,
                shouldRevertModification,
                setShouldRevertModification,
                input,
                setInput,
                messageQueue,
                setMessageQueue,
                isLoading,
                activeToolName,
                tempProfiles,
                setTempProfiles,
                tempActiveProfileId,
                setTempActiveProfileId,
                editingProfileId,
                setEditingProfileId,
                isDirty,
                activeProfile,
                agentProfiles,
                saveConfig,
                changeActiveProfileId,
                handleSend,
                handleStop,
                handleClearChat,
                handleRevert,
                confirmRevert,
                handleRemoveQueuedMessage,
                handleMergeQueuedMessage,
                agentPanelPosition,
                setAgentPanelPosition,
                agentPanelSize,
                setAgentPanelSize,
                tools
            }}
        >
            {children}
        </AgentContext.Provider>
    );
};

export const useAgentContext = () => {
    const context = useContext(AgentContext);
    if (!context) {
        throw new Error("useAgentContext must be used within an AgentProvider");
    }
    return context;
};

// Helper: Dirty validation function
function areProfilesEqual(a: AgentProfile[], b: AgentProfile[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const pa = a[i];
        const pb = b[i];
        const allowedA = pa.allowedTools || [];
        const allowedB = pb.allowedTools || [];
        const allowedEqual = allowedA.length === allowedB.length && allowedA.every(t => allowedB.includes(t));
        if (
            pa.id !== pb.id ||
            pa.name !== pb.name ||
            pa.provider !== pb.provider ||
            pa.apiKey !== pb.apiKey ||
            pa.endpoint !== pb.endpoint ||
            pa.model !== pb.model ||
            pa.enableJsonFallback !== pb.enableJsonFallback ||
            pa.bypassCorsWithExtension !== pb.bypassCorsWithExtension ||
            pa.maxExecutionLimit !== pb.maxExecutionLimit ||
            !allowedEqual
        ) {
            return false;
        }
    }
    return true;
}

// Helper: Validate active agent profile
function validateActiveProfile(
    activeProfile: AgentProfile | undefined,
    showToast: (type: "success" | "error" | "info" | "warning", msg: string) => void,
    setView: (view: "chat" | "settings") => void
): boolean {
    if (!activeProfile) {
        showToast("error", "No active agent profile found. Please configure settings.");
        setView("settings");
        return false;
    }

    const { apiKey, provider } = activeProfile;
    if (!apiKey && provider !== "custom") {
        showToast("error", "API Key is missing. Please set it up in Settings first!");
        setView("settings");
        return false;
    }

    return true;
}

// Helper: Execute a single tool call and update the message history
async function executeSingleTool(
    tc: any,
    signal: AbortSignal,
    runToolHandler: (name: string, args: any) => Promise<any>,
    activeHistory: Message[],
    setMessages: (messages: Message[]) => void
): Promise<void> {
    if (signal.aborted) {
        throw new DOMException("The user aborted a request.", "AbortError");
    }

    const toolArgs = JSON.parse(tc.function.arguments || "{}");
    const toolName = tc.function.name;

    const toolResult = await runToolHandler(toolName, toolArgs);

    if (signal.aborted) {
        throw new DOMException("The user aborted a request.", "AbortError");
    }

    const toolMsg: Message = {
        id: `tool_${Date.now()}_${tc.id}`,
        role: "tool",
        name: toolName,
        tool_call_id: tc.id,
        content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)
    };

    activeHistory.push(toolMsg);
    setMessages([...activeHistory]);
}
