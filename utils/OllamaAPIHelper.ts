import { requestUrl, RequestUrlParam } from 'obsidian';
import MeshAIPlugin from '../main';
import { debugLog } from './MeshUtils';
import { OllamaModelsResponse, OllamaResponse } from '../types';

export class OllamaAPIHelper {
  private baseUrl: string;
  private plugin: MeshAIPlugin;
  private headers: Record<string, string>;

  constructor(baseUrl: string, plugin: MeshAIPlugin) {
    this.baseUrl = baseUrl;
    this.plugin = plugin;
    this.headers = {
      'Content-Type': 'application/json'
    };
  }

  async get(endpoint: string): Promise<OllamaModelsResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await requestUrl({
      url,
      method: 'GET',
      headers: this.headers
    });
  
    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  
    return response.json as OllamaModelsResponse;
  }

  async post(endpoint: string, data: Record<string, unknown>): Promise<OllamaResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await requestUrl({
      url,
      method: 'POST',
      body: JSON.stringify(data),
      headers: this.headers
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json as OllamaResponse;
  }

  async postStream(endpoint: string, data: Record<string, unknown>, onChunk: (chunk: OllamaResponse) => void): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await requestUrl({
      url,
      method: 'POST',
      body: JSON.stringify(data),
      headers: this.headers,
      throw: false
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const buffer = await response.arrayBuffer;
    const reader = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      }
    }).getReader();

    const decoder = new TextDecoder();

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