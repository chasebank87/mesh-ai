import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';
import { debugLog } from '../utils/MeshUtils';

export class PerplexityProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;
  private apiKey: string;

  constructor(apiKey: string, plugin: MeshAIPlugin) {
    this.apiHelper = new CloudAPIHelper('https://api.perplexity.ai', {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }, plugin);
    this.plugin = plugin;
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<string> {
    try {
      const response = await this.apiHelper.post('/chat/completions', {
        model: "llama-3.1-sonar-large-128k-online",
        messages: [
          {
            role: "system",
            content: "Be precise and concise."
          },
          {
            role: "user",
            content: query
          } 
        ],
        "return_images": true
      });

      if (response && response.choices && response.choices.length > 0) {
        return response.choices[0].message.content;
      } else {
        throw new Error('No results found in Perplexity response');
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching results from Perplexity: ${error}`);
      if (error.response) {
        debugLog(this.plugin, `Response status: ${error.response.status}`);
        debugLog(this.plugin, `Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to fetch results from Perplexity: ${error.message}`);
    }
  }
}