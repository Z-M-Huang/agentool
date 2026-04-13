import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use any tools or functions.
- You already have all the context you need in the conversation below.
- Tool calls will be REJECTED and your response will be discarded.
- Your entire response must be plain text containing the summary.

`;

const SUMMARY_INSTRUCTION = `Your task is to create a detailed summary of the conversation history provided below. This summary will replace the older portion of the conversation so that work can continue without losing important context.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail.
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Include code snippets where applicable and a summary of why each file is important.
4. Errors and Fixes: List all errors encountered and how they were fixed. Include any user feedback on corrections.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All User Messages: List ALL user messages that are not tool results. These are critical for understanding user feedback and changing intent.
7. Pending Tasks: Outline any pending tasks that were explicitly requested.
8. Current Work: Describe precisely what was being worked on most recently, including file names and code snippets where applicable.
9. Optional Next Step: List the next step that should be taken, directly in line with the most recent user requests. If the last task was concluded, only list next steps that are explicitly requested.

Be thorough and precise. Technical details, file paths, and code patterns are essential for continuing work without losing context.`;

const NO_TOOLS_TRAILER =
  '\n\nREMINDER: Do NOT call any tools. Respond with plain text only containing the summary.';

/**
 * Build the prompt sent to the model for summarization.
 *
 * Returns a LanguageModelV3Prompt with a system instruction and
 * a user message containing the serialized conversation history.
 */
export function buildCompactionPrompt(
  serializedHistory: string,
  targetTokens: number,
): LanguageModelV3Prompt {
  const systemContent =
    NO_TOOLS_PREAMBLE +
    SUMMARY_INSTRUCTION +
    `\n\nTarget summary length: approximately ${targetTokens} tokens. Be concise but do not omit important details.` +
    NO_TOOLS_TRAILER;

  return [
    { role: 'system' as const, content: systemContent },
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: `Here is the conversation history to summarize:\n\n${serializedHistory}`,
        },
      ],
    },
  ];
}
