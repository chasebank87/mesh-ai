import { Notice } from 'obsidian';
import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { debugLog } from '../utils/MeshUtils';
import { SYSTEM_PROMPT_TEMPLATE } from '../constants/promptTemplates';

export class LMStudioProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;

  constructor(serverUrl: string, plugin: MeshAIPlugin) {
    this.plugin = plugin;
    this.apiHelper = new CloudAPIHelper(serverUrl, {
      'Content-Type': 'application/json'
    }, plugin);
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.apiHelper.get('/v1/models');
      if (response.data && Array.isArray(response.data)) {
        return response.data.map((model: any) => model.id);
      } else {
        throw new Error('Unexpected response format from LMStudio API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching LMStudio models: ${error}`);
      throw error;
    }
  }

  async generateResponse(prompt: string, onUpdate?: (partial: string) => void): Promise<string> {
    const lmstudioModels = this.plugin.settings.providerModels.lmstudio;
    const model = lmstudioModels && lmstudioModels.length > 0 ? lmstudioModels[0] : 'default-model';

    if (!model) {
      new Notice('No LMStudio model has been selected. Using default model.');
    }

    try {
      const response = await this.apiHelper.post('/v1/chat/completions', {
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_TEMPLATE },
          { role: 'user', content: prompt }
        ],
        stream: false
      });

      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message.content;
        if (onUpdate) {
          onUpdate(content);
        }
        return content;
      } else {
        throw new Error('No response content received from LMStudio API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error generating response with model ${model}: ${error}`);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }
}
