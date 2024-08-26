type ProviderName = 'openai' | 'google' | 'microsoft' | 'anthropic' | 'grocq' | 'ollama';

type ProviderApiKeys = {
  [K in Exclude<ProviderName, 'ollama'>]: string;
} & {
  ollamaServerUrl: string;
};

interface ProviderModels {
  openai: string[];
  google: string[];
  microsoft: string[];
  anthropic: string[];
  grocq: string[];
  ollama: string[];
}

interface PluginSettings {
  openaiApiKey: string;
  googleApiKey: string;
  microsoftApiKey: string;
  anthropicApiKey: string;
  grocqApiKey: string;
  tavilyApiKey: string;
  youtubeApiKey: string;
  ollamaServerUrl: string;
  selectedProvider: ProviderName;
  selectedModel: string;
  providerModels: ProviderModels;
  customPatternsFolder: string;
  fabricPatternsFolder: string;
  meshOutputFolder: string;
  patternStitchingEnabled: boolean;
  enableDebugging: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
  openaiApiKey: '',
  googleApiKey: '',
  microsoftApiKey: '',
  anthropicApiKey: '',
  grocqApiKey: '',
  tavilyApiKey: '',
  youtubeApiKey: '',
  ollamaServerUrl: 'http://localhost:11434',
  selectedProvider: 'openai',
  selectedModel: '',
  providerModels: {
    openai: [],
    google: [],
    microsoft: [],
    anthropic: [],
    grocq: [],
    ollama: []
  },
  customPatternsFolder: '',
  fabricPatternsFolder: '',
  meshOutputFolder: '',
  patternStitchingEnabled: false,
  enableDebugging: false,
};

interface GitHubApiItem {
  name: string;
  type: 'file' | 'dir';
  // Add other properties as needed
}

interface OptgroupAttributes {
  label: string;
}

interface AttributeMap {
  [key: string]: string | number | boolean | null;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason?: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaModelDetails {
  parent_model: string;
  format: string;
  family: string;
  families: string[];
  parameter_size: string;
  quantization_level: string;
}

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
}

interface OllamaModelsResponse {
  models: OllamaModel[];
}

// At the bottom of the file, modify your exports:
export type {
  ProviderName,
  ProviderApiKeys,
  ProviderModels,
  PluginSettings,
  GitHubApiItem,
  OptgroupAttributes,
  AttributeMap,
  OllamaResponse,
  OllamaModelDetails,
  OllamaModel,
  OllamaModelsResponse,
};

// Export the DEFAULT_SETTINGS separately as it's a value, not a type
export { DEFAULT_SETTINGS };