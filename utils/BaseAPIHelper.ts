export class BaseAPIHelper {
  protected baseUrl: string;
  protected headers: Record<string, string>;

  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.headers = headers;
  }

  protected async fetchWithErrorHandling(url: string, options: RequestInit): Promise<Response> {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  }
}