type ProviderName = 'openai' | 'google' | 'microsoft' | 'anthropic' | 'grocq' | 'ollama' | 'openrouter' | 'lmstudio';
type SearchProviderName = 'tavily' | 'perplexity';

type SupportedProviderName = 'openai' | 'grocq' | 'openrouter' | 'ollama' | 'lmstudio';

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
  openrouter: string[];
  lmstudio: string[];
}

interface PluginSettings {
  [key: string]: string | boolean | ProviderModels | Workflow[];
  openaiApiKey: string;
  googleApiKey: string;
  microsoftApiKey: string;
  anthropicApiKey: string;
  grocqApiKey: string;
  tavilyApiKey: string;
  usePerplexity: boolean;
  perplexityApiKey: string;
  youtubeApiKey: string;
  ollamaServerUrl: string;
  microsoftEndpointUrl: string;
  selectedProvider: ProviderName;
  selectedModel: string;
  providerModels: ProviderModels;
  customPatternsFolder: string;
  fabricPatternsFolder: string;
  meshOutputFolder: string;
  patternStitchingEnabled: boolean;
  enableDebugging: boolean;
  workflows: Workflow[];
  openrouterApiKey: string;
  lmstudioApiKey: string;
  lmstudioServerUrl: string;
  pathwaysModel: 'o1-preview' | 'o1-mini';
  pathwaysOutputFolder: string;
  defaultPathwayWorkflow: string;
  pathwaysSearchProvider: 'tavily' | 'perplexity';
}

const DEFAULT_SETTINGS: PluginSettings = {
  openaiApiKey: '',
  googleApiKey: '',
  microsoftApiKey: '',
  anthropicApiKey: '',
  grocqApiKey: '',
  tavilyApiKey: '',
  openrouterApiKey: '',
  usePerplexity: false,
  perplexityApiKey: '',
  youtubeApiKey: '',
  ollamaServerUrl: 'http://localhost:11434',
  microsoftEndpointUrl: '',
  selectedProvider: 'openai',
  selectedModel: '',
  providerModels: {
    openai: [],
    google: [],
    microsoft: [],
    anthropic: [],
    grocq: [],
    ollama: [],
    openrouter: [],
    lmstudio: []
  },
  customPatternsFolder: '',
  fabricPatternsFolder: '',
  meshOutputFolder: '',
  patternStitchingEnabled: false,
  enableDebugging: false,
  workflows: [],
  lmstudioApiKey: '',
  lmstudioServerUrl: 'http://localhost:8000',
  pathwaysModel: 'o1-preview',
  pathwaysOutputFolder: '',
  defaultPathwayWorkflow: '',
  pathwaysSearchProvider: 'tavily',
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

interface Workflow {
  name: string;
  provider: ProviderName;
  patterns: string[];
  usePatternStitching: boolean;
}

// At the bottom of the file, modify your exports:
export type {
  SearchProviderName,
  SupportedProviderName,
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
  Workflow
};

// Export the DEFAULT_SETTINGS separately as it's a value, not a type
export { DEFAULT_SETTINGS };