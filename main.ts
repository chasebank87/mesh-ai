import { Plugin, WorkspaceLeaf, TFile, TFolder, requestUrl, Notice } from 'obsidian';
import { MeshView, MESH_VIEW_TYPE } from './views/MeshView';
import { SettingsView } from './views/SettingsView';
import { PluginSettings, DEFAULT_SETTINGS, ProviderName } from './types';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { GoogleProvider } from './providers/GoogleProvider';
import { MicrosoftProvider } from './providers/MicrosoftProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { GrocqProvider } from './providers/GrocqProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { YoutubeProvider } from './providers/YoutubeProvider';
import { TavilyProvider } from './providers/TavilyProvider';
import { debugLog } from './utils/MeshUtils';
import { GitHubApiItem } from './types';

export default class MeshAIPlugin extends Plugin {
  settings: PluginSettings;
  youtubeProvider: YoutubeProvider;
  tavilyProvider: TavilyProvider;
  
  async onload() {
    await this.loadSettings();
    await this.loadParticlesJS();
    this.youtubeProvider = new YoutubeProvider(this);
    this.tavilyProvider = new TavilyProvider(this.settings.tavilyApiKey, this);
    
    this.addSettingTab(new SettingsView(this.app, this));
    
    this.registerView(
      MESH_VIEW_TYPE,
      (leaf) => new MeshView(leaf, this)
    );

    this.addRibbonIcon('brain', 'Mesh AI Integration', () => {
      this.activateView();
    });
  }

  async loadParticlesJS() {
    return new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;
    
    workspace.detachLeavesOfType(MESH_VIEW_TYPE);
    
    let leaf = workspace.getLeavesOfType(MESH_VIEW_TYPE)[0];
    
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: MESH_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      } else {
        debugLog(this, 'Failed to create a new leaf for Mesh AI view');
        return;
      }
    }
    
    workspace.revealLeaf(leaf);
  }

  async loadAllPatterns(): Promise<string[]> {
    const customPatterns = await this.loadCustomPatterns();
    const fabricPatterns = await this.loadFabricPatterns();
    return [...new Set([...customPatterns, ...fabricPatterns])].sort();
  }


  async loadCustomPatterns(): Promise<string[]> {
    const folder = this.app.vault.getAbstractFileByPath(this.settings.customPatternsFolder);
    const patterns: string[] = [];
  
    if (folder instanceof TFolder) {
      for (const file of folder.children) {
        if (file instanceof TFile && file.extension === 'md') {
          patterns.push(file.basename);
        }
      }
    }
  
    return patterns.sort();
  }

  async loadFabricPatterns(): Promise<string[]> {
    const folder = this.app.vault.getAbstractFileByPath(this.settings.fabricPatternsFolder);
    const patterns: string[] = [];
  
    if (folder instanceof TFolder) {
      for (const file of folder.children) {
        if (file instanceof TFile && file.extension === 'md') {
          patterns.push(file.basename);
        }
      }
    }
  
    return patterns.sort();
  }

  async downloadPatternsFromGitHub() {
    const apiUrl = 'https://api.github.com/repos/danielmiessler/fabric/contents/patterns';
    const baseRawUrl = 'https://raw.githubusercontent.com/danielmiessler/fabric/main/patterns';
    
    try {
      // Ensure the Fabric Patterns folder exists
      const fabricPatternsFolder = this.app.vault.getAbstractFileByPath(this.settings.fabricPatternsFolder);
      if (!(fabricPatternsFolder instanceof TFolder)) {
        await this.app.vault.createFolder(this.settings.fabricPatternsFolder);
      }
  
      // Fetch the list of folders in the patterns directory
      const response = await requestUrl({ url: apiUrl });
      const items = response.json as GitHubApiItem[];
      const folders = items.filter((item) => item.type === 'dir');
  
      let successCount = 0;
      let failCount = 0;
  
      for (const folder of folders) {
        try {
          const fileName = `${folder.name}.md`;
          const fileUrl = `${baseRawUrl}/${folder.name}/system.md`;
          const filePath = `${this.settings.fabricPatternsFolder}/${fileName}`;
  
          // Fetch the content of the system.md file
          const fileContent = await requestUrl({ url: fileUrl });
          
          // Check if the file already exists
          const existingFile = this.app.vault.getAbstractFileByPath(filePath);
          
          if (existingFile instanceof TFile) {
            // If file exists, update its content
            await this.app.vault.modify(existingFile, fileContent.text);
            debugLog(this, `Updated existing file: ${fileName}`);
          } else {
            // If file doesn't exist, create it
            await this.app.vault.create(filePath, fileContent.text);
            debugLog(this, `Created new file: ${fileName}`);
          }
          
          successCount++;
        } catch (error) {
          debugLog(this, `Error processing ${folder.name}:`, error);
          if (error instanceof Error) {
            debugLog(this, `Error message: ${error.message}`);
            debugLog(this, `Error stack: ${error.stack}`);
          }
          failCount++;
        }
      }
  
      new Notice(`Successfully downloaded/updated ${successCount} patterns. ${failCount} failed.`);
      await this.loadAllPatterns();
    } catch (error) {
      debugLog(this, 'Error in downloadPatternsFromGitHub:', error);
      new Notice(`Failed to download patterns: ${error.message}`);
    }
  }
  
  async clearFabricPatternsFolder() {
    const fabricPatternsFolder = this.app.vault.getAbstractFileByPath(this.settings.fabricPatternsFolder);
    if (fabricPatternsFolder instanceof TFolder) {
      for (const file of fabricPatternsFolder.children) {
        if (file instanceof TFile) {
          await this.app.fileManager.trashFile(file);
        }
      }
    } else {
      // If the folder doesn't exist, create it
      await this.app.vault.createFolder(this.settings.fabricPatternsFolder);
    }
  }

  getProvider(providerName: ProviderName) {
    switch (providerName) {
      case 'openai':
        return new OpenAIProvider(this.settings.openaiApiKey, this);
      case 'google':
        return new GoogleProvider(this.settings.googleApiKey, this);
      case 'microsoft':
        return new MicrosoftProvider(this.settings.microsoftApiKey, this);
      case 'anthropic':
        return new AnthropicProvider(this.settings.anthropicApiKey, this);
      case 'grocq':
        return new GrocqProvider(this.settings.grocqApiKey, this);
      case 'ollama':
        return new OllamaProvider(this.settings.ollamaServerUrl, this);
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }
}