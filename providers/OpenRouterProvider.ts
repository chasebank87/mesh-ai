import { Notice } from 'obsidian';
import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { debugLog } from '../utils/MeshUtils';
import { SYSTEM_PROMPT_TEMPLATE, PATHWAYS_PROMPT_TEMPLATE } from '../constants/promptTemplates';

export class OpenRouterProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;

  constructor(apiKey: string, plugin: MeshAIPlugin) {
    this.apiHelper = new CloudAPIHelper('https://openrouter.ai/api/v1', {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/chasebank87/mesh-ai', // Replace with your actual GitHub repo
      'X-Title': 'Mesh AI Plugin for Obsidian' // Replace with your actual app name
    }, plugin);
    this.plugin = plugin;
  }

  async generateResponse(prompt: string, onUpdate?: (partial: string) => void): Promise<string> {
    const isPathwaysPrompt = prompt.includes(PATHWAYS_PROMPT_TEMPLATE);
    const configuredModel = isPathwaysPrompt 
        ? this.plugin.settings.pathwaysModel 
        : (this.plugin.settings.providerModels.openrouter[0] || 'openai/gpt-3.5-turbo');

    // Build fallback list dynamically from OpenRouter /models to ensure valid IDs
    let fallbackModels: string[] = [];
    try {
      const available = await this.getAvailableModels();
      const prioritizePatterns = [
        configuredModel, // always try user selection first
        'openai/gpt-4o-mini',
        'openai/gpt-4.1-mini',
        'openai/gpt-4o',
        'openai/gpt-4.1',
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-haiku',
        'deepseek/deepseek-r1',
        'deepseek/deepseek-v3',
        'deepseek/deepseek-chat',
        'google/gemini-1.5-flash',
        'google/gemini-1.5-pro',
        'mistralai/mistral-small',
        'cohere/command-r',
      ].filter(Boolean) as string[];

      const normalized = new Set<string>();
      for (const pattern of prioritizePatterns) {
        if (!pattern) continue;
        // If pattern is an exact id and exists, prefer it
        if (available.includes(pattern)) {
          normalized.add(pattern);
          continue;
        }
        // Otherwise, find the first available model that contains the pattern
        const found = available.find((id) => id.toLowerCase().includes(pattern.toLowerCase()));
        if (found) normalized.add(found);
      }

      // As a last resort, include a couple popular small models if still empty
      if (normalized.size === 0) {
        for (const id of available) {
          if (/(mini|small|flash)/i.test(id)) {
            normalized.add(id);
            if (normalized.size >= 3) break;
          }
        }
      }

      fallbackModels = Array.from(normalized);
    } catch (e) {
      // If /models fails, revert to a conservative static list
      fallbackModels = [
        configuredModel,
        'openai/gpt-4o-mini',
        'anthropic/claude-3.5-sonnet',
        'google/gemini-1.5-flash',
        'mistralai/mistral-small',
        'cohere/command-r',
      ].filter((m, idx, arr) => !!m && arr.indexOf(m) === idx);
    }

    let lastError: any = null;

    for (const model of fallbackModels) {
      debugLog(this.plugin, `Using OpenRouter model: ${model}`);

      const endpoint = '/chat/completions';
      const payload = {
        model: model,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT_TEMPLATE
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: !!onUpdate
      };

      try {
        if (onUpdate) {
          let fullResponse = '';
          await this.apiHelper.postStream(endpoint, payload, (chunk) => {
            if (chunk.choices && chunk.choices[0].delta && chunk.choices[0].delta.content) {
              const partialResponse = chunk.choices[0].delta.content;
              fullResponse += partialResponse;
              onUpdate(partialResponse);
            }
          });
          return fullResponse.trim();
        } else {
          const response = await this.apiHelper.post(endpoint, payload);
          if (response.choices && response.choices[0] && response.choices[0].message) {
            return response.choices[0].message.content.trim();
          } else {
            throw new Error('Unexpected response format from OpenRouter API');
          }
        }
      } catch (error: any) {
        lastError = error;
        const message = typeof error?.message === 'string' ? error.message : String(error);
        debugLog(this.plugin, `Error generating response with model ${model}: ${message}`);
        // If it's a 404 or model not found/unavailable, try next fallback
        const is404 = /\b404\b/.test(message) || /model not found|unknown model|unavailable/i.test(message);
        if (!is404) {
          // Non-retryable error; break
          break;
        }
      }
    }

    throw new Error(`Failed to generate response: ${lastError?.message || lastError || 'Unknown error'}`);
  }
  
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.apiHelper.get('/models');
      if (response.data && Array.isArray(response.data)) {
        return response.data.map((model: any) => model.id);
      } else {
        throw new Error('Unexpected response format from OpenRouter API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching OpenRouter models: ${error}`);
      throw error;
    }
  }
}
