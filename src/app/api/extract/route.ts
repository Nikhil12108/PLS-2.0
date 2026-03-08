import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
});

export const maxDuration = 300;

interface OpenAIRawResponse {
    output_text?: string;
}

export async function POST(request: NextRequest) {
    try {
        const { batchPrompts, vectorStoreId, contextData } = await request.json();

        if (!batchPrompts || typeof batchPrompts !== 'object' || !vectorStoreId) {
            return NextResponse.json({ error: 'Missing batchPrompts or vectorStoreId' }, { status: 400 });
        }

        const developerMessage = `
    <system_role>
    You are the "ClearHealth Clinical Translator and Expert medical communicator," specialized in Plain Language Summaries (PLS). 
    Your function is to parse clinical trial data and translate it into simple, Grade 6-8 readability level text for patients.
    </system_role>
    <core_directives>
    1. Answer ONLY using information from the uploaded files via your file_search tool. Do not use external knowledge.
    2. Your ENTIRE response must be a single, valid, raw JSON object.
       - NO Markdown fences (e.g., \`\`\`json).
       - NO text before or after the JSON.
    3. Use the <previous_extractions_context> below to understand foundational study facts (e.g., Title, NCT Number, Drug Name). This will improve your accuracy on the current task keys.
    4. For EVERY task key, you MUST wrap your extracted data in a specific metadata structure that includes: "data" (the actual JSON), "confidence_score" (0-100), "source_quote", "source_file", "source_page", and "source_section".
    </core_directives>
    
    <previous_extractions_context>
    ${contextData ? JSON.stringify(contextData, null, 2) : "No previous context compiled yet."}
    </previous_extractions_context>
    `;

        const keys = Object.keys(batchPrompts);
        const combinedPrompt = `Please perform the following list of separate data extraction tasks from the provided document.
You MUST return a SINGLE, valid JSON object where the top-level keys are the exact TASK KEYs provided below.

${keys.map(k => `==============================\nTASK KEY: "${k}"\nORIGINAL INSTRUCTIONS:\n${batchPrompts[k]}\n\n**CRITICAL OVERRIDE INSTRUCTION FOR THIS TASK:**\nInstead of directly returning the "FINAL JSON OUTPUT" requested in the instructions above, you MUST wrap it inside a "data" property, and include metadata properties alongside it.\nYour output object for "${k}" MUST EXACTLY match this schema:\n{\n  "data": { ...<the exact FINAL JSON OUTPUT requested by the original instructions>... },\n  "confidence_score": 95,\n  "source_quote": "Exact sentence(s) from the source document that proves this data.",\n  "source_file": "document1.pdf",\n  "source_page": "Page 5",\n  "source_section": "2.1 Background"\n}`).join('\n\n')}
`;

        // Polling / Retry logic for OpenAI Responses API
        let raw = "";
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await (openai as unknown as { responses: { create: (opts: Record<string, unknown>) => Promise<OpenAIRawResponse> } }).responses.create({
                    model: "gpt-5.4",
                    instructions: developerMessage,
                    input: combinedPrompt,
                    reasoning: { effort: "low" },
                    tools: [
                        {
                            type: "file_search",
                            vector_store_ids: [vectorStoreId],
                        },
                    ],
                    // GPT 5.4 response formatting via "text" obj
                    text: {
                        // verbosity: "medium"
                    }
                });

                raw = response.output_text || "";
                if (raw) break;
            } catch (err) {
                console.warn(`Extraction attempt ${attempt + 1} failed:`, err);
                if (attempt === 2) throw err;
                await new Promise(res => setTimeout(res, 1000));
            }
        }

        if (!raw) {
            throw new Error("Empty response from AI");
        }

        // Strip markdown backticks if the model accidentally includes them
        raw = raw.replace(/^```json/mi, '').replace(/```$/m, '').trim();

        console.log("OPENAI EXTRACTION RAW RESPONSE:", raw);

        return NextResponse.json({ raw });

    } catch (error: unknown) {
        console.error("Extraction error:", error);
        return NextResponse.json({ error: "Extraction failed", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
