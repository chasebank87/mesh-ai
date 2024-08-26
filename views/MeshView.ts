import { ItemView, WorkspaceLeaf, Notice, TFile, TFolder, TextComponent } from 'obsidian';
import MeshAIPlugin from '../main';
import { PluginSettings, ProviderName } from '../types';
import { YouTubeSelectionModal } from '../modals/YouTubeSelectionModal';
import { handleLLMRequest } from '../utils/LLMUtils';
import { searchPatterns, createSelectedPatternElement, getPatternContent, onPatternSearch, onPatternSelect, updateSelectedPatternsDisplay } from '../utils/PatternUtils';
import { getActiveNoteContent, createOutputFile } from '../utils/FileUtils';
import { FULL_PROMPT_TEMPLATE } from '../constants/promptTemplates';
import { UIHelper } from '../utils/UIHelper';
import { getInputContent, processPatterns, processStitchedPatterns, debugLog } from '../utils/MeshUtils';
import { logoSvg } from '../constants/logo'; // Adjust the import path as needed

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

    // Add logo at the top
    const logoElement = this.createLogoElement(logoSvg);
    formContainer.appendChild(logoElement);

    // Provider selection card
    const providerCard = this.createCard(formContainer, 'provider');
    const providerSelect = UIHelper.createSelect(providerCard, 'mesh-provider-select', ['openai', 'google', 'microsoft', 'anthropic', 'grocq', 'ollama']);

    // Input source selection card
    const inputCard = this.createCard(formContainer, 'input');
    const inputSourceSelect = UIHelper.createSelect(inputCard, 'mesh-input-source-select', ['active-note', 'clipboard', 'tavily']);

    // Tavily search input
    const tavilySearchInput = inputCard.createEl('input', { 
      type: 'text', 
      placeholder: 'Enter Tavily search query',
      cls: 'mesh-tavily-input'
    });
    tavilySearchInput.style.display = 'none';

    inputSourceSelect.addEventListener('change', () => {
      tavilySearchInput.style.display = inputSourceSelect.value === 'tavily' ? 'block' : 'none';
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
            () => {
              updateSelectedPatternsDisplay(
                this.selectedPatternsContainer,
                this.selectedPatterns,
                (updatedPatterns) => {
                  this.selectedPatterns = updatedPatterns;
                  this.updateSelectedPatternsVisibility();
                }
              );
            },
            () => this.patternInput.setValue(''),
            () => this.patternResults.empty()
          );
        });
      });

    this.patternResults = patternSearchContainer.createEl('div', { cls: 'pattern-results' });
    this.patternInput.inputEl.addClass('pattern-search-input');

    // Selected patterns
    const selectedPatternsTitle = patternCard.createEl('h4', { text: 'Selected Patterns', cls: 'mesh-selected-patterns-title' });
    selectedPatternsTitle.style.display = 'none'; // Initially hide the title
    this.selectedPatternsContainer = patternCard.createEl('div', { cls: 'selected-patterns-container' });
    this.selectedPatternsContainer.style.display = 'none'; // Initially hide the container

    // Call the method to set initial visibility
    this.updateSelectedPatternsVisibility();

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
      this.patternResults.style.display = 'none';
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
  
  private debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
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
    debugLog(this.plugin,"onSubmit method called");
    const providerSelect = this.containerEl.querySelector('.mesh-provider-select') as HTMLSelectElement;
    const inputSourceSelect = this.containerEl.querySelector('.mesh-input-source-select') as HTMLSelectElement;
    const tavilySearchInput = this.containerEl.querySelector('.mesh-tavily-input') as HTMLInputElement;
    
    debugLog(this.plugin,"Selected provider:", providerSelect.value);
    debugLog(this.plugin,"Selected input source:", inputSourceSelect.value);
    debugLog(this.plugin,"Tavily search input:", tavilySearchInput.value);
  
    const selectedProvider = providerSelect.value as ProviderName;
    const selectedSource = inputSourceSelect.value;
    const selectedPatterns = this.selectedPatterns;
  
    try {
      debugLog(this.plugin,"Getting input content...");
      const input = await getInputContent(this.app, this.plugin, selectedSource, tavilySearchInput);
      this.showLoading();
      debugLog(this.plugin,"Processing patterns...");
      if (this.patternStitchingEnabled) {
        const processedContent = await processStitchedPatterns(this.plugin, selectedProvider, selectedPatterns, input);
        debugLog(this.plugin,"Creating output file...");
        await createOutputFile(this.plugin, processedContent, this.outputFileNameInput);
        return;
      } else {
        const processedContent = await processPatterns(this.plugin, selectedProvider, selectedPatterns, input);
        debugLog(this.plugin,"Creating output file...");
        await createOutputFile(this.plugin, processedContent, this.outputFileNameInput);
      }
    } catch (error) {
      console.error('Error processing request:', error);
      new Notice(`Error: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  private async showLoading() {
    const formContainer = this.containerEl.querySelector('.mesh-form-container') as HTMLElement;
    const cards = Array.from(formContainer.querySelectorAll('.mesh-card'));
    const submitButtonContainer = this.containerEl.querySelector('.mesh-submit-button-container') as HTMLElement;
    const submitButton = submitButtonContainer.querySelector('.mesh-submit-button') as HTMLButtonElement;
  
    // Rotate cards sequentially
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLElement;
      card.classList.add('rotating');
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 500ms before starting the next card
      card.addEventListener('animationend', () => {
        card.classList.remove('rotating');
      }, { once: true });
    }
  
    // Add processing class to submit button container after cards have rotated
    submitButtonContainer.classList.add('processing');
    
    // Change button text to "Processing" with typing animation
    submitButton.classList.add('processing');
    submitButton.disabled = true;
  }
  
  private hideLoading() {
    const formContainer = this.containerEl.querySelector('.mesh-form-container') as HTMLElement;
    const cards = formContainer.querySelectorAll('.mesh-card');
    const submitButtonContainer = this.containerEl.querySelector('.mesh-submit-button-container') as HTMLElement;
    const submitButton = submitButtonContainer.querySelector('.mesh-submit-button') as HTMLButtonElement;
  
    cards.forEach(card => {
      card.classList.remove('rotating');
    });
  
    submitButtonContainer.classList.remove('processing');
    submitButton.classList.remove('processing');
    submitButton.disabled = false;
  }

  private updateSelectedPatternsVisibility() {
    const selectedPatternsTitle = this.containerEl.querySelector('.mesh-selected-patterns-title') as HTMLElement;
    if (this.selectedPatternsContainer && selectedPatternsTitle) {
      const isVisible = this.selectedPatterns.length > 0;
      this.selectedPatternsContainer.style.display = isVisible ? 'block' : 'none';
      selectedPatternsTitle.style.display = isVisible ? 'block' : 'none';
      console.log(`Selected patterns visibility updated. Is visible: ${isVisible}`);
    }
  }

  private createLogoElement(logoSvg: string ): HTMLElement {
    const logoContainer = document.createElement('div');
    logoContainer.className = 'mesh-logo-container';
    logoContainer.innerHTML = logoSvg;
    return logoContainer;
  }
}