import { BaseAPIHelper } from './BaseAPIHelper';
import { debugLog } from '../utils/MeshUtils';
import MeshAIPlugin from '../main'; 
import { OllamaResponse, OllamaModelsResponse } from '../types';

export class OllamaAPIHelper extends BaseAPIHelper {
  private plugin: MeshAIPlugin;

  constructor(baseUrl: string, plugin: MeshAIPlugin) {
    super(baseUrl);
    this.plugin = plugin;
  }

  async get(endpoint: string): Promise<OllamaModelsResponse> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
    });
  
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  
    return response.json();
  }
  async post(endpoint: string, data: Record<string, unknown>): Promise<OllamaResponse> {
    const response = await this.fetchWithErrorHandling(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers
      },
      body: JSON.stringify(data)
    });
    return await response.json();
  }

  async postStream(endpoint: string, data: Record<string, unknown>, onChunk: (chunk: OllamaResponse) => void): Promise<void> {
    const response = await this.fetchWithErrorHandling(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers
      },
      body: JSON.stringify(data)
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      try {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.trim()) {
              try {
                const parsedData = JSON.parse(line) as OllamaResponse;
                onChunk(parsedData);
              } catch (error) {
                debugLog(this.plugin, `Error parsing JSON: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
  }
}