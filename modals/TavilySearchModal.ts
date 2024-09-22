import { Modal, App, Setting, TextComponent, Notice, DropdownComponent } from 'obsidian';
import MeshAIPlugin from '../main';
import { ProviderName } from '../types';
import { onPatternSearch, searchPatterns, onPatternSelect, updateSelectedPatternsDisplay } from '../utils/PatternUtils';
import { processPatterns, processStitchedPatterns } from '../utils/MeshUtils';
import { createOutputFile, createInplaceContent } from '../utils/FileUtils';

export class TavilySearchModal extends Modal {
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
    private searchInput: HTMLInputElement;
    private currentSelectedIndex: number = -1;
    private patternResultElements: HTMLElement[] = [];

    constructor(app: App, plugin: MeshAIPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.addClass('mesh-modal');
        
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
            ollama: 'ollama',
            openrouter: 'openrouter'
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

        // Tavily search input
        new Setting(contentEl)
            .setName('Tavily Search')
            .setDesc('Enter your search query')
            .addText(text => {
                this.searchInput = text.inputEl;
                text.setPlaceholder('Enter search query');
            });

        // Pattern search
        const patternCard = contentEl.createEl('div', { cls: 'pattern-card' });
        const patternSearchContainer = patternCard.createEl('div', { cls: 'pattern-search-container' });
        
        this.patternInput = new TextComponent(patternSearchContainer)
            .setPlaceholder('Search patterns...')
            .onChange((query) => {
                onPatternSearch(this.plugin, query, this.patternResults, this.handlePatternSelect.bind(this), (resultElements) => {
                    this.patternResultElements = resultElements;
                    this.currentSelectedIndex = resultElements.length > 0 ? 0 : -1;
                    this.highlightCurrentResult();
                });
            });

        // Add this new event listener
        this.patternInput.inputEl.addEventListener('keydown', this.handleKeyDown.bind(this));

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

        // Process buttons
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('New note')
                .onClick(() => this.processSearch()))
            .addButton(button => button
                .setButtonText('In place')
                .onClick(() => this.processSearch(true)));
    }

    async processSearch(inPlace: boolean = false) {
        if (!this.searchInput.value) {
            new Notice('Please enter a search query');
            return;
        }

        try {
            this.showLoading();
            const searchResult = await this.plugin.tavilyProvider.search(this.searchInput.value);
            let processedContent: string;
            if (this.plugin.settings.patternStitchingEnabled) {
                processedContent = await processStitchedPatterns(this.plugin, this.plugin.settings.selectedProvider, this.selectedPatterns, searchResult);
            } else {
                processedContent = await processPatterns(this.plugin, this.plugin.settings.selectedProvider, this.selectedPatterns, searchResult);
            }
            
            if (inPlace) {
                await createInplaceContent(this.plugin, processedContent);
            } else {
                await createOutputFile(this.plugin, processedContent, this.outputFileNameInput.value);
            }
            this.close();
            new Notice('Search processed successfully');
        } catch (error) {
            console.error('Error processing search:', error);
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

    private handlePatternSelect(pattern: string) {
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
            () => {
                this.patternResults.empty();
                this.patternResultElements = [];
                this.currentSelectedIndex = -1;
            }
        );
    }

    private handleKeyDown(event: KeyboardEvent) {
        if (this.patternResultElements.length === 0) return;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.currentSelectedIndex = (this.currentSelectedIndex + 1) % this.patternResultElements.length;
                this.highlightCurrentResult();
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.currentSelectedIndex = (this.currentSelectedIndex - 1 + this.patternResultElements.length) % this.patternResultElements.length;
                this.highlightCurrentResult();
                break;
            case 'Enter':
                event.preventDefault();
                if (this.currentSelectedIndex !== -1) {
                    const selectedPattern = this.patternResultElements[this.currentSelectedIndex].textContent;
                    if (selectedPattern) this.handlePatternSelect(selectedPattern);
                }
                break;
        }
    }

    private highlightCurrentResult() {
        this.patternResultElements.forEach((el, index) => {
            el.classList.toggle('selected', index === this.currentSelectedIndex);
        });
        if (this.currentSelectedIndex !== -1) {
            this.patternResultElements[this.currentSelectedIndex].scrollIntoView({
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }
}