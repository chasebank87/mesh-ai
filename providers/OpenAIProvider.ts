import { Notice } from 'obsidian';
import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { debugLog } from '../utils/MeshUtils';

export class OpenAIProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;

  constructor(apiKey: string, plugin: MeshAIPlugin) {
    this.apiHelper = new CloudAPIHelper('https://api.openai.com/v1', {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }, this.plugin);
    this.plugin = plugin;
  }

  async generateResponse(prompt: string, onUpdate?: (partial: string) => void): Promise<string> {
    const openAIModels = this.plugin.settings.providerModels.openai;
    const model = openAIModels && openAIModels.length > 0 ? openAIModels[0] : 'gpt-3.5-turbo';

    debugLog(this.plugin, `Using OpenAI model: ${model}`);

    if (!model) {
      throw new Error('No OpenAI model has been selected. Please choose a model in the settings.');
    }

    const endpoint = '/chat/completions';
    const payload = {
      model: model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant."
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
          throw new Error('Unexpected response format from OpenAI API');
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
        return response.data
          .filter((model: any) => model.id.startsWith('gpt-'))
          .map((model: any) => model.id);
      } else {
        throw new Error('Unexpected response format from OpenAI API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching OpenAI models: ${error}`);
      throw error;
    }
  }
}