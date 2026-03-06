import { z } from "zod";

export const requestTemplateSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
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

export type ExecutionResult = {
  rowId: number;
  status: "pending" | "success" | "error";
  statusCode: number;
  responseTimeMs: number;
  requestBody: Record<string, any> | string | null;
  responseBody: any;
  error?: string;
};
