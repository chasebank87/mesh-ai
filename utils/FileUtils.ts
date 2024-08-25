import { App, TFile, Notice } from 'obsidian';
import MeshAIPlugin from '../main';

export async function getActiveNoteContent(app: App): Promise<string> {
    const activeFile = app.workspace.getActiveFile();
    if (activeFile instanceof TFile) {
        return await app.vault.read(activeFile);
    }
    throw new Error('No active note found');
}

export async function createOutputFile(plugin: MeshAIPlugin, content: string, outputFileNameInput: HTMLInputElement) {
    const outputFolder = plugin.settings.meshOutputFolder;
    if (!outputFolder) {
        throw new Error('Mesh output folder not set');
    }

    let fileName = outputFileNameInput.value.trim() || 'Mesh Note';
    let fileNameWithExtension = `${fileName}.md`;
    let counter = 1;

    while (await plugin.app.vault.adapter.exists(`${outputFolder}/${fileNameWithExtension}`)) {
        fileNameWithExtension = `${fileName} (${counter}).md`;
        counter++;
    }

    const filePath = `${outputFolder}/${fileNameWithExtension}`;
    await plugin.app.vault.create(filePath, content);
    new Notice(`File created: ${fileNameWithExtension}`);
    // open the created file
    const file = plugin.app.vault.getAbstractFileByPath(filePath);
    await this.app.workspace.getLeaf(false).openFile(file);
}