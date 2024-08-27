export const FULL_PROMPT_TEMPLATE = `
You are a helpful assistant. Follow the instructions provided within the delimiters to process the data accurately.

Prompt:
!!!!!!!!!!
{patternContents}
!!!!!!!!!!

Input Data:
**********
{input}
**********

`;