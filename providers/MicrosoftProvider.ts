import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { Notice } from 'obsidian';
import { debugLog } from '../utils/MeshUtils';
import { SYSTEM_PROMPT_TEMPLATE } from '../constants/promptTemplates';

export class MicrosoftProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;

  constructor(apiKey: string, plugin: MeshAIPlugin) {
    const endpointUrl = plugin.settings.microsoftEndpointUrl || 'https://api.cognitive.microsoft.com';
    this.apiHelper = new CloudAPIHelper(endpointUrl, {
      'api-key': apiKey
    }, plugin);
    this.plugin = plugin;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const deploymentEndpoint = '/openai/deployments?api-version=2023-03-15-preview';
  
      debugLog(this.plugin, `Fetching Microsoft models from: ${deploymentEndpoint}`);
  
      const response = await this.apiHelper.get(deploymentEndpoint);
      
      debugLog(this.plugin, `Microsoft API response:`, response);
  
      if (response.error) {
        throw new Error(`Azure API Error: ${response.error.code} - ${response.error.message}`);
      }
  
      if (response.data && Array.isArray(response.data)) {
        return response.data
          .filter((deployment: any) => 
            deployment.status === 'succeeded' && 
            deployment.model && 
            typeof deployment.model === 'string'
          )
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
      await this.apiHelper.postStream(`openai/deployments/${model}/completions?api-version=2023-05-15`, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_TEMPLATE },
          { role: 'user', content: prompt }
        ],
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