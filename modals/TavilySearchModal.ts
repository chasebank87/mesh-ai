import { Modal, App, Setting, Notice } from 'obsidian';
import MeshAIPlugin from '../main';
import { Workflow } from '../types';
import { processWorkflow } from '../utils/WorkflowUtils';
import { TavilyProvider } from '../providers/TavilyProvider';
import { createOutputFile } from 'utils/FileUtils';

export class TavilySearchModal extends Modal {
    plugin: MeshAIPlugin;
    workflow: Workflow;
    searchQuery: string = '';
    tavilyProvider: TavilyProvider;
    private loadingOverlay: HTMLElement;

    constructor(app: App, plugin: MeshAIPlugin, workflow: Workflow) {
        super(app);
        this.plugin = plugin;
        this.workflow = workflow;
        this.tavilyProvider = new TavilyProvider(this.plugin.settings.tavilyApiKey, this.plugin);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
    
        contentEl.addClass('mesh-modal-tavily');
    
        // Create loading overlay
        this.loadingOverlay = contentEl.createEl('div', { cls: 'mesh-loading-overlay' });
        this.loadingOverlay.createEl('div', { cls: 'mesh-loading-spinner' });
        this.loadingOverlay.style.display = 'none';
    
        // Add title
        contentEl.createEl('h2', { text: 'Tavily Search', cls: 'mesh-modal-tavily-title' });
    
        // Create search container
        const searchContainer = contentEl.createEl('div', { cls: 'mesh-modal-tavily-search-container' });
    
        // Add search input
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter your search query',
            cls: 'mesh-tavily-input'
        });
        searchInput.addEventListener('input', (e) => this.searchQuery = (e.target as HTMLInputElement).value);
    
        // Add search icon
        searchContainer.createEl('span', { text: '🔍', cls: 'mesh-modal-tavily-search-icon' });
    
        // Add run workflow button
        const runButton = contentEl.createEl('button', {
            text: 'Run Workflow',
            cls: 'mesh-modal-tavily-button'
        });
        runButton.addEventListener('click', () => this.runWorkflow());
    }

    async runWorkflow() {
        if (!this.searchQuery) {
            new Notice('Please enter a search query');
            return;
        }

        try {
            this.showLoading();
            const tavilyResult = await this.tavilyProvider.search(this.searchQuery);
            const result = await processWorkflow(this.plugin, this.workflow, tavilyResult);
            const fileName = `Workflow Output ${new Date().toISOString().replace(/:/g, '-')}`
            await createOutputFile(this.plugin, result, fileName);
            new Notice('Workflow processed successfully');
            this.close();
        } catch (error) {
            console.error('Error processing workflow:', error);
            new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.hideLoading();
        }
    }

    private showLoading() {
        this.loadingOverlay.style.display = 'flex';
    }

    private hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}