import { CloudAPIHelper } from '../utils/CloudAPIHelper';
import MeshAIPlugin from '../main';

export class TavilyProvider {
  private apiHelper: CloudAPIHelper;
  private plugin: MeshAIPlugin;
  private apiKey: string;

  constructor(apiKey: string, plugin: MeshAIPlugin) {
    this.apiHelper = new CloudAPIHelper('https://api.tavily.com', {
      'Content-Type': 'application/json'
    });
    this.plugin = plugin;
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<string> {
    try {
      const response = await this.apiHelper.post('/search', {
        api_key: this.apiKey, // Include the API key in the request body
        query: query,
        search_depth: 'advanced',
        include_answer: true,
        include_images: true,
        include_raw_content: false,
        max_results: 10
      });

      if (response) {
        return JSON.stringify(response);
      } else {
        throw new Error('No results found in Tavily response');
      }
    } catch (error) {
      console.error('Error fetching results from Tavily:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw new Error(`Failed to fetch results from Tavily: ${error.message}`);
    }
  }
}