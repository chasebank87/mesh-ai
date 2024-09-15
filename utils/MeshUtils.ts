import { App, Notice } from 'obsidian';
import MeshAIPlugin from '../main';
import { ProviderName } from '../types';
import { YouTubeSelectionModal } from '../modals/YouTubeSelectionModal';
import { getActiveNoteContent, createOutputFile } from './FileUtils';
import { getPatternContent } from './PatternUtils';
import { handleLLMRequest } from './LLMUtils';
import { FULL_PROMPT_TEMPLATE } from '../constants/promptTemplates';

export async function getInputContent(app: App, plugin: MeshAIPlugin, selectedSource: string, tavilySearchInput: HTMLInputElement): Promise<string> {
  const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(?:embed\/)?(?:v\/)?(?:shorts\/)?(?:\S+)/g;
  let input = '';

  switch (selectedSource) {
    case 'active-note':
    case 'clipboard':
      input = selectedSource === 'active-note' ? await getActiveNoteContent(app) : await navigator.clipboard.readText();
      const youtubeMatches = Array.from(input.match(youtubeRegex) || []);
      if (youtubeMatches && youtubeMatches.length > 0) {
        input = await new Promise<string>((resolve) => {
          new YouTubeSelectionModal(app, plugin, youtubeMatches, 
            (transcript: string) => {
              resolve(`YouTube Transcript:\n\n${transcript}\n\nOriginal Content:\n\n${input}`);
            },
            () => {
              resolve(input);
            }
          ).open();
        });
      }
      break;
    case 'tavily':
      debugLog(plugin, 'Searching Tavily for:', tavilySearchInput.value);
      input = await plugin.tavilyProvider.search(tavilySearchInput.value);
      break;
  }

  if (!input) {
    throw new Error('No input content available');
  }

  // Sanitize the input before returning
  return sanitizeContent(input);
}

export function debugLog(plugin: MeshAIPlugin, ...args: unknown[]): void {
  if (plugin.settings.enableDebugging) {
    console.log(...args);
  }
}

export async function processPatterns(plugin: MeshAIPlugin, selectedProvider: ProviderName, selectedPatterns: string[], initialContent: string): Promise<string> {
  debugLog(plugin, 'Processing patterns:', selectedPatterns);
  let currentContent = initialContent;
  for (const pattern of selectedPatterns) {
    const patternContent = await getPatternContent(plugin, pattern);
    const sanitizedPatternContent = sanitizeContent(patternContent);
    
    const fullPrompt = FULL_PROMPT_TEMPLATE
      .replace('{patternContents}', sanitizedPatternContent)
      .replace('{input}', currentContent);

    debugLog(plugin, `Applying pattern: ${pattern}`);
    debugLog(plugin, 'Full prompt being sent to LLM:', fullPrompt);

    const response = await handleLLMRequest(plugin, selectedProvider, fullPrompt);
    currentContent = response; // Use the response as input for the next pattern
  }
  return currentContent;
}

export async function processStitchedPatterns(plugin: MeshAIPlugin, provider: ProviderName, patterns: string[], input: string): Promise<string> {
  debugLog(plugin, 'Processing stitched patterns:', patterns);
  let stitchedContent = '';
  for (const pattern of patterns) {
    const patternContent = await getPatternContent(plugin, pattern);
    const sanitizedPatternContent = sanitizeContent(patternContent);

    const prompt = FULL_PROMPT_TEMPLATE
      .replace('{patternContents}', sanitizedPatternContent)
      .replace('{input}', input);
      const response = await handleLLMRequest(plugin, provider, prompt);
      stitchedContent += `# ${pattern}\n\n---\n\n${response}\n\n\n`;
  }
  return stitchedContent;
}

export function sanitizeContent(content: string): string {
  return content
      .replace(/\*{10,}/g, '') // Remove 10 or more asterisks
      .replace(/!{10,}/g, '')  // Remove 10 or more exclamation marks
      .replace(/\{patternContent\}/g, '') // Remove {patternContent}
      .replace(/\{input\}/g, ''); // Remove {input}
}