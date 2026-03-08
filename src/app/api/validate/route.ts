import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
});

export const maxDuration = 300;

export async function POST(request: NextRequest) {
    try {
        const { keyName, extractedData, sourceQuote } = await request.json();

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

        let raw = "";
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                // @ts-ignore
                const response = await (openai as any).responses.create({
                    model: "gpt-5.4",
                    instructions: developerMessage,
                    input: userPrompt,
                    reasoning: { effort: "low" }
                });

                raw = response.output_text || "";
                if (raw) break;
            } catch (err) {
                console.warn(`Validation attempt ${attempt + 1} failed:`, err);
                if (attempt === 2) throw err;
                await new Promise(res => setTimeout(res, 1000));
            }
        }

        if (!raw) {
            throw new Error("Empty response from validation AI");
        }

        raw = raw.replace(/^```json/mi, '').replace(/```$/m, '').trim();

        let parsedValidatedData;
        try {
            parsedValidatedData = JSON.parse(raw);
        } catch (e) {
            console.warn("Validation AI returned invalid JSON, falling back to original data.");
            parsedValidatedData = extractedData;
        }

        return NextResponse.json({ validatedData: parsedValidatedData });

    } catch (error: any) {
        console.error("Validation error:", error);
        return NextResponse.json({ error: "Validation failed" }, { status: 500 });
    }
}
