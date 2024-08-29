import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { Notice } from 'obsidian';
import { debugLog } from '../utils/MeshUtils';

interface GroqResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_time: number;
    completion_time: number;
    total_time: number;
  };
}

export class GrocqProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;

  constructor(apiKey: string, plugin: MeshAIPlugin) {
    this.apiHelper = new CloudAPIHelper('https://api.groq.com/openai/v1', {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }, this.plugin);
    this.plugin = plugin;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.apiHelper.get('/models');
      if (response.data && Array.isArray(response.data)) {
        return response.data.map((model: any) => model.id);
      } else {
        throw new Error('Unexpected response format from Groq API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching Groq models: ${error}`);
      throw error;
    }
  }

  async generateResponse(prompt: string, onUpdate?: (partial: string) => void): Promise<string> {
    const grocqModels = this.plugin.settings.providerModels.grocq;
    const model = grocqModels && grocqModels.length > 0 ? grocqModels[0] : 'mixtral-8x7b-32768';

    if (!model) {
      new Notice('No Groq model has been selected. Using default model "mixtral-8x7b-32768".');
    }

    // Extract pattern content (between 10 exclamation marks)
    const patternMatch = prompt.match(/!{10}([\s\S]*?)!{10}/);
    const patternContent = patternMatch ? patternMatch[1].trim() : "You are a helpful assistant.";

    // Extract input data (between 10 asterisks)
    const inputMatch = prompt.match(/\*{10}([\s\S]*?)\*{10}/);
    const inputContent = inputMatch ? inputMatch[1].trim() : prompt;

    try {
      const response = await this.apiHelper.post('/chat/completions', {
        model: model,
        messages: [
          { role: 'system', content: patternContent },
          { role: 'user', content: inputContent }
        ],
      }) as GroqResponse;

      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message.content;
        if (onUpdate) {
          onUpdate(content);
        }
        return content;
      } else {
        throw new Error('No response content received from Groq API');
      }
    } catch (error) {
      debugLog(this.plugin, `Error generating response with model ${model}: ${error}`);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }
}