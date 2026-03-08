import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
});

export const maxDuration = 300;

export async function POST(request: NextRequest) {
    try {
        const { rawJson, userInstructions, vectorStoreId } = await request.json();

        if (!rawJson) {
            return NextResponse.json({ error: 'Missing rawJson to refine' }, { status: 400 });
        }

        const KB_VECTOR_STORE_ID = process.env.KB_VECTOR_STORE_ID;

        if (!KB_VECTOR_STORE_ID) {
            console.error('KB_VECTOR_STORE_ID environment variable is not defined');
            return NextResponse.json({ error: 'Server configuration error: Vector Store ID missing' }, { status: 500 });
        }

        const REFINEMENT_SYSTEM_PROMPT = `<system_role>
You are the "Novartis Language Refinement Specialist," a medical writing editor 
specialized in Plain Language Summaries (PLS). Your ONLY job is to refine the 
WRITING STYLE and TERMINOLOGY in the provided JSON data using the provided 
knowledge base and STRICT terminology rules.
Do not provide any citations.
Do not provide any extra text before or after the JSON output.
Use the file_search tool to look up terms in the Novartis Knowledge Base.
</system_role>

<absolute_requirements>
**THE JSON OUTPUT MUST BE STRUCTURALLY IDENTICAL TO THE INPUT:**
- SAME keys (do not rename, add, or remove any keys)
- SAME nesting structure (do not change hierarchy)
- SAME data types (strings remain strings, numbers remain numbers, arrays remain arrays)
- SAME number of items in any arrays

**WHAT YOU CAN CHANGE:**
- Text/string values INSIDE the "data" property: Improve wording, replace jargon with knowledge base terms
- Writing style: Make it clearer, simpler, and readability level of 6th to 8th grade

**WHAT YOU MUST NEVER CHANGE:**
- Numbers (42 stays 42, not "about 40")
- Percentages (28% stays 28%, not "approximately 30%")
- Dates (any date format stays exactly the same)
- JSON keys (keep all keys exactly as they are)
- Boolean values
- Null values
- **METADATA FIELDS (CRITICAL - COPY EXACTLY AS-IS):**
  • "confidence_score" - number, do not change
  • "source_quote" - string, do not modify
  • "source_file" - string, do not modify
  • "source_page" - string, do not modify
  • "source_section" - string, do not modify
  These metadata fields appear at the root level of each extraction object. COPY THEM EXACTLY to your output.

**TENSE PRESERVATION (CRITICAL):**
- If the input text uses FUTURE TENSE ("will be", "will receive", "is expected to"), the output MUST remain in future tense
- If the input text uses PAST TENSE ("was", "received", "experienced"), the output MUST remain in past tense
- If the input text uses PRESENT TENSE ("is", "receives", "takes"), the output MUST remain in present tense
- NEVER change the grammatical tense of any statement
</absolute_requirements>

<terminology_rules>
You MUST strictly adhere to the following terminology map. 
If a term in the left column appears in the input, replace it with the term in the right column.

| Term in source file | Always write in the output as |
| --- | --- |
| Study, clinical study, clinical trial | 'Clinical trial' (only in the simple title) OR 'Trial' (at all other instances) |
| Investigational drug, drug, test drug | Trial drug |
| Approved medicine, medicine | …drug approved for [disease indication] |
| Patients, subjects, participants (in this trial) | Participants |
| Patients (general context outside study) | People with [disease indication] |
| Efficacy | Effects |
| Safety | Safety |
| Efficacy and safety | Effects |
| Adverse events, treatment-emergent adverse events | Medical problems, also called adverse events |
| Serious adverse events, treatment-emergent serious adverse events | Serious medical problems |
| Number of participants/patients/subjects with … | How many participants with … |
| Rate of participants/patients/subjects with … | How many participants with … |
| Male | Men |
| Female | Women |
| Phase 1 or Phase I | 1 (in title phase number), Part 1 (elsewhere) |
| Phase 2 or Phase II | 2 (in title phase number), Part 2 (elsewhere) |
| Scientists, investigators, and sponsor research team | Researchers |
| Investigator, doctor, site doctor | Trial doctor |
</terminology_rules>


<smart_semantic_matching>
**UNDERSTANDING QUESTION TYPES:**
When searching the knowledge base, you must understand the SEMANTIC MEANING of the question/answer, not just look for exact word matches:

1. **SYNONYMS & RELATED CONCEPTS**: If the input mentions "efficacy", also search for "effectiveness", "how well it worked", "treatment effect"
2. **QUESTION CATEGORIES**: Understand what TYPE of information is being discussed:
   - Safety information → search for "adverse events", "side effects", "medical problems"
   - Treatment details → search for "dosing", "how to take", "administration"
   - Results → search for "outcomes", "findings", "what happened"
   - Demographics → search for "participants", "who was in the study"

3. **CONTEXT-AWARE MATCHING**: Even if the exact term is not in the knowledge base:
   - Identify the CATEGORY of information (e.g., this is about "side effects")
   - Search for standard phrasing for that CATEGORY
   - Apply consistent terminology patterns (e.g., always use "medical problems" instead of "adverse events")

4. **INFERENCE FROM PATTERNS**: If you find how similar concepts are phrased in the knowledge base, apply the same pattern to related concepts not explicitly listed
</smart_semantic_matching>

<refinement_rules>
1. Use file_search to look up medical terms and standard wording in the Knowledge Base
2. When you find a matching term OR a semantically similar term, use the Knowledge Base phrasing pattern
3. For terms NOT in the Knowledge Base, simplify to plain language using consistent patterns
4. Keep sentences short and direct
5. Use active voice
6. Replace medical jargon with patient-friendly terms
7. PRESERVE the original tense of all statements
8. **APPLY THE TERMINOLOGY RULES AND STANDARD WORDING STRICTLY.**
</refinement_rules>

<output_format>
Your ENTIRE response must be a single, valid, raw JSON object.
- NO markdown fences (\`\`\`json)
- NO text before or after the JSON
- The JSON structure must match the input exactly
</output_format>`;

        const instructionsText = userInstructions
            ? `A user has provided the following extra instructions: '${userInstructions}'`
            : ``;

        const userPrompt = `Please refine the language and terminology in the following JSON data.
Use file_search to look up terms in the Novartis Knowledge Base.
Remember: ONLY refine the language/terms. DO NOT change any factual data (numbers, dates, results).
dont not change wording of full title keep it as it is recieved. out answers will go direcly inside the output document so dont add extra information in the output.
the json recieved by you is the answers needed your task is to just refine the language/terms.
Keep the JSON structure exactly the same.
if this is teh case: "X, also known as 'no Generic Name available, then dont write 'no Generic Name available'just skip this part and move ahead.
${instructionsText}
// 
JSON to refine:
${rawJson}`;

        let refinedJson = "";

        try {
            // @ts-ignore
            const response = await (openai as any).responses.create({
                model: "gpt-5.4",
                instructions: REFINEMENT_SYSTEM_PROMPT,
                input: userPrompt,
                text: { format: { type: "json_object" } },
                tools: [{
                    type: "file_search",
                    vector_store_ids: [KB_VECTOR_STORE_ID]
                }],
            });

            // Extract text from the new responses.create payload structure
            if (response.output_text) {
                refinedJson = response.output_text;
            } else if (response.output && Array.isArray(response.output)) {
                for (const part of response.output) {
                    if (part.content && Array.isArray(part.content)) {
                        for (const item of part.content) {
                            if (item.text) {
                                refinedJson = item.text.trim();
                                break;
                            }
                        }
                    }
                    if (refinedJson) break;
                }
            } else if (response.choices?.[0]?.message?.content) {
                refinedJson = response.choices[0].message.content;
            }

            if (!refinedJson) {
                throw new Error("Empty response from AI refinement");
            }

            // Clean up any rogue markdown formatting returned by AI
            refinedJson = refinedJson.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();

            console.log("REFINE API RETURNING:", refinedJson.substring(0, 500) + "...");

            return NextResponse.json({ refinedJson });

        } catch (openaiError: any) {
            console.error("OpenAI Refinement API Error:", openaiError);
            throw openaiError;
        }

    } catch (error: any) {
        console.error("Refinement error:", error);
        return NextResponse.json({ error: "Refinement failed", details: error.message }, { status: 500 });
    }
}
