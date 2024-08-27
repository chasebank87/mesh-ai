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

        // Create loading overlay
        this.loadingOverlay = contentEl.createEl('div', { cls: 'mesh-loading-overlay' });
        this.loadingOverlay.createEl('div', { cls: 'mesh-loading-spinner' });
        this.loadingOverlay.style.display = 'none';

        new Setting(contentEl)
            .setName('Tavily Search Query')
            .addText(text => text
                .setPlaceholder('Enter your search query')
                .onChange(value => this.searchQuery = value));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Run Workflow')
                .setCta()
                .onClick(() => this.runWorkflow()));
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