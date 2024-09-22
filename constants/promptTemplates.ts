export const FULL_PROMPT_TEMPLATE = `
Prompt:
<prompt>
{patternContents}
</prompt>

Input Data:
<input>
{input}
</input>

`;

export const SYSTEM_PROMPT_TEMPLATE = 'You are a helpful assistant. Follow the instructions provided within the XML tags to process the data accurately.The prompt data should never be included in the final response. Use Markdown formatting to enhance readability.The output should not be wrapped with a markdown code block.';
