import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { withRetry } from '@/lib/retry';
import { AI_MODEL } from '@/lib/constants';
import { getUserIdentity } from '@/lib/auth';
import { auditLog } from '@/lib/audit-logger';
import type { OpenAIResponsePayload, ValidateRequest } from '@/types';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
    try {
        const userId = getUserIdentity(request);
        const body: ValidateRequest = await request.json();
        const { keyName, extractedData, sourceQuote } = body;

        auditLog({
            request, action: 'DATA_VALIDATE',
            resource: { type: 'API', path: '/api/validate' },
            status: { code: 200, result: 'SUCCESS' },
            details: { keyName }
        });

        // Only validate specific complex tables
        if (!keyName.includes('table')) {
            return NextResponse.json({ validatedData: extractedData });
        }

        const developerMessage = `
<system_role>
You are an expert Clinical Data Auditor (Red Team).
Your job is to independently verify a complex data table extracted by an AI against its source text.
</system_role>

<critical_checks>
1. For every "n of N" value, ensure 'n' is logically less than or equal to 'N'.
2. Re-calculate every percentage (n / N * 100). Ensure standard rounding to 0 decimal places.
3. Ensure the extracted table accurately reflects the facts in the provided source text.
</critical_checks>

<output_rules>
If you find an error, CORRECT IT in your response. If the data is correct, return the exact same data structure.
You MUST return ONLY valid JSON matching the exact structure of the input data, with NO markdown formatting, text, or explanations.
</output_rules>
`;

        const userPrompt = `
SOURCE TEXT (Use this as ground truth):
${sourceQuote || "No direct quote available, evaluate internal math logic (e.g., percentages)."}

DATA TO AUDIT (JSON):
${JSON.stringify(extractedData)}
`;

        const raw = await withRetry(async () => {
            const response = await (openai as unknown as { responses: { create: (opts: Record<string, unknown>) => Promise<OpenAIResponsePayload> } }).responses.create({
                model: AI_MODEL,
                instructions: developerMessage,
                input: userPrompt,
                reasoning: { effort: "low" }
            });

            const text = response.output_text || "";
            if (!text) throw new Error("Empty response from validation AI");
            return text;
        }, { label: 'Validation Agent' });

        const cleaned = raw.replace(/^```json/mi, '').replace(/```$/m, '').trim();

        let parsedValidatedData;
        try {
            parsedValidatedData = JSON.parse(cleaned);
        } catch {
            console.warn("[validate] AI returned invalid JSON, falling back to original data");
            parsedValidatedData = extractedData;
        }

        return NextResponse.json({ validatedData: parsedValidatedData });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[validate] Error:", msg);
        auditLog({
            request, action: 'SYSTEM_ERROR',
            resource: { type: 'API', path: '/api/validate' },
            status: { code: 500, result: 'FAILURE' },
            details: { error: msg }
        });
        return NextResponse.json({ error: "Validation failed" }, { status: 500 });
    }
}
