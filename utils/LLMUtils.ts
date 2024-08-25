import { ProviderName } from '../types';
import MeshAIPlugin from '../main';

export async function handleLLMRequest(plugin: MeshAIPlugin, provider: ProviderName, prompt: string): Promise<string> {
  try {
    const providerInstance = plugin.getProvider(provider);
    const response = await providerInstance.generateResponse(prompt);
    return response;
  } catch (error) {
    console.error('LLM Request failed:', error);
    throw new Error(`LLM Request failed: ${error.message}`);
  }
}