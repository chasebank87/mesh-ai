import { Modal, Setting, ButtonComponent, Notice, App} from 'obsidian';
import MeshAIPlugin from '../main';
import { YoutubeProvider } from '../providers/YoutubeProvider';

export class YouTubeSelectionModal extends Modal {
  private youtubeLinks: string[];
  private onRun: (transcript: string) => void;
  private onSkip: () => void;
  private youtubeProvider: YoutubeProvider;

  constructor(app: App, plugin: MeshAIPlugin, youtubeLinks: string[], onRun: (transcript: string) => void, onSkip: () => void) {
    super(app);
    this.youtubeLinks = youtubeLinks;
    this.onRun = onRun;
    this.onSkip = onSkip;
    this.youtubeProvider = plugin.youtubeProvider;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();


    contentEl.addClass('mesh-modal');
    contentEl.createEl('h2', { text: 'YouTube links detected' });

    contentEl.addClass('mesh-modal');

    const dropdown = contentEl.createEl('select');
    this.youtubeLinks.forEach(link => {
      const option = dropdown.createEl('option', { text: link });
      option.value = link;
    });

    new Setting(contentEl)
      .addButton(button => {
        button.setButtonText('Run')
          .setCta()
          .onClick(async () => {
            const selectedLink = dropdown.value;
            if (selectedLink) {
              try {
                const transcript = await this.youtubeProvider.getTranscript(selectedLink);
                this.onRun(transcript);
                this.close();
              } catch (error) {
                new Notice(`Failed to fetch YouTube transcript: ${error.message}`);
                this.onSkip();
                this.close();
              }
            } else {
              new Notice('Please select a YouTube link');
            }
          });
      })
      .addButton(button => {
        button.setButtonText('Skip')
          .onClick(() => {
            this.onSkip();
            this.close();
          });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}