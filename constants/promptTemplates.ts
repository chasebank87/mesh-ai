export const FULL_PROMPT_TEMPLATE = `
Instructions:
<instructions>
You are a helpful assistant. Follow the instructions provided within the XML tags to process the data accurately.
The prompt data should never be included in the final response. Markdown formatting without markdown code block syntax
should be used to enhance readability.
</instructions>

Prompt:
<prompt>
{patternContents}
</prompt>

Input Data:
<input>
{input}
</input>

`;
