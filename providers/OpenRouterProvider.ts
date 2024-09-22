import { Notice } from 'obsidian';
import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { debugLog } from '../utils/MeshUtils';
import { SYSTEM_PROMPT_TEMPLATE } from '../constants/promptTemplates';

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
    const openRouterModels = this.plugin.settings.providerModels.openrouter;
    const model = openRouterModels && openRouterModels.length > 0 ? openRouterModels[0] : 'openai/gpt-3.5-turbo';

    debugLog(this.plugin, `Using OpenRouter model: ${model}`);

    if (!model) {
      throw new Error('No OpenRouter model has been selected. Please choose a model in the settings.');
    }
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
    } catch (error) {
      debugLog(this.plugin, `Error generating response with model ${model}: ${error}`);
      if (error.response) {
        debugLog(this.plugin, `Response status: ${error.response.status}`);
        debugLog(this.plugin, `Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to generate response: ${error.message}`);
    }
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
