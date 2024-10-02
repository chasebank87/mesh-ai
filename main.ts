import { Plugin, WorkspaceLeaf, TFile, TFolder, requestUrl, Notice, normalizePath } from 'obsidian';
import { MeshView, MESH_VIEW_TYPE } from './views/MeshView';
import { SettingsView } from './views/SettingsView';
import { PluginSettings, DEFAULT_SETTINGS, ProviderName, Workflow, GitHubApiItem , SearchProviderName } from './types';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { GoogleProvider } from './providers/GoogleProvider';
import { MicrosoftProvider } from './providers/MicrosoftProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { GrocqProvider } from './providers/GrocqProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { YoutubeProvider } from './providers/YoutubeProvider';
import { TavilyProvider } from './providers/TavilyProvider';
import { debugLog } from './utils/MeshUtils';
import { ProcessActiveNoteModal } from './modals/ProcessActiveNoteModal';
import { ProcessClipboardModal } from 'modals/ProcessClipboardModal';
import { TavilySearchModal } from 'modals/TavilySearchModal';
import { TavilySearchModalWF } from 'modals/TavilySearchModalWF';
import { processWorkflow } from './utils/WorkflowUtils';
import { createOutputFile } from './utils/FileUtils';
import { processPatterns, processStitchedPatterns, getInputContent } from './utils/MeshUtils';
import { PerplexityProvider } from 'providers/PerplexityProvider';
import { OpenRouterProvider } from './providers/OpenRouterProvider';
import { LMStudioProvider } from './providers/LMStudioProvider';

export default class MeshAIPlugin extends Plugin {
  settings: PluginSettings;
  youtubeProvider: YoutubeProvider;
  tavilyProvider: TavilyProvider;
  perplexityProvider: PerplexityProvider;
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

    // Add the new commands
    this.addCommand({
      id: 'process-active-note',
      name: 'Process Active Note',
      callback: () => {
        new ProcessActiveNoteModal(this.app, this).open();
      }
    });

    this.addCommand({
      id: 'process-clipboard',
      name: 'Process Clipboard',
      callback: () => {
        new ProcessClipboardModal(this.app, this).open();
      }
    });

    this.addCommand({
      id: 'tavily-search',
      name: 'Tavily Search',
      callback: () => {
        new TavilySearchModal(this.app, this).open();
      }
    });

    // Add workflow commands
    this.createWorkflowCommands();

    this.addRibbonIcon('brain', 'Mesh AI Integration', () => {
      this.activateView();
    });
  }

  createWorkflowCommands() {
    // Remove existing workflow commands
    this.removeWorkflowCommands();
    
    // Add new workflow commands
    this.settings.workflows.forEach((workflow, index) => {
      this.addCommand({
          id: `mesh-ai-workflow-${index + 1}-active-note`,
          name: `Run Workflow: ${workflow.name} (Active Note)`,
          callback: () => this.runWorkflow(workflow, 'active-note'),
      });

      this.addCommand({
          id: `mesh-ai-workflow-${index + 1}-clipboard`,
          name: `Run Workflow: ${workflow.name} (Clipboard)`,
          callback: () => this.runWorkflow(workflow, 'clipboard'),
      });

      this.addCommand({
          id: `mesh-ai-workflow-${index + 1}-tavily`,
          name: `Run Workflow: ${workflow.name} (Tavily)`,
          callback: () => new TavilySearchModalWF(this.app, this, workflow).open(),
        });
    });
  }
  
  private removeWorkflowCommands() {
    // This method will be called when reloading commands
    // It doesn't need to do anything as Obsidian handles command cleanup automatically
}

  async runWorkflow(workflow: Workflow, inputType: 'active-note' | 'clipboard') {
    let notice = new Notice(`Running workflow: ${workflow.name}...`, 0);

    let input: string;
    try {
      let result: string;
      if (workflow.usePatternStitching) {
        input = await getInputContent(this.app, this, inputType)
        result = await processStitchedPatterns(this, workflow.provider, workflow.patterns, input);
      } else {
        input = await getInputContent(this.app, this, inputType)
        result = await processPatterns(this, workflow.provider, workflow.patterns, input);
      }
      const fileName = `Workflow Output ${new Date().toISOString().replace(/:/g, '-')}`;
      await createOutputFile(this, result, fileName);
      new Notice(`Workflow '${workflow.name}' processed successfully`);
    } catch (error) {
      console.error('Error processing workflow:', error);
      new Notice(`Error in workflow '${workflow.name}': ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      notice.hide();
    }
  }

  async loadParticlesJS() {
    return new Promise<void>((resolve) => {
      if (typeof (window as any).particlesJS === 'function') {
        console.log('particlesJS loaded successfully');
        resolve();
      } else {
        console.error('particlesJS is not available');
        resolve();
      }
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
    
    let leaf = workspace.getLeavesOfType(MESH_VIEW_TYPE)[0];
    
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: MESH_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      } else {
        leaf = workspace.getLeaf('split', 'vertical');
        await leaf.setViewState({ type: MESH_VIEW_TYPE, active: true });
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
    const normalizedPath = normalizePath(this.settings.fabricPatternsFolder);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
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
      const normalizedFolderPath = normalizePath(this.settings.fabricPatternsFolder);
      const fabricPatternsFolder = this.app.vault.getAbstractFileByPath(normalizedFolderPath);
      if (!(fabricPatternsFolder instanceof TFolder)) {
        await this.app.vault.createFolder(normalizedFolderPath);
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
          const filePath = normalizePath(`${this.settings.fabricPatternsFolder}/${fileName}`);
  
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
      case 'openrouter':
        return new OpenRouterProvider(this.settings.openrouterApiKey, this);
      case 'lmstudio':
        return new LMStudioProvider(this.settings.lmstudioServerUrl, this);
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  getSearchProvider(providerName: SearchProviderName) {
    switch (providerName) {
      case 'tavily':
        return new TavilyProvider(this.settings.tavilyApiKey, this);
      case 'perplexity':
        return new PerplexityProvider(this.settings.perplexityApiKey, this);
      default:
        throw new Error(`Unsupported search provider: ${providerName}`);
    }
  }

  reloadMeshView() {
    const meshLeaves = this.app.workspace.getLeavesOfType(MESH_VIEW_TYPE);
    meshLeaves.forEach((leaf) => {
      if (leaf.view instanceof MeshView) {
        (leaf.view as MeshView).onOpen();
      }
    });
  }
}