import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { Notice } from 'obsidian';
import { debugLog } from '../utils/MeshUtils';
import { SYSTEM_PROMPT_TEMPLATE } from '../constants/promptTemplates';

export class AnthropicProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;

  constructor(apiKey: string, plugin: MeshAIPlugin) {
    this.apiHelper = new CloudAPIHelper('https://api.anthropic.com/v1', {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }, this.plugin);
    this.plugin = plugin;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.apiHelper.post('/models', {});
      if (response.models && Array.isArray(response.models)) {
        return response.models
          .filter((model: any) => model.type === 'chat')
          .map((model: any) => model.id);
      } else {
        throw new Error('Unexpected response format from Anthropic API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching Anthropic models: ${error}`);
      throw error;
    }
  }

  async generateResponse(prompt: string, onUpdate?: (partial: string) => void): Promise<string> {
    const anthropicModels = this.plugin.settings.providerModels.anthropic;
    const model = anthropicModels && anthropicModels.length > 0 ? anthropicModels[0] : 'claude-2';

    if (!model) {
      new Notice('No Anthropic model has been selected. Using default model "claude-2".');
    }

    let fullResponse = '';

    try {
      await this.apiHelper.postStream('/messages', {
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_TEMPLATE },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        stream: true
      }, (chunk) => {
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          const partialResponse = chunk.delta.text;
          fullResponse += partialResponse;
          if (onUpdate) {
            onUpdate(partialResponse);
          }
        }
      });

      return fullResponse;
    } catch (error) {
      debugLog(this.plugin, `Error generating response with model ${model}: ${error}`);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }
}