import { Modal, App, Setting, TextComponent, Notice, DropdownComponent } from 'obsidian';
import MeshAIPlugin from '../main';
import { ProviderName } from '../types';
import { onPatternSearch, searchPatterns, onPatternSelect, updateSelectedPatternsDisplay } from '../utils/PatternUtils';
import { processPatterns, processStitchedPatterns } from '../utils/MeshUtils';
import { createOutputFile } from '../utils/FileUtils';

export class ProcessClipboardModal extends Modal {
    plugin: MeshAIPlugin;
    selectedProvider: ProviderName;
    outputFileNameInput: HTMLInputElement;
    private patternInput: TextComponent;
    private patternResults: HTMLElement;
    private selectedPatterns: string[] = [];
    private selectedPatternsContainer: HTMLElement;
    private selectedPatternsTitle: HTMLElement;
    private providerSelect: DropdownComponent;
    private loadingOverlay: HTMLElement;
    private clipboardPreview: HTMLTextAreaElement;
  
    constructor(app: App, plugin: MeshAIPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Create loading overlay
        this.loadingOverlay = contentEl.createEl('div', { cls: 'mesh-loading-overlay' });
        this.loadingOverlay.createEl('div', { cls: 'mesh-loading-spinner' });
        this.loadingOverlay.style.display = 'none';

        // Provider selection
        const PROVIDERS: Record<ProviderName, ProviderName> = {
            openai: 'openai',
            google: 'google',
            microsoft: 'microsoft',
            anthropic: 'anthropic',
            grocq: 'grocq',
            ollama: 'ollama'
        };

        new Setting(contentEl)
            .setName('Provider')
            .setDesc('Select the AI provider')
            .addDropdown((dropdown) => {
                Object.values(PROVIDERS).forEach(provider => {
                    const apiKey = provider === 'ollama' 
                        ? this.plugin.settings.ollamaServerUrl 
                        : this.plugin.settings[`${provider}ApiKey` as keyof typeof this.plugin.settings];
                    if (apiKey) {
                        dropdown.addOption(provider, provider);
                    }
                });
                dropdown.setValue(this.plugin.settings.selectedProvider);
                dropdown.onChange((newProvider) => {
                    this.plugin.settings.selectedProvider = newProvider as ProviderName;
                    this.plugin.saveSettings();
                });
                this.providerSelect = dropdown;
                return dropdown;
            });

        // Clipboard content preview
        new Setting(contentEl)
            .setName('Clipboard Content')
            .setDesc('Preview of clipboard content (read-only)')
            .addTextArea(text => {
                this.clipboardPreview = text.inputEl;
                text.setPlaceholder('Clipboard content will appear here');
                text.inputEl.rows = 5;
                text.inputEl.cols = 50;
                text.inputEl.readOnly = true;
            });

        // Button to refresh clipboard content
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Refresh Clipboard')
                .onClick(() => this.refreshClipboardContent()));

        // Pattern search container
        const patternCard = contentEl.createEl('div', { cls: 'pattern-card' });
        const patternSearchContainer = patternCard.createEl('div', { cls: 'pattern-search-container' });
        
        this.patternInput = new TextComponent(patternSearchContainer)
            .setPlaceholder('Search patterns...')
            .onChange((query) => {
                onPatternSearch(this.plugin, query, this.patternResults, (pattern) => {
                    onPatternSelect(
                        pattern,
                        this.selectedPatterns,
                        () => updateSelectedPatternsDisplay(
                            this.selectedPatternsTitle,
                            this.selectedPatternsContainer,
                            this.selectedPatterns,
                            (updatedPatterns) => {
                                this.selectedPatterns = updatedPatterns;
                            }
                        ),
                        () => this.patternInput.setValue(''),
                        () => this.patternResults.empty()
                    );
                });
            });

        this.patternResults = patternSearchContainer.createEl('div', { cls: 'pattern-results' });

        // Selected patterns
        this.selectedPatternsTitle = patternCard.createEl('h4', { text: 'Selected Patterns', cls: 'mesh-selected-patterns-title' });
        this.selectedPatternsContainer = patternCard.createEl('div', { cls: 'selected-patterns-container' });
          
        // Output file name input
        new Setting(contentEl)
            .setName('Output File Name')
            .setDesc('Enter a name for the output file (optional)')
            .addText(text => {
                this.outputFileNameInput = text.inputEl;
                text.setPlaceholder('Output file name');
            });

        // Process button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Process')
                .onClick(() => this.processClipboard()));

        // Initial clipboard content refresh
        this.refreshClipboardContent();
    }

    async refreshClipboardContent() {
        try {
            const clipboardContent = await navigator.clipboard.readText();
            this.clipboardPreview.value = clipboardContent;
        } catch (error) {
            console.error('Failed to read clipboard contents:', error);
            new Notice('Failed to read clipboard contents. Please ensure you have given the necessary permissions.');
        }
    }

    async processClipboard() {
        const input = this.clipboardPreview.value;
        if (!input) {
            new Notice('No clipboard content');
            return;
        }

        const outputFileName = this.outputFileNameInput;

        try {
            this.showLoading();
            let processedContent: string;
            if (this.plugin.settings.patternStitchingEnabled) {
                processedContent = await processStitchedPatterns(this.plugin, this.plugin.settings.selectedProvider, this.selectedPatterns, input);
            } else {
                processedContent = await processPatterns(this.plugin, this.plugin.settings.selectedProvider, this.selectedPatterns, input);
            }

            await createOutputFile(this.plugin, processedContent, outputFileName);
            this.close();
            new Notice('Clipboard content processed successfully');
        } catch (error) {
            console.error('Error processing clipboard content:', error);
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