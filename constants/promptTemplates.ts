export const FULL_PROMPT_TEMPLATE = `
You are a helpful assistant. Follow the instructions provided within the delimiters to process the data accurately. The prompt data should never be included in the final response.

Prompt:
!!!!!!!!!!
{patternContents}
!!!!!!!!!!

Input Data:
**********
{input}
**********

`;