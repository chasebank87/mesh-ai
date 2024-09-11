import { requestUrl, RequestUrlResponse } from 'obsidian';

export class BaseAPIHelper {
  protected baseUrl: string;
  protected headers: Record<string, string>;

  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.headers = headers;
  }

  protected async fetchWithErrorHandling(url: string, options: any): Promise<RequestUrlResponse> {
    const response = await requestUrl({
      url,
      ...options,
      throw: false
    });
    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  }
}