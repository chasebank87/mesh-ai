import { BaseAPIHelper } from './BaseAPIHelper';

export class CloudAPIHelper extends BaseAPIHelper {
  async get(endpoint: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
  
  async post(endpoint: string, data: any, rawResponse: boolean = false): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (rawResponse) {
      return response;
    } else {
      return await response.json();
    }
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
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonData = line.slice(6);
              if (jsonData === '[DONE]') break;
              try {
                const parsedData = JSON.parse(jsonData);
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