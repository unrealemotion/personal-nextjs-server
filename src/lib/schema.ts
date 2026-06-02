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
  body: z.string().optional(),
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
};
