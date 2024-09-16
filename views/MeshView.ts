import { ItemView, WorkspaceLeaf, Notice, TFile, TFolder, TextComponent, EventRef } from 'obsidian';
import MeshAIPlugin from '../main';
import { PluginSettings, ProviderName, SearchProviderName } from '../types';
import { YouTubeSelectionModal } from '../modals/YouTubeSelectionModal';
import { handleLLMRequest } from '../utils/LLMUtils';
import { searchPatterns, createSelectedPatternElement, getPatternContent, onPatternSearch, onPatternSelect, updateSelectedPatternsDisplay } from '../utils/PatternUtils';
import { getActiveNoteContent, createOutputFile } from '../utils/FileUtils';
import { FULL_PROMPT_TEMPLATE } from '../constants/promptTemplates';
import { UIHelper } from '../utils/UIHelper';
import { getInputContent, processPatterns, processStitchedPatterns, debugLog} from '../utils/MeshUtils';

export const MESH_VIEW_TYPE = 'mesh-view';

export class MeshView extends ItemView {
  plugin: MeshAIPlugin;
  private loadingElement: HTMLDivElement;
  private patternInput: TextComponent;
  private patternResults: HTMLElement;
  private selectedPatterns: string[] = [];
  private selectedPatternsContainer: HTMLElement;
  private outputFileNameInput: HTMLInputElement;
  private patternStitchingEnabled: boolean;
  private providerCard: HTMLElement;
  private inputCard: HTMLElement;
  private patternsCard: HTMLElement;
  private outputCard: HTMLElement;
  private startRotating: (card: HTMLElement) => void;
  private stopRotating: (card: HTMLElement) => void;
  private currentSelectedIndex: number = -1;
  private patternResultElements: HTMLElement[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: MeshAIPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.patternStitchingEnabled = this.plugin.settings.patternStitchingEnabled;
  }

  getViewType() {
    return MESH_VIEW_TYPE;
  }

  getDisplayText() {
    return 'Mesh AI';
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('mesh-view-container');

    // Register layout change event
    this.registerEvent(
      this.app.workspace.on('layout-change', this.onLayoutChange.bind(this))
    );
    this.registerEvent(
      this.app.workspace.on('resize', this.onLayoutChange.bind(this))
    );

    // Create particles container
    const particlesContainer = container.createEl('div', { cls: 'particles-js', attr: { id: 'particles-js' } });

    // Main form container
    const formContainer = container.createEl('div', { cls: 'mesh-form-container' });

    // Provider selection card
    const PROVIDERS: Record<ProviderName, ProviderName> = {
      openai: 'openai',
      google: 'google',
      microsoft: 'microsoft',
      anthropic: 'anthropic',
      grocq: 'grocq',
      ollama: 'ollama'
    };
    const providerCard = this.createCard(formContainer, 'provider');
    const providerSelect = UIHelper.createSelect(
        providerCard, 
        'mesh-provider-select', 
        Object.values(PROVIDERS)
    );

    // Set the default provider from settings
    providerSelect.value = this.plugin.settings.selectedProvider;

    // Add an event listener to update the settings when the provider changes
    providerSelect.addEventListener('change', (event) => {
        const newProvider = (event.target as HTMLSelectElement).value as ProviderName;
        this.plugin.settings.selectedProvider = newProvider;
        this.plugin.saveSettings();
    });
    
    // Input source selection card
    const inputCard = this.createCard(formContainer, 'Input');

    // Create a container for the toggle switch
    const toggleContainer = inputCard.createEl('div', { cls: 'input-toggle-container' });

    // Create a slider element
    const slider = toggleContainer.createEl('div', { cls: 'input-toggle-slider mesh-slider' });

    // Create radio buttons for the toggle switch
    const options = ['active-note', 'clipboard', this.plugin.settings.usePerplexity ? 'perplexity' : 'tavily'];
    options.forEach((option, index) => {
        const label = toggleContainer.createEl('label', { cls: 'input-toggle-label' });
        const input = label.createEl('input', {
            attr: {
                type: 'radio',
                name: 'input-source',
                value: option
            },
            cls: 'input-toggle-input'
        });

        // Set the default checked option
        if (option === 'active-note') {
            input.checked = true;
        }

        label.createEl('span', { 
          text: option === 'perplexity' ? 'Perplexity' : option.charAt(0).toUpperCase() + option.slice(1), 
          cls: 'input-toggle-text' 
        });
  

        // Add event listener to handle changes
        input.addEventListener('change', () => {
            this.handleInputSourceChange(option, index);
        });
    });

    // Tavily search input
    const searchContainer = inputCard.createEl('div', { cls: 'tavily-search-container' });
    const searchInput = searchContainer.createEl('input', { 
      attr: {
          type: 'text', 
          placeholder: this.plugin.settings.usePerplexity ? 'Enter Perplexity search query' : 'Enter Tavily search query'
      },
      cls: 'mesh-tavily-input tavily-hidden'
    });
    

    // Patterns card (combining search and selected patterns)
    const patternCard = this.createCard(formContainer, 'patterns');

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

    this.patternResults = patternSearchContainer.createEl('div', { cls: 'pattern-results' });
    this.patternInput.inputEl.addClass('pattern-search-input');

    // Add keydown event listener to the pattern input
    this.patternInput.inputEl.addEventListener('keydown', this.handlePatternInputKeydown.bind(this));

    // Selected patterns
    const selectedPatternsTitle = patternCard.createEl('h4', { text: 'Selected patterns', cls: 'mesh-selected-patterns-title' });
    selectedPatternsTitle.addClass('hidden');

    this.selectedPatternsContainer = patternCard.createEl('div', { cls: 'selected-patterns-container' });

    // Add pattern stitching toggle at the bottom left
    const stitchingContainer = patternCard.createEl('div', { cls: 'pattern-stitching-container' });
    const stitchingToggle = stitchingContainer.createEl('label', { cls: 'switch' });
    const stitchingInput = stitchingToggle.createEl('input', { 
      type: 'checkbox', 
      cls: 'pattern-stitching-input'
    });
    stitchingInput.checked = this.patternStitchingEnabled; // Set the initial state
    const stitchSpan = stitchingToggle.createEl('span', { cls: 'mesh-slider round' });
    const stitchingLabel = stitchingContainer.createEl('span', { text: 'Pattern stitching', cls: 'pattern-stitching-label' });

    // Add event listener for the toggle
    stitchingInput.addEventListener('change', (e) => {
      this.patternStitchingEnabled = (e.target as HTMLInputElement).checked;
      this.plugin.settings.patternStitchingEnabled = this.patternStitchingEnabled;
      this.plugin.saveSettings();
      const status = this.patternStitchingEnabled ? 'enabled' : 'disabled';
      if (status === 'enabled') {
        stitchSpan.addClass('stitching-enabled');
      } else {
        stitchSpan.removeClass('stitching-enabled');
      }
      new Notice(`Pattern Stitching ${status}.`);
    });

    // Output file name card
    const outputCard = this.createCard(formContainer, 'output');
    this.outputFileNameInput = outputCard.createEl('input', {
      type: 'text',
      placeholder: 'Output file name (optional)',
      cls: 'mesh-output-filename-input'
    });

    // Submit button
    const submitButtonContainer = formContainer.createEl('div', { cls: 'mesh-submit-button-container' });
    const submitButton = submitButtonContainer.createEl('button', { text: 'Submit', cls: 'mesh-submit-button' });
    submitButton.addEventListener('click', this.onSubmit.bind(this));

    // Loading element
    this.loadingElement = container.createEl('div', { text: 'Processing...', cls: 'mesh-loading' });
    this.loadingElement.hide();

    // Initialize particles
    setTimeout(() => this.initParticles(), 100);

    // Add click outside listener
    document.addEventListener('click', this.handleClickOutside);
  }

  private handleClickOutside = (event: MouseEvent) => {
    if (!(event.target instanceof Node) || !this.patternResults.contains(event.target)) {
      this.patternResults.addClass('hidden');
    }
  }
  
  private initParticles() {
    const container = this.containerEl.children[1] as HTMLElement;
    let particlesContainer = container.querySelector('#particles-js') as HTMLElement;

    if (!particlesContainer) {
      particlesContainer = container.createEl('div', { cls: 'particles-js', attr: { id: 'particles-js' } });
    }

    const destroyExistingParticles = () => {
      if (typeof (window as any).pJSDom !== 'undefined' && (window as any).pJSDom.length > 0) {
        (window as any).pJSDom[0].pJS.fn.vendors.destroypJS();
        (window as any).pJSDom = [];
      }
    };

    const initParticlesJS = () => {
      if (typeof (window as any).particlesJS === 'function' && particlesContainer.clientWidth > 0 && particlesContainer.clientHeight > 0) {
        destroyExistingParticles();
        try {
          (window as any).particlesJS('particles-js', {
            particles: {
              number: { value: 120, density: { enable: true, value_area: 1000 } },
              color: { value: ["#81a0ed", "#694daa", "#9c27b0", "#3f51b5"] },
              shape: { 
                type: ["circle", "triangle"],
                polygon: { nb_sides: 5 }
              },
              opacity: { value: 0.5, random: true, anim: { enable: true, speed: 0.8, opacity_min: 0.1, sync: false } },
              size: { value: 3, random: true, anim: { enable: true, speed: 1.5, size_min: 0.1, sync: false } },
              line_linked: { 
                enable: true, 
                distance: 200, 
                color: "#81a0ed", 
                opacity: 0.3, 
                width: 1 
              },
              move: { 
                enable: true, 
                speed: 1.5, 
                direction: "none", 
                random: true, 
                straight: false, 
                out_mode: "bounce", 
                bounce: false,
                attract: { enable: false, rotateX: 600, rotateY: 1200 }
              }
            },
            interactivity: {
              detect_on: "canvas",
              events: { 
                onhover: { enable: true, mode: "grab" }, 
                onclick: { enable: true, mode: "push" }, 
                resize: true 
              },
              modes: {
                grab: { distance: 150, line_linked: { opacity: 0.5 } },
                push: { particles_nb: 3 }
              }
            },
            retina_detect: true
          });
        } catch (error) {
          console.error('Error initializing particles:', error);
        }

      }
    };

    // Initialize particles
    initParticlesJS();

    // Adjust particle canvas size when the container is resized
    const resizeObserver = new ResizeObserver(this.debounce(() => {
      const canvas = particlesContainer.querySelector('canvas');
      if (canvas) {
        canvas.width = particlesContainer.clientWidth;
        canvas.height = particlesContainer.clientHeight;
      }
      initParticlesJS();
    }, 200));
    resizeObserver.observe(container);

    // Clean up function
    return () => {
      resizeObserver.disconnect();
      destroyExistingParticles();
    };

  }
  
  private debounce<T extends (...args: never[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }
  
  private createCard(container: HTMLElement, title: string): HTMLElement {
    const card = container.createEl('div', { cls: `mesh-card ${title.toLowerCase()}` });
    card.createEl('h3', { text: title, cls: 'mesh-card-title' });
    return card;
  }

  private updateTheme() {
    const isDarkMode = document.body.classList.contains('theme-dark');
    this.containerEl.toggleClass('theme-dark', isDarkMode);
    this.containerEl.toggleClass('theme-light', !isDarkMode);
  }

  async onSubmit() {
    debugLog(this.plugin, "onSubmit method called");
    const providerSelect = this.containerEl.querySelector('.mesh-provider-select') as HTMLSelectElement;
    const selectedInputSource = this.containerEl.querySelector('input[name="input-source"]:checked') as HTMLInputElement;
    const searchInput = this.containerEl.querySelector('.mesh-tavily-input') as HTMLInputElement;

    const selectedProvider = providerSelect.value as ProviderName;
    const selectedSource = selectedInputSource ? selectedInputSource.value : 'active-note';
    const selectedPatterns = this.selectedPatterns;

    try {
        await this.showLoading();

        // Provider initialization
        this.startRotating(this.providerCard);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Add your provider initialization code here
        this.stopRotating(this.providerCard);

        // Input processing
        this.startRotating(this.inputCard);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        debugLog(this.plugin, "Getting input content...");
        let input: string;

        // Check if the selected source is a search provider
        if (selectedSource === 'tavily' || selectedSource === 'perplexity') {
            input = await this.getSearchProviderContent(selectedSource as SearchProviderName, searchInput.value);
        } else {
            input = await getInputContent(this.app, this.plugin, selectedSource, searchInput);
        }
        this.stopRotating(this.inputCard);

        // Pattern processing
        this.startRotating(this.patternsCard);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        debugLog(this.plugin, "Processing patterns...");
        let processedContent: string;
        if (this.patternStitchingEnabled) {
            processedContent = await processStitchedPatterns(this.plugin, selectedProvider, selectedPatterns, input);
        } else {
            processedContent = await processPatterns(this.plugin, selectedProvider, selectedPatterns, input);
        }
        this.stopRotating(this.patternsCard);

        // Output creation
        this.startRotating(this.outputCard);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        debugLog(this.plugin, "Creating output file...");
        await createOutputFile(this.plugin, processedContent, this.outputFileNameInput);
        this.stopRotating(this.outputCard);

    } catch (error) {
        console.error('Error processing request:', error);
        new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        this.hideLoading();
    }
  }

  private async getSearchProviderContent(providerName: SearchProviderName, query: string): Promise<string> {
      const provider = this.plugin.getSearchProvider(providerName);
      
      if ('search' in provider) {
          return await provider.search(query);
      } else {
          throw new Error(`Provider ${providerName} does not support search method`);
      }
  }

  private async showLoading() {
    const formContainer = this.containerEl.querySelector('.mesh-form-container') as HTMLElement;
    const cards = Array.from(formContainer.querySelectorAll('.mesh-card')) as HTMLElement[];
    const submitButtonContainer = this.containerEl.querySelector('.mesh-submit-button-container') as HTMLElement;
    const submitButton = submitButtonContainer.querySelector('.mesh-submit-button') as HTMLButtonElement;

    // Store the cards for easy access
    this.providerCard = cards[0];
    this.inputCard = cards[1];
    this.patternsCard = cards[2];
    this.outputCard = cards[3];

    // Define methods to start and stop rotation
    this.startRotating = (card: HTMLElement) => {
        card.classList.add('rotating');
    };

    this.stopRotating = (card: HTMLElement) => {
        card.classList.remove('rotating');
    };

    // Add processing class to submit button container
    submitButtonContainer.classList.add('processing');
    
    // Change button text to "Processing" and disable it
    submitButton.classList.add('processing');
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';
}
  
  private hideLoading() {
    const formContainer = this.containerEl.querySelector('.mesh-form-container') as HTMLElement;
    const cards = Array.from(formContainer.querySelectorAll('.mesh-card')) as HTMLElement[];
    const submitButtonContainer = this.containerEl.querySelector('.mesh-submit-button-container') as HTMLElement;
    const submitButton = submitButtonContainer.querySelector('.mesh-submit-button') as HTMLButtonElement;

    cards.forEach(card => {
        card.classList.remove('rotating');
    });

    submitButtonContainer.classList.remove('processing');
    submitButton.classList.remove('processing');
    submitButton.disabled = false;
    submitButton.textContent = 'Submit'; // Reset button text
  }

  private handleInputSourceChange(selectedSource: string, index: number) {
    const searchInput = this.containerEl.querySelector('.mesh-tavily-input') as HTMLInputElement;
    const slider = this.containerEl.querySelector('.input-toggle-slider') as HTMLElement;

    // Update slider position using data attribute
    slider.setAttribute('data-position', index.toString());

    // Handle the search input visibility and placeholder
    if (selectedSource === 'tavily' || selectedSource === 'perplexity') {
        searchInput.classList.remove('tavily-hidden');
        searchInput.placeholder = this.plugin.settings.usePerplexity 
            ? 'Enter Perplexity search query' 
            : 'Enter Tavily search query';
    } else {
        searchInput.classList.add('tavily-hidden');
    }
  }

  updateProviderSelect(newProvider: ProviderName) {
    const providerSelect = this.containerEl.querySelector('.mesh-provider-select') as HTMLSelectElement;
    if (providerSelect && providerSelect.value !== newProvider) {
      providerSelect.value = newProvider;
      // Trigger the change event
      providerSelect.dispatchEvent(new Event('change'));
    }
  }
  
  private handlePatternInputKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
      event.preventDefault();
      
      if (event.key === 'ArrowDown') {
        this.navigatePatternResults(1);
      } else if (event.key === 'ArrowUp') {
        this.navigatePatternResults(-1);
      } else if (event.key === 'Enter') {
        this.selectCurrentPattern();
      }
    }
  }

  private navigatePatternResults(direction: 1 | -1) {
    const resultsCount = this.patternResultElements.length;
    if (resultsCount === 0) return;

    this.currentSelectedIndex = (this.currentSelectedIndex + direction + resultsCount) % resultsCount;
    this.highlightCurrentResult();
  }

  private highlightCurrentResult() {
    this.patternResultElements.forEach((el, index) => {
      el.classList.toggle('selected', index === this.currentSelectedIndex);
    });
  }

  private selectCurrentPattern() {
    if (this.currentSelectedIndex >= 0 && this.currentSelectedIndex < this.patternResultElements.length) {
      const selectedElement = this.patternResultElements[this.currentSelectedIndex];
      const patternName = selectedElement.textContent?.trim() || '';
      this.handlePatternSelect(patternName);
    }
  }

  private handlePatternSelect(pattern: string) {
    onPatternSelect(
      pattern,
      this.selectedPatterns,
      () => updateSelectedPatternsDisplay(
        this.containerEl.querySelector('.mesh-selected-patterns-title') as HTMLElement,
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

  private onLayoutChange() {
    // Reinitialize particles
    this.initParticles();
  }

  async onClose() {
    const cleanup = this.initParticles();
    cleanup();
    document.removeEventListener('click', this.handleClickOutside);
  }
}