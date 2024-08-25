export type ProviderName = 'openai' | 'google' | 'microsoft' | 'anthropic' | 'grocq' | 'ollama';

export type ProviderApiKeys = {
  [K in Exclude<ProviderName, 'ollama'>]: string;
} & {
  ollamaServerUrl: string;
};

export interface ProviderModels {
  openai: string[];
  google: string[];
  microsoft: string[];
  anthropic: string[];
  grocq: string[];
  ollama: string[];
}

export interface PluginSettings {
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

export const DEFAULT_SETTINGS: PluginSettings = {
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