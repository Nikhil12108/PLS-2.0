import extractedData from './extracted_data.json';

// Type definitions for our extracted data
export type PromptMapping = typeof extractedData.mappings.results_PLS;
export type PromptSet = Record<string, string>;

export interface ExtractedData {
    prompts: {
        results_PLS: PromptSet;
        protocol_PLS: PromptSet;
        [key: string]: PromptSet;
    };
    mappings: {
        results_PLS: PromptMapping;
        protocol_PLS: PromptMapping;
        [key: string]: PromptMapping;
    };
}

const data = extractedData as unknown as ExtractedData;

export function extractPrompts(readabilityLevel: string, mappingName: string): { keys: string[]; texts: Record<string, string>; mapping: PromptMapping } {
    // Fallback to "results_PLS" if mapping is not found
    const selectedMappingName = data.prompts[mappingName] ? mappingName : "results_PLS";

    const rawPrompts = data.prompts[selectedMappingName];
    const mapping = data.mappings[selectedMappingName];

    const keys: string[] = [];
    const texts: Record<string, string> = {};

    for (const [key, value] of Object.entries(rawPrompts)) {
        // Replicate Python's key trimming logic
        const ph = key.endsWith("_prompt") ? key.slice(0, -7) : key;
        keys.push(ph);

        // Replace the injected ${age} placeholder with the actual runtime readability level
        texts[ph] = value.replace(/\$\{age\}/g, readabilityLevel);
    }

    return { keys, texts, mapping };
}
