import { App, PluginSettingTab, Setting, DropdownComponent, ButtonComponent, Notice } from 'obsidian';
import { PluginSettings, ProviderName, SupportedProviderName } from '../types';
import MeshAIPlugin from '../main';
import { debugLog } from '../utils/MeshUtils';
import { MeshView } from './MeshView';

export class SettingsView extends PluginSettingTab {
  plugin: MeshAIPlugin;
  workflowContainer: HTMLElement;

  constructor(app: App, plugin: MeshAIPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const {containerEl} = this;
    containerEl.empty();

    const providers: ProviderName[] = ['openai', 'google', 'microsoft', 'anthropic', 'grocq', 'openrouter', 'ollama', 'lmstudio'];
    const supportedProviders: SupportedProviderName[] = ['openai', 'grocq', 'ollama', 'openrouter', 'lmstudio'];

    for (const provider of providers) {
      const providerContainer = containerEl.createEl('div', { cls: 'mesh-provider-container' });
      providerContainer.createEl('h3', { text: provider.charAt(0).toUpperCase() + provider.slice(1) });

      if (!supportedProviders.includes(provider as SupportedProviderName)) {
        const overlay = providerContainer.createEl('div', { cls: 'mesh-overlay' });
        overlay.createEl('p', { text: 'Coming soon' });
      }

      if (provider === 'ollama') {
        new Setting(providerContainer)
          .setName(`Ollama server URL`)
          .setDesc('Enter the URL for your Ollama server')
          .addText(text => text
            .setPlaceholder('Enter URL')
            .setValue(this.plugin.settings.ollamaServerUrl)
            .onChange(async (value) => {
              this.plugin.settings.ollamaServerUrl = value;
              await this.plugin.saveSettings();
            }));
      } else if (provider === 'microsoft') {
        new Setting(providerContainer)
          .setName('Microsoft Azure API key')
          .setDesc('Enter your Microsoft Azure API key')
          .addText(text => text
            .setPlaceholder('Enter API key')
            .setValue(this.plugin.settings.microsoftApiKey)
            .onChange(async (value) => {
              this.plugin.settings.microsoftApiKey = value;
              await this.plugin.saveSettings();
            }));
    
        new Setting(providerContainer)
          .setName('Microsoft Azure Endpoint URL')
          .setDesc('Enter your Microsoft Azure Endpoint URL')
          .addText(text => text
            .setPlaceholder('Enter Endpoint URL')
            .setValue(this.plugin.settings.microsoftEndpointUrl || '')
            .onChange(async (value) => {
              this.plugin.settings.microsoftEndpointUrl = value;
              await this.plugin.saveSettings();
            }));
      } else if (provider === 'lmstudio') {
        new Setting(providerContainer)
          .setName(`LMStudio server URL`)
          .setDesc('Enter the URL for your LMStudio server')
          .addText(text => text
            .setPlaceholder('Enter URL')
            .setValue(this.plugin.settings.lmstudioServerUrl)
            .onChange(async (value) => {
              this.plugin.settings.lmstudioServerUrl = value;
              await this.plugin.saveSettings();
            }));
      } else {
        new Setting(providerContainer)
          .setName(`API key`)
          .setDesc(`Enter your ${provider} API key`)
          .addText(text => text
            .setPlaceholder('Enter API key')
            .setValue(this.plugin.settings[`${provider}ApiKey`])
            .onChange(async (value) => {
              (this.plugin.settings[`${provider}ApiKey` as keyof PluginSettings] as string) = value;
              await this.plugin.saveSettings();
            })
          )
          .addButton(button => button
            .setButtonText('Test API Key')
            .onClick(async () => {
              await this.testApiKey(provider);
            })
          );
      }

      // Add model selection
      const modelSetting = new Setting(providerContainer)
        .setName(`Model`)
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

    // Add default provider setting
    new Setting(containerEl)
    .setName('Default Provider')
      .setDesc('Select the default AI provider. You must reload the plugin for the change to take effect.')
    // Use SupportedProviderName instead of ProviderName
    .addDropdown(dropdown => {
      supportedProviders.forEach(provider => {
        dropdown.addOption(provider, provider.charAt(0).toUpperCase() + provider.slice(1));
      });
      dropdown.setValue(this.plugin.settings.selectedProvider);
      dropdown.onChange(async (value) => {
        this.plugin.settings.selectedProvider = value as ProviderName;
        await this.plugin.saveSettings();
      });
    });

    new Setting(containerEl)
    .setName('Use Perplexity')
    .setDesc('Enable Perplexity integration (disables Tavily)')
    .addToggle(toggle => toggle
      .setValue(this.plugin.settings.usePerplexity)
      .onChange(async (value) => {
        this.plugin.settings.usePerplexity = value;
        await this.plugin.saveSettings();
        this.display(); // Refresh the settings view
      }));
      const perplexityNote = containerEl.createEl('div', {
        cls: 'setting-item-description',
        text: 'Note: Currently, the Perplexity API does not support returning citations or images as these features are in closed beta. Additionally, the Perplexity API is a paid feature. After enabling Perplexity close and reopen the plugin for the change to take effect.'
      });
      perplexityNote.style.marginTop = '10px';
      perplexityNote.style.marginBottom = '20px';
      perplexityNote.style.color = 'var(--text-muted)';
    

  if (this.plugin.settings.usePerplexity) {
    new Setting(containerEl)
      .setName('Perplexity API Key')
      .setDesc('Enter your Perplexity API key')
      .addText(text => text
        .setPlaceholder('Enter API key')
        .setValue(this.plugin.settings.perplexityApiKey)
        .onChange(async (value) => {
          this.plugin.settings.perplexityApiKey = value;
          await this.plugin.saveSettings();
        }));
  } else {
    // Tavily API key setting (only show if Perplexity is not enabled)
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
  }
    
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
      .setDesc('Enter the path to your custom patterns folder')
      .addText(text => text
        .setPlaceholder('Custom Patterns')
        .setValue(this.plugin.settings.customPatternsFolder)
        .onChange(async (value) => {
          this.plugin.settings.customPatternsFolder = value.replace(/\\/g, '/');
          await this.plugin.saveSettings();
        }));
    
      new Setting(containerEl)
        .setName('Fabric patterns folder')
        .setDesc('Enter the path to the fabric patterns folder')
        .addText(text => text
          .setPlaceholder('Fabric Patterns')
          .setValue(this.plugin.settings.fabricPatternsFolder)
          .onChange(async (value) => {
            this.plugin.settings.fabricPatternsFolder = value.replace(/\\/g, '/');
            await this.plugin.saveSettings();
          }));
    
      new Setting(containerEl)
      .setName('Download patterns')
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
          this.plugin.settings.meshOutputFolder = value.replace(/\\/g, '/');
          await this.plugin.saveSettings();
        }));
    
    // Workflows section
    this.containerEl.createEl('h2', { text: 'Workflows' });
    this.workflowContainer = this.containerEl.createEl('div');
    this.displayWorkflows();

    new Setting(this.containerEl)
        .setName('Add Workflow')
        .addButton(button => button
            .setButtonText('Add')
            .onClick(() => this.addWorkflow()));

    // Pathways section
    this.containerEl.createEl('h2', { text: 'Pathways Settings' });

    const pathwaysNotice = this.containerEl.createEl('div', {
        cls: 'setting-item-description',
        text: 'Currently, analyzing pathways is only supported using OpenRouter with either the o1-preview or o1-mini (o1-preview drastically out performs o1-mini which will result in better pathway analysis) models for their advanced reasoning capabilities. If cheaper models with similar performance are found in the future, they will be added as options. The o1 model is only for analysis of suggested pathways, creating backlinks will use the default provider and model.'
    });
    pathwaysNotice.style.marginBottom = '20px';
    pathwaysNotice.style.color = 'var(--text-muted)';

    new Setting(this.containerEl)
        .setName('Pathways Model')
        .setDesc('Select the model to use for pathway analysis')
        .addDropdown(dropdown => dropdown
            .addOption('o1-preview', 'o1-preview')
            .addOption('o1-mini', 'o1-mini')
            .setValue(this.plugin.settings.pathwaysModel)
            .onChange(async (value) => {
                this.plugin.settings.pathwaysModel = value as 'o1-preview' | 'o1-mini';
                await this.plugin.saveSettings();
            }));

    new Setting(this.containerEl)
        .setName('Pathways Output Folder')
        .setDesc('Enter the path for the Pathways output folder')
        .addText(text => text
            .setPlaceholder('Pathways')
            .setValue(this.plugin.settings.pathwaysOutputFolder)
            .onChange(async (value) => {
                this.plugin.settings.pathwaysOutputFolder = value;
                await this.plugin.saveSettings();
            }));

    new Setting(this.containerEl)
        .setName('Default Pathway Workflow')
        .setDesc('Select the default workflow to use for pathway creation. This workflow will be used to create backlinks for each pathway.')
        .addDropdown(dropdown => {
            this.plugin.settings.workflows.forEach(workflow => {
                dropdown.addOption(workflow.name, workflow.name);
            });
            dropdown.setValue(this.plugin.settings.defaultPathwayWorkflow || '')
                .onChange(async (value) => {
                    this.plugin.settings.defaultPathwayWorkflow = value;
                    await this.plugin.saveSettings();
                });
        });
    
    // Add the debug enable setting
    new Setting(containerEl)
    .setName('Enable debugging')
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

  displayWorkflows() {
    this.workflowContainer.empty();
    this.plugin.settings.workflows.forEach((workflow, index) => {
        const workflowSetting = new Setting(this.workflowContainer)
            .setName(`Workflow ${index + 1}`)
            .addText(text => text
                .setPlaceholder('Workflow name')
                .setValue(workflow.name)
                .onChange(async (value) => {
                    workflow.name = value;
                    await this.plugin.saveSettings();
                    this.plugin.createWorkflowCommands();
                }))
            .addDropdown(dropdown => {
                const providers = ['openai', 'google', 'microsoft', 'anthropic', 'grocq', 'ollama', 'openrouter'];
                providers.forEach(provider => dropdown.addOption(provider, provider));
                dropdown.setValue(workflow.provider)
                    .onChange(async (value) => {
                        workflow.provider = value as ProviderName;
                        await this.plugin.saveSettings();
                        this.plugin.createWorkflowCommands();
                    });
            })
            .addText(text => text
                .setPlaceholder('Pattern names (comma-separated)')
                .setValue(workflow.patterns.join(', '))
                .onChange(async (value) => {
                    workflow.patterns = value.split(',').map(p => p.trim());
                    await this.plugin.saveSettings();
                    this.plugin.createWorkflowCommands();
                }))
            .addToggle(toggle => toggle
                .setValue(workflow.usePatternStitching)
                .setTooltip('Use pattern stitching')
                .onChange(async (value) => {
                    workflow.usePatternStitching = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText('Delete')
                .onClick(async () => {
                    this.plugin.settings.workflows.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.displayWorkflows();
                    this.plugin.createWorkflowCommands();
                }));
    });
  }

  async addWorkflow() {
    this.plugin.settings.workflows.push({
        name: 'New Workflow',
        provider: 'openai',
        patterns: [],
        usePatternStitching: false
    });
    await this.plugin.saveSettings();
    this.displayWorkflows();
    this.plugin.createWorkflowCommands();
  }

  async populateModelDropdown(dropdown: DropdownComponent, provider: ProviderName, forceRefresh: boolean = false) {
    dropdown.selectEl.disabled = true;
    try {
      let models: string[];
      if (forceRefresh) {
        models = await this.getModelsForProvider(provider);
        // Update the settings with the new models
        this.plugin.settings.providerModels[provider] = models;
        await this.plugin.saveSettings();
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
        
        // Set the initial value and save it
        dropdown.setValue(modelToSelect);
        this.plugin.settings.providerModels[provider] = [modelToSelect];
        await this.plugin.saveSettings();

        // Add onChange event listener
        dropdown.onChange(async (value) => {
          this.plugin.settings.providerModels[provider] = [value];
          await this.plugin.saveSettings();
          debugLog(this.plugin, `Model for ${provider} set to: ${value}`);
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

    async testApiKey(provider: ProviderName): Promise<void> {
      try {
        const apiKey = provider === 'ollama' 
          ? this.plugin.settings.ollamaServerUrl 
          : this.plugin.settings[`${provider}ApiKey`];

        if (!apiKey) {
          new Notice(`Please enter an API key for ${provider}`);
          return;
        }

        const providerInstance = this.plugin.getProvider(provider);
        await providerInstance.getAvailableModels();
        new Notice(`API key for ${provider} is valid`);

        // Refresh the model dropdown
        const modelSetting = this.containerEl.querySelector(`.mesh-provider-setting[data-provider="${provider}"] .dropdown`) as HTMLSelectElement;
        if (modelSetting) {
          const modelDropdown = new DropdownComponent(modelSetting);
          await this.populateModelDropdown(modelDropdown, provider, true);
        }
      } catch (error) {
        console.error(`Error testing API key for ${provider}:`, error);
        new Notice(`Failed to validate API key for ${provider}: ${error.message}`);
      }
    }

    hide() {
      super.hide();
      this.plugin.reloadMeshView();
    }
  }