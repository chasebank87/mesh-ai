import { App, TFile, Notice, Editor, MarkdownView } from 'obsidian';
import MeshAIPlugin from '../main';

export async function getActiveNoteContent(app: App): Promise<string> {
    const activeFile = app.workspace.getActiveFile();
    if (activeFile instanceof TFile) {
        return await app.vault.read(activeFile);
    }
    throw new Error('No active note found');
}

export async function createOutputFile(plugin: MeshAIPlugin, content: string, outputFileNameInput: string | HTMLInputElement) {
    const outputFolder = plugin.settings.meshOutputFolder;
    if (!outputFolder) {
        throw new Error('Mesh output folder not set');
    }

    let fileName: string;
    if (typeof outputFileNameInput === 'string') {
        fileName = outputFileNameInput.trim();
    } else {
        fileName = outputFileNameInput.value.trim();
    }

    fileName = fileName || 'Mesh Note';
    let fileNameWithExtension = `${fileName}.md`;
    let counter = 1;

    while (await plugin.app.vault.adapter.exists(`${outputFolder}/${fileNameWithExtension}`)) {
        fileNameWithExtension = `${fileName} (${counter}).md`;
        counter++;
    }

    const filePath = `${outputFolder}/${fileNameWithExtension}`;
    await plugin.app.vault.create(filePath, content);
    new Notice(`File created: ${fileNameWithExtension}`);
    
    // Open the created file
    const file = plugin.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
        await plugin.app.workspace.getLeaf(false).openFile(file);
    }
}

export async function createInplaceContent(plugin: MeshAIPlugin, content: string): Promise<void> {
    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
        new Notice('No active Markdown view found');
        return;
    }

    const editor = activeView.editor;
    const cursor = editor.getCursor();

    editor.replaceRange(content, cursor);
    new Notice('Content inserted at cursor position');
}