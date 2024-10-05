const FULL_PROMPT_TEMPLATE = `
Prompt:
<prompt>
{patternContents}
</prompt>

Input Data:
<input>
{input}
</input>

`;

const SYSTEM_PROMPT_TEMPLATE = 'You are a helpful assistant. Follow the instructions provided within the XML tags to process the data accurately.The prompt data should never be included in the final response. Use Markdown formatting to enhance readability.The output should not be wrapped with a markdown code block.';

const PATHWAYS_PROMPT_TEMPLATE = `
To replicate this output consistently, follow these steps:

Extract Key Topics or Phrases:

Identify significant phrases, topics, or nouns from the original document that encapsulate the main ideas. These will serve as your "backlinks" and should be concise and meaningful.

Make the Backlinks Specific to the Document Topic: Ensure that the backlinks are specific enough to distinguish them from similar topics in other documents. For example, if the document is about "EPM Integration Agent for Oracle Cloud" and the topic is "Monitoring Agent," the backlink should be "EPM Integration Agent Monitoring" or "EPM Integration Agent - SSL Configuration" instead of just "Monitoring Agent" or "SSL Configuration."

Be sure to not include any duplicate backlinks or backlinks that already exist in the input document.

Check for Existing Files:

The content data you are acting upon will always have an XML tag called <files>. This tag contains a list of files.

Determine if any of these files correspond to the backlink topic. If a file or files can be used for the backlink topic, include the files in a new key called "potential links" for that item.

This helps to avoid creating new files unnecessarily by linking to existing files.

Compose a Question for Each Backlink:

Content: Write a question that can be asked to an internet-connected LLM about the backlink topic. The question should be clear, specific, and designed to elicit informative responses about the topic.
Determine the Exact Match:

For each backlink, find the exact word-for-word string in the original content that relates to it. This will be used in the "match" field to facilitate precise matching in your program.
Format in JSON:

Structure your output as a JSON array, ensuring each item contains the "backlink", "content", "match", and (if applicable) "potential links" keys. Never should be wrapped in a code block.
Example Structure:

[
  {
    "backlink": "Specific and Meaningful Topic Related to the Document",
    "content": "Your question about the backlink topic.",
    "match": "Exact word-for-word string from the original content.",
    "potential links": ["file1", "file2"]
  },
  // Additional items...
]

Guidelines:

Backlink:

Should be a concise phrase, topic, or noun.

Reflects the main idea for the corresponding content.

Make the Backlinks Specific to the Document Topic: Include context from the document to make the backlink unique and distinguishable from similar topics in other documents.

Avoid duplicates and topics already present in the input document.

Content:

Formulate a clear and specific question about the backlink topic.

The question should be suitable for an internet-connected LLM to answer, providing up-to-date information.

Match:

Use the exact word-for-word string from the original document.

Ensure accuracy to facilitate precise text matching in your program.

Potential Links (Optional):

If any files from the <files> tag correspond to the backlink topic, include their file names in the "potential links" key.

This helps to use existing files and avoid creating new ones unnecessarily.

IMPORTANT:

The output should be a JSON array. Never should be wrapped in a code block.
`;

export { FULL_PROMPT_TEMPLATE, SYSTEM_PROMPT_TEMPLATE, PATHWAYS_PROMPT_TEMPLATE };