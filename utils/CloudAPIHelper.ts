import { requestUrl, RequestUrlParam } from 'obsidian';
import MeshAIPlugin from '../main';
import { debugLog } from './MeshUtils';

export class CloudAPIHelper {
  private baseUrl: string;
  private headers: Record<string, string>;
  private plugin: MeshAIPlugin;

  constructor(baseUrl: string, headers: Record<string, string>, plugin: MeshAIPlugin) {
    this.baseUrl = baseUrl;
    this.headers = headers;
    this.plugin = plugin;
  }

  async get(endpoint: string): Promise<any> {
    return this.request(endpoint, 'GET');
  }
  
  async post(endpoint: string, data: any, rawResponse: boolean = false): Promise<any> {
    return this.request(endpoint, 'POST', data, rawResponse);
  }

  private async request(endpoint: string, method: string, data?: any, rawResponse: boolean = false): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const requestParams: RequestUrlParam = {
      url,
      method,
      headers: this.headers,
      contentType: 'application/json',
      throw: false
    };

    if (data) {
      requestParams.body = JSON.stringify(data);
    }

    try {
      const response = await requestUrl(requestParams);
      
      // Check if the response status is not successful (not in 200-299 range)
      if (response.status < 200 || response.status >= 300) {
        debugLog(this.plugin, `HTTP error! status: ${response.status}`);
        debugLog(this.plugin, `Response text: ${response.text}`);
        throw new Error(`HTTP error! status: ${response.status} - ${response.text}`);
      }

      if (rawResponse) {
        return response;
      } else {
        return response.json;
      }
    } catch (error) {
      debugLog(this.plugin, `Request error: ${error.message}`);
      throw error;
    }
  }

  async postStream(endpoint: string, data: any, onChunk: (chunk: any) => void) {
    const url = `${this.baseUrl}${endpoint}`;
    const requestParams: RequestUrlParam = {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers
      },
      body: JSON.stringify(data),
      throw: false
    };

    try {
      const response = await requestUrl(requestParams);
      const arrayBuffer = await response.arrayBuffer;
      const text = new TextDecoder().decode(arrayBuffer);
      const lines = text.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonData = line.slice(6);
          if (jsonData === '[DONE]') break;
          try {
            const parsedData = JSON.parse(jsonData);
            onChunk(parsedData);
          } catch (error) {
            debugLog(this.plugin, `Error parsing JSON: ${error}`);
          }
        }
      }
    } catch (error) {
      debugLog(this.plugin, `Error in postStream: ${error}`);
      throw error;
    }
  }
}