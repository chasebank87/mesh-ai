import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { Notice } from 'obsidian';
import { debugLog } from '../utils/MeshUtils';

export class MicrosoftProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;

  constructor(apiKey: string, plugin: MeshAIPlugin) {
    this.apiHelper = new CloudAPIHelper('https://api.cognitive.microsoft.com', {
      'api-key': apiKey
    }, this.plugin);
    this.plugin = plugin;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.apiHelper.post('/openai/deployments?api-version=2023-05-15', {});
      if (response.value && Array.isArray(response.value)) {
        return response.value
          .filter((deployment: any) => deployment.model.startsWith('gpt'))
          .map((deployment: any) => deployment.id);
      } else {
        throw new Error('Unexpected response format from Microsoft API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching Microsoft models: ${error}`);
      throw error;
    }
  }

  async generateResponse(prompt: string, onUpdate?: (partial: string) => void): Promise<string> {
    const microsoftModels = this.plugin.settings.providerModels.microsoft;
    const model = microsoftModels && microsoftModels.length > 0 ? microsoftModels[0] : 'gpt-35-turbo';

    if (!model) {
      new Notice('No Microsoft model has been selected. Using default model "gpt-35-turbo".');
    }

    let fullResponse = '';

    try {
      await this.apiHelper.postStream(`/openai/deployments/${model}/chat/completions?api-version=2023-05-15`, {
        messages: [{ role: 'user', content: prompt }],
        stream: true
      }, (chunk) => {
        if (chunk.choices && chunk.choices[0].delta && chunk.choices[0].delta.content) {
          const partialResponse = chunk.choices[0].delta.content;
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