const OpenAI = require('openai');
const openai = new OpenAI();
const fs = require('fs');

async function testBatch() {
    const extractedData = JSON.parse(fs.readFileSync('./src/utils/extracted_data.json', 'utf-8'));
    const prompts = extractedData.prompts.results_PLS;

    // Take first 5 prompts
    const keys = Object.keys(prompts).slice(0, 5);
    const batchPrompts = {};
    keys.forEach(k => batchPrompts[k] = prompts[k]);

    const combinedPrompt = `Please perform the following list of separate data extraction tasks from the provided document.
You MUST return a SINGLE, valid JSON object where the top-level keys are the exact TASK KEYs provided below, and their values are the JSON objects requested by each task's instructions. Do not include markdown formatting.

${keys.map(k => `==============================\nTASK KEY: "${k}"\nINSTRUCTIONS:\n${batchPrompts[k]}`).join('\n\n')}
`;

    const developerMessage = `
    <system_role>
    You are the "ClearHealth Clinical Translator and Expert medical communicator," specialized in Plain Language Summaries (PLS). 
    Your function is to parse clinical trial data and translate it into simple, Grade 6-8 readability level text for patients.
    </system_role>
    <core_directives>
    1. Answer ONLY using information from the uploaded files. Do not use external knowledge.
    2. Your ENTIRE response must be a single, valid, raw JSON object.
    </core_directives>
    `;

    console.log("Sending batch request for keys:", keys);

    // Notice: we don't have a file attached right now, so we will just see if it hallucinates the structure correctly
    const response = await openai.chat.completions.create({
        model: "gpt-4o", // Just for quick structure testing since gpt-5.4 isn't available in standard SDK chat completions sometimes, let's use 4o
        messages: [
            { role: "system", content: developerMessage },
            { role: "user", content: "Assume a hypothetical clinical trial for drug ABC123 for hypertension.\n\n" + combinedPrompt }
        ],
        response_format: { type: "json_object" }
    });

    console.log("Response:", response.choices[0].message.content);
}

testBatch();
