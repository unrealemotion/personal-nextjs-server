import { type RequestTemplate, type StepResult } from "./schema";
import { executeStep, populateExecutionContext, createCancelledOrSkippedStep } from "./executor-utils";

export async function simulateRowExecutionChain(
    row: Record<string, any>,
    templates: RequestTemplate[],
    maxRetries: number = 0,
    retryStatusCodes: string = "",
    stopOnFailure: boolean = false,
    abortSignal?: AbortSignal
): Promise<StepResult[]> {
    const steps: StepResult[] = [];
    const executionContext = { ...row };
    let chainFailed = false;

    for (const tmpl of templates) {
        if (abortSignal?.aborted) {
            steps.push(createCancelledOrSkippedStep(tmpl.id, tmpl.name, "Cancelled"));
            continue;
        }

        if (chainFailed && stopOnFailure) {
            steps.push(createCancelledOrSkippedStep(tmpl.id, tmpl.name, "Skipped (Previous Step Failed)"));
            continue;
        }

        const stepResult = await executeStep(tmpl, executionContext, maxRetries, retryStatusCodes, abortSignal);
        steps.push(stepResult);

        if (stepResult.error) {
            chainFailed = true;
        }

        // Populate executionContext with step outputs
        const idx = steps.length;
        populateExecutionContext(tmpl, stepResult, idx, executionContext);
    }

    return steps;
}
