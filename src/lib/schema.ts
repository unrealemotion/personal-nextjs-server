import { z } from "zod";

export const requestTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "QUERY"]),
  url: z.string().min(1, "URL is required"),
  headers: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ),
  params: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ).optional(),
  body: z.any().optional(),
});

export type RequestTemplate = z.infer<typeof requestTemplateSchema>;

export type StepResult = {
  stepId: string;
  stepName: string;
  statusCode: number;
  responseTimeMs: number;
  requestUrl?: string;
  requestMethod?: string;
  requestHeaders?: Record<string, string>;
  requestParams?: Record<string, string>;
  requestBody: Record<string, any> | string | null;
  responseBody: any;
  responseHeaders?: Record<string, string>;
  responseType?: string;
  responseRedirected?: boolean;
  responseStatusText?: string;
  ipAddress?: string | null;
  error?: string;
};

export type ExecutionResult = {
  rowId: number;
  iteration?: number;
  status: "pending" | "success" | "error";
  statusCode: number;
  responseTimeMs: number;
  requestUrl?: string;
  requestMethod?: string;
  requestHeaders?: Record<string, string>;
  requestParams?: Record<string, string>;
  requestBody: Record<string, any> | string | null;
  responseBody: any;
  responseHeaders?: Record<string, string>;
  responseType?: string;
  responseRedirected?: boolean;
  responseStatusText?: string;
  ipAddress?: string | null;
  steps: StepResult[];
  error?: string;
  timestamp?: string;
  active?: boolean;
};

export type ColumnMapping = {
  id?: string;
  name: string;
  source: "variable" | "request_body" | "request_param" | "response" | "status" | "error" | "response_time" | "modified";
  path: string;
  stepId?: string;
  visible?: boolean;
};

export type TableFilterConfig = {
  searchQuery: string;
  isRegex: boolean;
  columnFilters: Record<string, string[]>;
  sortBy: string | null;
  sortOrder: "asc" | "desc" | null;
};

// --- API Client Schemas ---

export const envVariableSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
  type: z.enum(["default", "secret"]).optional(),
});
export type EnvVariable = z.infer<typeof envVariableSchema>;

export const environmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  variables: z.array(envVariableSchema),
});
export type Environment = z.infer<typeof environmentSchema>;

export const keyValuePairSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
});
export type KeyValuePair = z.infer<typeof keyValuePairSchema>;

export const apiRequestSchema = z.object({
  id: z.string(),
  name: z.string(),
  method: z.string(),
  url: z.string(),
  params: z.array(keyValuePairSchema).optional(),
  headers: z.array(keyValuePairSchema).optional(),
  body: z.object({
    mode: z.enum(["none", "raw", "formdata", "urlencoded", "binary", "graphql"]),
    raw: z.string().optional(),
    rawLanguage: z.string().optional(),
    binary: z.string().optional(),
    graphql: z.object({
      query: z.string(),
      variables: z.string(),
    }).optional(),
    formdata: z.array(z.object({
      key: z.string(),
      value: z.string(),
      enabled: z.boolean().optional(),
      type: z.enum(["text", "file"]).optional(),
    })).optional(),
    urlencoded: z.array(keyValuePairSchema).optional(),
  }).optional(),
  preRequestScript: z.string().optional(),
  testScript: z.string().optional(),
});
export type ApiRequest = z.infer<typeof apiRequestSchema>;

export const apiFolderSchema: z.ZodType<any> = z.lazy(() => z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(z.union([apiFolderSchema, apiRequestSchema])),
}));
export type ApiFolder = {
  id: string;
  name: string;
  items: (ApiFolder | ApiRequest)[];
};

export const apiCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(z.union([apiFolderSchema, apiRequestSchema])),
  variables: z.array(keyValuePairSchema).optional(),
});
export type ApiCollection = z.infer<typeof apiCollectionSchema>;

export const testResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  error: z.string().optional(),
});
export type TestResult = z.infer<typeof testResultSchema>;

export const apiResponseSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  timeMs: z.number(),
  sizeBytes: z.number(),
  body: z.string(),
  headers: z.record(z.string(), z.string()),
  testResults: z.array(testResultSchema).optional(),
});
export type ApiResponse = z.infer<typeof apiResponseSchema>;

export const requestTabSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDirty: z.boolean(),
  request: apiRequestSchema,
  requestId: z.string().optional(),
  response: apiResponseSchema.nullable().optional(),
  loading: z.boolean(),
});
export type RequestTab = z.infer<typeof requestTabSchema>;

export interface AgentProfile {
  id: string;
  name: string;
  provider: "gemini" | "openai" | "custom";
  apiKey: string;
  endpoint: string;
  model: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
  geminiParts?: any[];
}



