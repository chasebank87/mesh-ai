export const FULL_PROMPT_TEMPLATE = `
# You will be given prompt instructions that should not be included in your generation, just the content below the divider. The divider is a series of 10 asterisks (*) on a new line.

{patternContents}

You are now tasked with processing the data that follows, applying the guidelines and structure outlined in the previous prompt. Your primary goal is to enhance the rough notes into well-organized, detailed, and contextually rich documentation. Ensure that all data is accurately captured, formatted in markdown, and made easily retrievable for future reference.

Key Instructions:

Maintain Consistency: Keep the formatting consistent throughout the document, adhering to the markdown structure provided.
Contextual Clarity: Add or infer any missing details to enhance the clarity and context of the notes.
Summarization and Structuring: Make the notes concise but informative, ensuring that they are structured in a way that aids retrieval by a RAG system.
Task Identification: Pay special attention to tasks, ensuring they are clearly marked with appropriate statuses (incomplete, completed, in progress) and use the provided icons and formats to enhance readability.
Resource Linking: If any online resources are mentioned or inferred, link them appropriately using official URLs or PDFs.
Define Uncommon Terms: Identify and define any uncommon or significant terms, linking to relevant wiki pages where possible.
Data Availability: If no data follows this prompt, return an error indicating that no data was sent to process.
Proceed to process the data below according to these guidelines.

**********

{input}
`;