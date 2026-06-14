export interface Message {
    id: string;
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: any[];
    geminiParts?: any[];
    reasoning?: string;
}

export interface AgentProfile {
    id: string;
    name: string;
    provider: "gemini" | "openai" | "custom";
    apiKey: string;
    endpoint: string;
    model: string;
    enableJsonFallback?: boolean;
    bypassCorsWithExtension?: boolean;
    maxExecutionLimit?: number;
    allowedTools?: string[]; // list of allowed tool names for this profile
}

export interface ToolDefinition {
    function: {
        name: string;
        description: string;
        parameters: any; // JSON schema structure
    };
    handler: (args: any) => Promise<any> | any;
    displayName: string;
    category?: string; // e.g. "Bulk Runner", "API Client"
}

export interface CheckpointProvider {
    getCheckpointState?: () => any;
    saveCheckpoint: (messageId: string, stateSnapshot: any) => Promise<void>;
    loadCheckpoint: (messageId: string) => Promise<any>;
    deleteCheckpoint: (messageId: string) => Promise<void>;
    hasStateDiscrepancy: (currentState: any, checkpointState: any) => boolean;
    revertWorkspaceState?: (checkpointState: any) => Promise<void> | void;
}

