import { App, FuzzySuggestModal } from 'obsidian';

export class ModelSuggestModal extends FuzzySuggestModal<string> {
  models: string[];
  onChoose: (model: string) => void;

  constructor(app: App, models: string[], onChoose: (model: string) => void) {
    super(app);
    this.models = models;
    this.onChoose = onChoose;
  }

  getItems(): string[] {
    return this.models;
  }

  getItemText(model: string): string {
    return model;
  }

  onChooseItem(model: string, evt: MouseEvent | KeyboardEvent): void {
    this.onChoose(model);
  }
}
