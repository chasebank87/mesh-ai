import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { Notice } from 'obsidian';
import { debugLog } from '../utils/MeshUtils';

export class GoogleProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;

  constructor(apiKey: string, plugin: MeshAIPlugin) {
    this.apiHelper = new CloudAPIHelper('https://generativelanguage.googleapis.com/v1beta', {
      'x-goog-api-key': apiKey
    }, this.plugin);
    this.plugin = plugin;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.apiHelper.post('/models', {});
      if (response.models && Array.isArray(response.models)) {
        return response.models
          .filter((model: any) => model.supportedGenerationMethods.includes('generateContent'))
          .map((model: any) => model.name);
      } else {
        throw new Error('Unexpected response format from Google API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching Google models: ${error}`);
      throw error;
    }
  }

  async generateResponse(prompt: string, onUpdate?: (partial: string) => void): Promise<string> {
    const googleModels = this.plugin.settings.providerModels.google;
    const model = googleModels && googleModels.length > 0 ? googleModels[0] : 'chat-bison-001';

    if (!model) {
      new Notice('No Google model has been selected. Using default model "chat-bison-001".');
    }

    let fullResponse = '';

    try {
      await this.apiHelper.postStream(`/models/${model}:streamGenerateContent`, {
        contents: [{ parts: [{ text: prompt }] }],
        safety_settings: [
          { category: "HARM_CATEGORY_DANGEROUS", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      }, (chunk) => {
        if (chunk.candidates && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
          const partialResponse = chunk.candidates[0].content.parts[0].text;
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