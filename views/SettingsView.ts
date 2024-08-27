import { App, PluginSettingTab, Setting, DropdownComponent, ButtonComponent, Notice } from 'obsidian';
import { PluginSettings, ProviderName } from '../types';
import MeshAIPlugin from '../main';
import { debugLog } from '../utils/MeshUtils';
import { MeshView } from './MeshView';

export class SettingsView extends PluginSettingTab {
  plugin: MeshAIPlugin;

  constructor(app: App, plugin: MeshAIPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const {containerEl} = this;
    containerEl.empty();

    const providers: ProviderName[] = ['openai', 'google', 'microsoft', 'anthropic', 'grocq', 'ollama'];

    for (const provider of providers) {
      if (provider === 'ollama') {
        new Setting(containerEl)
          .setName(`Ollama server URL`)
          .setDesc('Enter the URL for your Ollama server')
          .addText(text => text
            .setPlaceholder('Enter URL')
            .setValue(this.plugin.settings.ollamaServerUrl)
            .onChange(async (value) => {
              this.plugin.settings.ollamaServerUrl = value;
              await this.plugin.saveSettings();
            }));
      } else {
        new Setting(containerEl)
          .setName(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API key`)
          .setDesc(`Enter your ${provider} API key`)
          .addText(text => text
            .setPlaceholder('Enter API key')
            .setValue(this.plugin.settings[`${provider}ApiKey`])
            .onChange(async (value) => {
              (this.plugin.settings[`${provider}ApiKey` as keyof PluginSettings] as string) = value;
              await this.plugin.saveSettings();
            }));
      }

      // Add model selection for each provider only if there's an API key or server URL
      const apiKey = provider === 'ollama' ? this.plugin.settings.ollamaServerUrl : this.plugin.settings[`${provider}ApiKey`];
      if (apiKey) {
        const modelSetting = new Setting(containerEl)
          .setName(`${provider.charAt(0).toUpperCase() + provider.slice(1)} model`)
          .setDesc(`Select the model for ${provider}`)
          .addDropdown(async (dropdown: DropdownComponent) => {
            await this.populateModelDropdown(dropdown, provider);
          });

        modelSetting.addButton((button: ButtonComponent) => {
          button
            .setButtonText('Refresh models')
            .onClick(async () => {
              const dropdown = modelSetting.components[0] as DropdownComponent;
              await this.populateModelDropdown(dropdown, provider, true);
            });
        });
      }
    }

    // Add setting for selected provider
    new Setting(containerEl)
      .setName('Selected provider')
      .setDesc('Choose the default provider')
      .addDropdown(dropdown => {
        providers.forEach(provider => {
          const apiKey = provider === 'ollama' ? this.plugin.settings.ollamaServerUrl : this.plugin.settings[`${provider}ApiKey`];
          if (apiKey) {
            dropdown.addOption(provider, provider);
          }
        });
        dropdown.setValue(this.plugin.settings.selectedProvider)
          .onChange(async (value: ProviderName) => {
            this.plugin.settings.selectedProvider = value;
            this.plugin.updateMeshViewProvider(value as ProviderName)
            await this.plugin.saveSettings();
          });
      });
    
    new Setting(containerEl)
      .setName('Tavily API key')
      .setDesc('Enter your Tavily API key')
      .addText(text => text
        .setPlaceholder('Enter API key')
        .setValue(this.plugin.settings.tavilyApiKey)
        .onChange(async (value) => {
          this.plugin.settings.tavilyApiKey = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(containerEl)
    .setName('YouTube API key')
    .setDesc('Enter your YouTube API key for transcript fetching')
    .addText(text => text
      .setPlaceholder('Enter API key')
      .setValue(this.plugin.settings.youtubeApiKey)
      .onChange(async (value) => {
        this.plugin.settings.youtubeApiKey = value;
        await this.plugin.saveSettings();
      }));
    
    new Setting(containerEl)
      .setName('Custom patterns folder')
      .setDesc('Enter the name of the folder containing custom patterns. If it\'s in the root of your vault, just enter the folder name (e.g., "Custom Patterns").')
      .addText(text => text
        .setPlaceholder('Custom Patterns')
        .setValue(this.plugin.settings.customPatternsFolder)
        .onChange(async (value) => {
          this.plugin.settings.customPatternsFolder = value;
          await this.plugin.saveSettings();
        }));
    
      new Setting(containerEl)
        .setName('Fabric Patterns Folder')
        .setDesc('Folder where downloaded patterns will be saved')
        .addText(text => text
          .setPlaceholder('Enter folder path')
          .setValue(this.plugin.settings.fabricPatternsFolder)
          .onChange(async (value) => {
            this.plugin.settings.fabricPatternsFolder = value;
            await this.plugin.saveSettings();
          }));
    
      new Setting(containerEl)
      .setName('Download Patterns')
      .setDesc('Download patterns from GitHub')
      .addButton((btn: ButtonComponent) => {
        btn.setButtonText('Download')
          .onClick(async () => {
            const originalButtonText = btn.buttonEl.textContent || 'Download';
            btn.setDisabled(true);
            btn.buttonEl.addClass('loading');
            btn.setButtonText('Downloading...');
            
            try {
              await this.plugin.downloadPatternsFromGitHub();
              new Notice('Patterns downloaded successfully');
            } catch (error) {
              console.error('Error downloading patterns:', error);
              new Notice(`Failed to download patterns: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
              btn.setDisabled(false);
              btn.buttonEl.removeClass('loading');
              btn.setButtonText(originalButtonText);
              this.display(); // Refresh the settings view
            }
          });
      });


    new Setting(containerEl)
      .setName('Mesh output folder')
      .setDesc('Enter the name of the folder for Mesh AI output. If it\'s in the root of your vault, just enter the folder name.')
      .addText(text => text
        .setPlaceholder('Mesh Output')
        .setValue(this.plugin.settings.meshOutputFolder)
        .onChange(async (value) => {
          this.plugin.settings.meshOutputFolder = value;
          await this.plugin.saveSettings();
        }));
    
    // Add the debug enable setting
    new Setting(containerEl)
    .setName('Enable Debugging')
    .setDesc('Turn on console logging for debugging purposes')
    .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableDebugging)
        .onChange(async (value) => {
          this.plugin.settings.enableDebugging = value;
            const status = this.plugin.settings.enableDebugging ? 'enabled' : 'disabled';
            new Notice(`Debugging ${status}.`);
            await this.plugin.saveSettings();
        }));
  }

  async populateModelDropdown(dropdown: DropdownComponent, provider: ProviderName, forceRefresh: boolean = false) {
    dropdown.selectEl.disabled = true;
    try {
      let models: string[];
      if (forceRefresh) {
        models = await this.getModelsForProvider(provider);
      } else {
        models = this.plugin.settings.providerModels[provider] || await this.getModelsForProvider(provider);
      }
      
      dropdown.selectEl.empty();
      if (models && models.length > 0) {
        models.forEach(model => dropdown.addOption(model, model));
        
        // Check if there's a previously selected model
        const selectedModel = this.plugin.settings.providerModels[provider]?.[0];
        
        // If there's a selected model and it's in the list, use it. Otherwise, use the first model in the list.
        const modelToSelect = models.includes(selectedModel) ? selectedModel : models[0];
        
        dropdown.setValue(modelToSelect)
          .onChange(async (value) => {
            this.plugin.settings.providerModels[provider] = [value];
            await this.plugin.saveSettings();
          });
      } else {
        dropdown.addOption('', 'No models available');
        debugLog(this.plugin, `No models available for ${provider}`);
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching models for ${provider}:`, error);
      dropdown.addOption('error', 'Error fetching models');
    } finally {
      dropdown.selectEl.disabled = false;
    }
  }

  async getModelsForProvider(provider: ProviderName): Promise<string[]> {
    try {
      const providerInstance = this.plugin.getProvider(provider);
      if (providerInstance && 'getAvailableModels' in providerInstance) {
        return await providerInstance.getAvailableModels();
      }
    } catch (error) {
      debugLog(this.plugin, `Error fetching models for ${provider}:`, error);
    }
    return this.plugin.settings.providerModels[provider] || [];
  }
}