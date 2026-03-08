# Placeholder Replacement Guide

## How Placeholders Work in Templates

### Template Format (Word Documents)

In your Word template files (`template.docx`, `template2.docx`), use this format for placeholders:

```
{{placeholder_name}}
```

### Example Template Structure

```
Title: {{title}}

Health Condition: {{health_condition}}

Drug Information:
- Drug Code: {{drug_code}}
- Generic Name: {{generic_name_of_drug}}
- Pronunciation: {{pronounciation}}

Trial Details:
- Trial Number: {{trial_number}}
- Sponsor: {{sponsor_co_sponsor}}
- Start Date: {{trial_start_date}}
- End Date: {{trial_end_date}}

Purpose:
{{purpose}}

Description:
{{health_condition_description}}
```

### Placeholder Naming Convention

1. **Use snake_case** for all placeholder names (e.g., `drug_code`, not `drugCode`)
2. **Match JSON keys** - The placeholder name must exactly match the JSON key from AI extraction
3. **No spaces** - Use underscores instead of spaces

### Special Placeholders

#### Table Placeholders
For tables, use double curly braces:
```
{{race_table_placeholder}}
{{adverse_events_table_placeholder}}
```

#### List Placeholders
For bullet points or lists:
```
Primary Endpoints:
{{primary_endpoint}}
```

### JSON Structure from AI

The AI returns data in this format:
```json
{
  "title": "A clinical trial to learn about...",
  "drug_code": "ABC123",
  "health_condition": "Heart Failure"
}
```

### How Replacement Works

1. AI extracts data → Returns JSON with keys like `"title"`, `"drug_code"`
2. User edits the JSON in the UI
3. Generate button merges all JSON objects
4. Backend replaces `{{title}}` with the value from `json.title`
5. Backend replaces `{{drug_code}}` with the value from `json.drug_code`

### Current Implementation

The `generate/route.ts` uses the `docx` library's `patchDocument` function:

```typescript
const patches: any = {};
for (const [key, value] of Object.entries(parsedData)) {
    if (typeof value !== 'object' && value !== null) {
        patches[key] = {
            type: PatchType.PARAGRAPH,
            children: [new TextRun(String(value))]
        };
    }
}
```

This replaces placeholders like `{{key}}` with the corresponding value.
