import { Notice } from 'obsidian';
import { OllamaAPIHelper } from '../utils/OllamaAPIHelper';
import MeshAIPlugin from '../main';
import { debugLog } from '../utils/MeshUtils';
import { SYSTEM_PROMPT_TEMPLATE } from '../constants/promptTemplates';
export class OllamaProvider {
  private apiHelper: OllamaAPIHelper;
  private plugin: MeshAIPlugin;

  constructor(serverUrl: string, plugin: MeshAIPlugin) {
    this.apiHelper = new OllamaAPIHelper(serverUrl, this.plugin);
    this.plugin = plugin;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.apiHelper.get('/api/tags');
      if (response.models && Array.isArray(response.models)) {
        return response.models.map((model: { name: string }) => model.name);
      } else {
        throw new Error('Unexpected response format from Ollama API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching Ollama models: ${error}`);
      throw new Error('Failed to fetch Ollama models. Please ensure the Ollama server is running and the URL is correct.');
    }
  }

  async generateResponse(prompt: string, onUpdate?: (partial: string) => void): Promise<string> {
    const ollamaModels = this.plugin.settings.providerModels.ollama;
    const model = ollamaModels && ollamaModels.length > 0 ? ollamaModels[0] : 'llama2'; // Default to 'llama2' if no model is selected

    if (!model) {
      new Notice('No Ollama model has been selected. Using default model "llama2".');
    }

    let fullResponse = '';

    try {
      await this.apiHelper.postStream('/api/generate', {
        model: model,
        system: SYSTEM_PROMPT_TEMPLATE,
        prompt: prompt,
        stream: true
      }, (chunk) => {
        if (chunk.response) {
          fullResponse += chunk.response;
          if (onUpdate) {
            onUpdate(chunk.response);
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