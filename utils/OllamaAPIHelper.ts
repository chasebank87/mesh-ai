import { BaseAPIHelper } from './BaseAPIHelper';

export class OllamaAPIHelper extends BaseAPIHelper {
  async get(endpoint: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
  
  async post(endpoint: string, data: any) {
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

  async postStream(endpoint: string, data: any, onChunk: (chunk: any) => void) {
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
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.trim()) {
              try {
                const parsedData = JSON.parse(line);
                onChunk(parsedData);
              } catch (error) {
                console.error('Error parsing JSON:', error);
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