import { Modal, App, Setting, Notice, MarkdownView, setIcon } from 'obsidian';
import { processStitchedPatterns, processPatterns } from '../utils/MeshUtils';
import MeshAIPlugin from '../main';
import { PATHWAYS_PROMPT_TEMPLATE } from '../constants/promptTemplates';
import { PATHWAY_INSTRUCTIONS } from '../constants/strings';
import { debugLog } from '../utils/MeshUtils';

export class AnalyzePathwaysModal extends Modal {
    plugin: MeshAIPlugin;
    content: string;
    pathways: any[];
    loadingOverlay: HTMLElement;

    constructor(app: App, plugin: MeshAIPlugin, content: string) {
        super(app);
        this.plugin = plugin;
        this.content = content;
        this.pathways = [];
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mesh-analyze-pathways-modal');

        contentEl.createEl('h2', { text: 'Analyze Pathways', cls: 'modal-header' });

       // Add warning message
       const warningEl = contentEl.createEl('p', { 
        text: 'Warning: Using o1 models can be expensive. Check the pricing from OpenRouter before continuing.', 
        cls: 'mesh-warning-message' 
       });
      
        // Create loading overlay
        this.loadingOverlay = contentEl.createEl('div', { cls: 'mesh-analyze-pathways-loading-overlay' });
        this.loadingOverlay.createEl('div', { cls: 'mesh-analyze-pathways-loading-spinner' });
        this.loadingOverlay.addClass('hidden');

        new Setting(contentEl)
            .setName('Confirm Analysis')
            .setDesc('Click to analyze the current document and suggest pathways.')
            .addButton(button => button
                .setButtonText('Analyze')
                .onClick(() => this.analyzePathways()));
    }

    async analyzePathways() {
        this.showLoading();
        debugLog(this.plugin, 'Starting analyzePathways');
        try {
            const provider = this.plugin.getProvider('openrouter');
            debugLog(this.plugin, 'Using provider: openrouter');
            
            // Get all files in the vault
            const fileList = await this.getAllFiles();
            const inputWithFiles = this.content + '\n\n<files>\n' + fileList + '\n</files>';
            
            const response = await provider.generateResponse(PATHWAYS_PROMPT_TEMPLATE + '\n\nInput:\n' + inputWithFiles);
            debugLog(this.plugin, 'Received response from provider');
            debugLog(this.plugin, `Response: ${response}`);
            
            // Sanitize the response
            const sanitizedResponse = response.replace(/[\n\r\t]/g, '').replace(/\s+/g, ' ');
            
            this.pathways = JSON.parse(sanitizedResponse);
            debugLog(this.plugin, `Parsed pathways: ${JSON.stringify(this.pathways)}`);
            this.displayPathways();
        } catch (error) {
            debugLog(this.plugin, `Error in analyzePathways: ${error.message}`);
            new Notice(`Error analyzing pathways: ${error.message}`);
            console.error(error);
        } finally {
            this.hideLoading();
        }
    }

    // Get all files in the vault without paths
    async getAllFiles(): Promise<string> {
      const files = this.app.vault.getFiles();
      return files.map(file => file.name).join('\n');
    }

    displayPathways() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Suggested Pathways', cls: 'modal-header' });

        // Add instructions
        const instructionsEl = contentEl.createEl('div', { cls: 'mesh-instructions' });
        instructionsEl.innerHTML = PATHWAY_INSTRUCTIONS;

        const pathwayList = contentEl.createEl('div', { cls: 'pathway-list' });
        this.pathways.forEach((pathway, index) => {
            const pathwayItem = pathwayList.createEl('div', { cls: 'pathway-item' });
            
            const pathwayHeader = pathwayItem.createEl('div', { cls: 'pathway-header' });
            pathwayHeader.createEl('span', { text: pathway.backlink, cls: 'pathway-backlink' });
            
            const buttonContainer = pathwayHeader.createEl('div', { cls: 'button-container' });
            const createButton = buttonContainer.createEl('button', { text: 'Create', cls: 'create-pathway-button' });
            createButton.onclick = () => this.createPathway(pathway, pathwayItem);

            const deleteButton = buttonContainer.createEl('button', { text: 'Delete', cls: 'delete-pathway-button hidden' });
            deleteButton.onclick = () => this.deletePathway(pathway, pathwayItem);

            // Check if potential links exist and create a sublist for them
            if (pathway['potential links'] && pathway['potential links'].length > 0) {
                const potentialLinksHeader = pathwayItem.createEl('h4', { text: 'Found Links:', cls: 'potential-links-header' });
                const potentialLinksList = pathwayItem.createEl('ul', { cls: 'potential-links-list' });
                pathway['potential links'].forEach((link: string) => {
                    const linkItem = potentialLinksList.createEl('li', { cls: 'potential-link-item' });
                    linkItem.createEl('span', { text: link, cls: 'potential-link-text' });
                    const linkButton = linkItem.createEl('button', { text: 'Link', cls: 'link-button' });
                    linkButton.onclick = () => this.createPotentialLink(pathway, link, linkItem);
                    const deleteLinkButton = linkItem.createEl('button', { text: 'Delete', cls: 'delete-link-button hidden' });
                    deleteLinkButton.onclick = () => this.deletePotentialLink(link, linkItem);
                });
            }
        });

        const createAllButton = contentEl.createEl('button', { 
            text: 'Create All', 
            cls: 'create-all-button' 
        });
        createAllButton.onclick = () => this.createAllPathways();

        // Add scroll indicator
        const scrollIndicator = contentEl.createEl('div', { cls: 'scroll-indicator' });
        scrollIndicator.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevrons-down"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>';
    }

    async createPathway(pathway: any, pathwayItem?: HTMLElement) {
        if (pathwayItem) {
            this.showItemLoading(pathwayItem);
        } else {
            this.showLoading();
        }
        debugLog(this.plugin, `Starting createPathway for ${pathway.backlink}`);
        const { backlink, content: question, match } = pathway;
        const folderPath = this.plugin.settings.pathwaysOutputFolder;
        const filePath = `${folderPath}/${backlink}.md`;

        try {
            // Get the selected workflow
            const workflowName = this.plugin.settings.defaultPathwayWorkflow;
            const workflow = this.plugin.settings.workflows.find(w => w.name === workflowName);
            
            if (!workflow) {
                throw new Error('No default pathway workflow selected');
            }

            // Search using Tavily or Perplexity
            const searchProvider = this.plugin.settings.pathwaysSearchProvider === 'tavily' ? this.plugin.tavilyProvider : this.plugin.perplexityProvider;
            const searchResults = await searchProvider.search(question);

            // Process the search results using the workflow patterns
            let processedContent: string;
            if (workflow.usePatternStitching) {
                processedContent = await processStitchedPatterns(this.plugin, workflow.provider, workflow.patterns, searchResults);
            } else {
                processedContent = await processPatterns(this.plugin, workflow.provider, workflow.patterns, searchResults);
            }

            // Create the backlink file with the processed content
            await this.app.vault.create(filePath, processedContent);
            debugLog(this.plugin, `Created file: ${filePath}`);

            // Insert the backlink in the current document
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                const editor = activeView.editor;
                const documentContent = editor.getValue();
                const insertPosition = documentContent.indexOf(match) + match.length;
                editor.replaceRange(` [[${backlink}]]`, editor.offsetToPos(insertPosition));
                debugLog(this.plugin, `Inserted backlink: [[${backlink}]]`);
            } else {
                debugLog(this.plugin, 'No active view found for inserting backlink');
            }

            // Update the UI
            if (pathwayItem) {
                const createButton = pathwayItem.querySelector('.create-pathway-button');
                const deleteButton = pathwayItem.querySelector('.delete-pathway-button');
                
                if (createButton) createButton.addClass('hidden');
                if (deleteButton) deleteButton.removeClass('hidden');
            }

            new Notice(`Pathway created: ${backlink}`);
        } catch (error) {
            debugLog(this.plugin, `Error in createPathway: ${error.message}`);
            new Notice(`Error creating pathway: ${error.message}`);
            console.error(error);
        } finally {
            if (pathwayItem) {
                this.hideItemLoading(pathwayItem);
            } else {
                this.hideLoading();
            }
        }
    }

    async createPotentialLink(pathway: any, link: string, linkItem: HTMLElement) {
        this.showItemLoading(linkItem);
        try {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                const editor = activeView.editor;
                const documentContent = editor.getValue();
                const insertPosition = documentContent.length;
                editor.replaceRange(`\n[[${link}]]`, editor.offsetToPos(insertPosition));
                debugLog(this.plugin, `Created potential link: [[${link}]]`);
            }

            // Update the UI
            const linkButton = linkItem.querySelector('.link-button');
            if (linkButton) linkButton.remove();

            const existingDeleteButton = linkItem.querySelector('.delete-link-button');
            if (existingDeleteButton) {
                existingDeleteButton.removeClass('hidden');
            } else {
                const deleteButton = linkItem.createEl('button', { text: 'Delete', cls: 'delete-link-button' });
                deleteButton.onclick = () => this.deletePotentialLink(link, linkItem);
            }

            new Notice(`Potential link created: ${link}`);
        } catch (error) {
            debugLog(this.plugin, `Error in createPotentialLink: ${error.message}`);
            new Notice(`Error creating potential link: ${error.message}`);
            console.error(error);
        } finally {
            this.hideItemLoading(linkItem);
        }
    }

    async createAllPathways() {
        this.showLoading();
        for (const pathway of this.pathways) {
            await this.createPathway(pathway);
        }
        this.hideLoading();
        this.close();
    }

    showLoading() {
        this.loadingOverlay.removeClass('hidden');
    }

    hideLoading() {
        this.loadingOverlay.addClass('hidden');
    }

    showItemLoading(item: HTMLElement) {
        const loadingOverlay = item.createEl('div', { cls: 'mesh-analyze-pathways-loading-overlay' });
        loadingOverlay.createEl('div', { cls: 'mesh-analyze-pathways-loading-spinner' });
    }

    hideItemLoading(item: HTMLElement) {
        const loadingOverlay = item.querySelector('.mesh-analyze-pathways-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    async deletePotentialLink(link: string, linkItem: HTMLElement) {
        try {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                const editor = activeView.editor;
                const documentContent = editor.getValue();
                const linkRegex = new RegExp(`\\[\\[${link}\\]\\]`, 'g');
                const newContent = documentContent.replace(linkRegex, '');
                editor.setValue(newContent);
                debugLog(this.plugin, `Deleted potential link: [[${link}]]`);
            }

            // Update the UI
            const deleteButton = linkItem.querySelector('.delete-link-button');
            if (deleteButton) deleteButton.remove();

            const existingLinkButton = linkItem.querySelector('.link-button');
            if (existingLinkButton) {
                existingLinkButton.removeClass('hidden');
            } else {
                const linkButton = linkItem.createEl('button', { text: 'Link', cls: 'link-button' });
                linkButton.onclick = () => this.createPotentialLink(null, link, linkItem);
            }

            new Notice(`Potential link deleted: ${link}`);
        } catch (error) {
            debugLog(this.plugin, `Error in deletePotentialLink: ${error.message}`);
            new Notice(`Error deleting potential link: ${error.message}`);
            console.error(error);
        }
    }

    async deletePathway(pathway: any, pathwayItem: HTMLElement) {
        this.showItemLoading(pathwayItem);
        debugLog(this.plugin, `Starting deletePathway for ${pathway.backlink}`);
        const { backlink, match } = pathway;
        const folderPath = this.plugin.settings.pathwaysOutputFolder;
        const filePath = `${folderPath}/${backlink}.md`;

        try {
            // Delete the file
            await this.app.vault.adapter.remove(filePath);
            debugLog(this.plugin, `Deleted file: ${filePath}`);

            // Remove the backlink from the current document
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                const editor = activeView.editor;
                const documentContent = editor.getValue();
                const newContent = documentContent.replace(` [[${backlink}]]`, '');
                editor.setValue(newContent);
                debugLog(this.plugin, `Removed backlink: [[${backlink}]]`);
            }

            // Update the UI
            const deleteButton = pathwayItem.querySelector('.delete-pathway-button');
            const createButton = pathwayItem.querySelector('.create-pathway-button');
            
            if (deleteButton) deleteButton.addClass('hidden');
            if (createButton) createButton.removeClass('hidden');

            new Notice(`Pathway deleted: ${backlink}`);
        } catch (error) {
            debugLog(this.plugin, `Error in deletePathway: ${error.message}`);
            new Notice(`Error deleting pathway: ${error.message}`);
            console.error(error);
        } finally {
            this.hideItemLoading(pathwayItem);
        }
    }
}