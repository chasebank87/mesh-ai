import { Plugin, WorkspaceLeaf, TFile, TFolder, requestUrl, Notice, normalizePath, MarkdownView } from 'obsidian';
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
import { AnalyzePathwaysModal } from 'modals/AnalyzePathwaysModal';

export default class MeshAIPlugin extends Plugin {
  settings: PluginSettings;
  youtubeProvider: YoutubeProvider;
  tavilyProvider: TavilyProvider;
  perplexityProvider: PerplexityProvider;
  async onload() {
    await this.loadSettings();
    this.fixFolderPaths();
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

    this.addCommand({
      id: 'analyze-pathways',
      name: 'Analyze Pathways',
      callback: () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          const content = activeView.getViewData();
          new AnalyzePathwaysModal(this.app, this, content).open();
        } else {
          new Notice('Please open a markdown file to analyze pathways.');
        }
      }
    });

    // Add workflow commands
    this.createWorkflowCommands();

    this.addRibbonIcon('brain', 'Mesh AI Integration', () => {
      this.activateView();
    });

    // Add process selection menu item
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        // Only add the menu item if there's selected text
        if (editor.getSelection()) {
          menu.addItem((item) => {
            item
              .setTitle('Mesh AI: Process Selection')
              .setIcon('brain')
              .onClick(async () => {
                // Copy the selected text to clipboard
                const selectedText = editor.getSelection();
                await navigator.clipboard.writeText(selectedText);
                
                // Open the process clipboard modal
                new ProcessClipboardModal(this.app, this).open();
              });
          });
        }
      })
    );
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
    const owner = 'danielmiessler';
    const repo = 'fabric';
    const repoApiBase = `https://api.github.com/repos/${owner}/${repo}`;

    try {
      // Ensure the Fabric Patterns folder exists
      const normalizedFolderPath = normalizePath(this.settings.fabricPatternsFolder);
      if (!normalizedFolderPath) {
        new Notice('Please set a Fabric patterns folder in Settings before downloading.');
        return;
      }

      const fabricPatternsFolder = this.app.vault.getAbstractFileByPath(normalizedFolderPath);
      if (!(fabricPatternsFolder instanceof TFolder)) {
        await this.app.vault.createFolder(normalizedFolderPath);
      }

      // Detect default branch
      const repoResponse = await requestUrl({ url: repoApiBase });
      const defaultBranch: string = (repoResponse.json as any)?.default_branch ?? 'main';

      // Retrieve the full tree to locate pattern files robustly
      const treeUrl = `${repoApiBase}/git/trees/${defaultBranch}?recursive=1`;
      const treeResponse = await requestUrl({ url: treeUrl });
      const tree = (treeResponse.json as any)?.tree as Array<{ path: string; type: string }> | undefined;

      if (!Array.isArray(tree)) {
        throw new Error('Unexpected GitHub API response: repository tree missing.');
      }

      // Candidate filenames within each pattern folder, in priority order
      const candidateNames = ['system.md', 'prompt.md', 'pattern.md', 'README.md', 'readme.md'];
      const candidateSet = new Set(candidateNames.map((n) => n.toLowerCase()));

      // Consider both legacy and current locations
      const validPrefixes = ['patterns/', 'data/patterns/'];

      // Build best-file-per-folder map by priority
      const folderToBest: Record<string, { path: string; priority: number } > = {};
      for (const item of tree) {
        if (item.type !== 'blob') continue;
        if (!validPrefixes.some((p) => item.path.startsWith(p))) continue;

        const parts = item.path.split('/');
        if (parts.length < 3) continue;
        const fileName = parts[parts.length - 1];
        const folderName = parts[parts.length - 2];
        const lower = fileName.toLowerCase();
        if (!candidateSet.has(lower)) continue;
        const priority = candidateNames.findIndex((n) => n.toLowerCase() === lower);
        if (priority === -1) continue;

        const existing = folderToBest[folderName];
        if (!existing || priority < existing.priority) {
          folderToBest[folderName] = { path: item.path, priority };
        }
      }

      const entries = Object.entries(folderToBest);
      if (entries.length === 0) {
        throw new Error('No pattern files found under /patterns or /data/patterns in the Fabric repository.');
      }

      let successCount = 0;
      let failCount = 0;

      for (const [patternName, best] of entries) {
        try {
          const destFileName = `${patternName}.md`;
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${best.path}`;
          const filePath = normalizePath(`${this.settings.fabricPatternsFolder}/${destFileName}`);

          // Fetch the content of the chosen file (system.md or fallback)
          const fileContent = await requestUrl({ url: rawUrl });

          // Check if the destination file already exists
          const existingFile = this.app.vault.getAbstractFileByPath(filePath);

          if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, fileContent.text);
            debugLog(this, `Updated existing file: ${destFileName}`);
          } else {
            await this.app.vault.create(filePath, fileContent.text);
            debugLog(this, `Created new file: ${destFileName}`);
          }

          successCount++;
        } catch (error) {
          debugLog(this, `Error processing ${best.path}:`, error);
          if (error instanceof Error) {
            debugLog(this, `Error message: ${error.message}`);
          }
          failCount++;
        }
      }

      new Notice(`Successfully downloaded/updated ${successCount} patterns. ${failCount} failed.`);
      await this.loadAllPatterns();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog(this, 'Error in downloadPatternsFromGitHub:', message);
      new Notice(`Failed to download patterns: ${message}`);
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

  fixFolderPaths() {
    const pathsToFix = ['customPatternsFolder', 'fabricPatternsFolder', 'meshOutputFolder'];
    let settingsChanged = false;

    for (const path of pathsToFix) {
      if (typeof this.settings[path] === 'string' && this.settings[path].includes('\\')) {
        this.settings[path] = (this.settings[path] as string).replace(/\\/g, '/');
        settingsChanged = true;
      }
    }

    if (settingsChanged) {
      this.saveSettings();
    }
  }
}