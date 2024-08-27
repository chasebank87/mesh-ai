import { ItemView, WorkspaceLeaf, Notice, TFile, TFolder, TextComponent } from 'obsidian';
import MeshAIPlugin from '../main';
import { PluginSettings, ProviderName } from '../types';
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

    // Create particles container
    const particlesContainer = container.createEl('div', { cls: 'particles-js', attr: { id: 'particles-js' } });

    // Main form container
    const formContainer = container.createEl('div', { cls: 'mesh-form-container' });

    // Provider selection card
    const providerCard = this.createCard(formContainer, 'provider');
    const providerSelect = UIHelper.createSelect(providerCard, 'mesh-provider-select', ['openai', 'google', 'microsoft', 'anthropic', 'grocq', 'ollama']);

    // Input source selection card
    const inputCard = this.createCard(formContainer, 'Input Source');

    // Create a container for the toggle switch
    const toggleContainer = inputCard.createEl('div', { cls: 'input-toggle-container' });

    // Create a slider element
    const slider = toggleContainer.createEl('div', { cls: 'input-toggle-slider' });

    // Create radio buttons for the toggle switch
    const options = ['active-note', 'clipboard', 'tavily'];
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

        label.createEl('span', { text: option.charAt(0).toUpperCase() + option.slice(1), cls: 'input-toggle-text' });

        // Add event listener to handle changes
        input.addEventListener('change', () => {
            this.handleInputSourceChange(option, index);
        });
    });

    // Tavily search input
    const tavilySearchContainer = inputCard.createEl('div', { cls: 'tavily-search-container' });
    const tavilySearchInput = tavilySearchContainer.createEl('input', { 
        attr: {
            type: 'text', 
            placeholder: 'Enter Tavily search query'
        },
        cls: 'mesh-tavily-input tavily-hidden'
    });

    // Patterns card (combining search and selected patterns)
    const patternCard = this.createCard(formContainer, 'patterns');

    // Pattern search container
    const patternSearchContainer = patternCard.createEl('div', { cls: 'pattern-search-container' });
    this.patternInput = new TextComponent(patternSearchContainer)
      .setPlaceholder('Search patterns...')
      .onChange((query) => {
        onPatternSearch(this.plugin, query, this.patternResults, (pattern) => {
          onPatternSelect(
            pattern,
            this.selectedPatterns,
            () => updateSelectedPatternsDisplay(
              selectedPatternsTitle,
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
    this.patternInput.inputEl.addClass('pattern-search-input');

    // Selected patterns
    const selectedPatternsTitle = patternCard.createEl('h4', { text: 'Selected Patterns', cls: 'mesh-selected-patterns-title' });
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
    stitchingToggle.createEl('span', { cls: 'slider round' });
    const stitchingLabel = stitchingContainer.createEl('span', { text: 'Pattern Stitching', cls: 'pattern-stitching-label' });

    // Add event listener for the toggle
    stitchingInput.addEventListener('change', (e) => {
      this.patternStitchingEnabled = (e.target as HTMLInputElement).checked;
      this.plugin.settings.patternStitchingEnabled = this.patternStitchingEnabled;
      this.plugin.saveSettings();
      const status = this.patternStitchingEnabled ? 'enabled' : 'disabled';
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
    this.initParticles();

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
    const particlesContainer = container.createEl('div', { cls: 'particles-js', attr: { id: 'particles-js' } });
    
    // @ts-ignore
    if (window.particlesJS) {
      const initParticles = () => {
        // @ts-ignore
        window.particlesJS('particles-js', {
          particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { 
              value: ["#81a0ed", "#694daa"]
            },
            shape: { type: "circle" },
            opacity: { value: 0.5, random: false },
            size: { value: 3, random: true },
            line_linked: { 
              enable: true, 
              distance: 150, 
              color: "#81a0ed", 
              opacity: 0.4, 
              width: 1 
            },
            move: { enable: true, speed: 2, direction: "none", random: false, straight: false, out_mode: "out", bounce: false }
          },
          interactivity: {
            detect_on: "canvas",
            events: { onhover: { enable: true, mode: "repulse" }, onclick: { enable: true, mode: "push" }, resize: true },
            modes: { grab: { distance: 400, line_linked: { opacity: 1 } }, bubble: { distance: 400, size: 40, duration: 2, opacity: 8, speed: 3 }, repulse: { distance: 200, duration: 0.4 }, push: { particles_nb: 4 }, remove: { particles_nb: 2 } }
          },
          retina_detect: true
        });
      };
  
      initParticles();
  
      // Reinitialize particles when the window is resized
      const debouncedResize = this.debounce(() => {
        // @ts-ignore
        if (window.pJSDom && window.pJSDom[0] && window.pJSDom[0].pJS) {
          // @ts-ignore
          window.pJSDom[0].pJS.fn.vendors.destroypJS();
        }
        initParticles();
      }, 250);
  
      window.addEventListener('resize', debouncedResize);
  
      // Adjust particle canvas size when the container is resized
      const resizeObserver = new ResizeObserver(() => {
        const canvas = particlesContainer.querySelector('canvas');
        if (canvas) {
          canvas.width = particlesContainer.clientWidth;
          canvas.height = particlesContainer.clientHeight;
        }
      });
      resizeObserver.observe(container);
    }
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
    const tavilySearchInput = this.containerEl.querySelector('.mesh-tavily-input') as HTMLInputElement;

    const selectedProvider = providerSelect.value as ProviderName;
    const selectedSource = selectedInputSource ? selectedInputSource.value : 'active-note'; // Default to 'active-note' if nothing is selected
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
        const input = await getInputContent(this.app, this.plugin, selectedSource, tavilySearchInput);
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
    const tavilySearchInput = this.containerEl.querySelector('.mesh-tavily-input') as HTMLInputElement;
    const slider = this.containerEl.querySelector('.input-toggle-slider') as HTMLElement;

    // Update slider position using data attribute
    slider.setAttribute('data-position', index.toString());

    // Handle the Tavily input visibility
    if (selectedSource === 'tavily') {
        tavilySearchInput.classList.remove('tavily-hidden');
    } else {
        tavilySearchInput.classList.add('tavily-hidden');
    }
  }
}