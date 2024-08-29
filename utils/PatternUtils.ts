import { TFile, TFolder } from 'obsidian';
import MeshAIPlugin from '../main';
import * as Fuzzysort from 'fuzzysort';
import { debugLog } from '../utils/MeshUtils';
import { OptgroupAttributes, AttributeMap } from '../types';

export async function updatePatternList(plugin: MeshAIPlugin, patternSelect: HTMLSelectElement) {
  const customPatterns = await plugin.loadCustomPatterns();
  const fabricPatterns = await plugin.loadFabricPatterns();
  const allPatterns = [...customPatterns, ...fabricPatterns];

  // Clear the select element
  patternSelect.empty();
  
  if (allPatterns.length === 0) {
    patternSelect.createEl('option', { value: '', text: 'No patterns found' });
  } else {
    // Add an option group for custom patterns
    if (customPatterns.length > 0) {
      const customGroup = patternSelect.createEl('optgroup', {
        attr: { label: 'Custom Patterns' }
      } as DomElementInfo);
      customPatterns.forEach(pattern => {
        customGroup.createEl('option', { value: pattern, text: pattern });
      });
    }

    // Add an option group for Fabric patterns
    if (fabricPatterns.length > 0) {
      const fabricGroup = patternSelect.createEl('optgroup', {
        attr: { label: 'Fabric Patterns' }
      } as DomElementInfo);
      fabricPatterns.forEach(pattern => {
        fabricGroup.createEl('option', { value: pattern, text: pattern });
      });
    }
  }
}

export async function getPatternContent(plugin: MeshAIPlugin, patternName: string): Promise<string> {
  debugLog(plugin, `Searching for pattern: ${patternName}`);

  // Function to search for a file in a folder
  async function searchInFolder(folderPath: string): Promise<TFile | null> {
    const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (folder instanceof TFolder) {
      debugLog(plugin, `Searching in folder: ${folderPath}`);
      const files = folder.children.filter(file => file instanceof TFile);
      debugLog(plugin, `Files in folder: ${files.map(f => f.name).join(', ')}`);
      
      // Try exact match first
      let patternFile = files.find(file => file.name === patternName);
      
      // If not found, try with .md extension
      if (!patternFile) {
        patternFile = files.find(file => file.name === `${patternName}.md`);
      }
      
      // If still not found, try case-insensitive match
      if (!patternFile) {
        patternFile = files.find(file => file.name.toLowerCase() === patternName.toLowerCase());
      }

      if (patternFile && patternFile instanceof TFile) {
        debugLog(plugin, `Pattern found: ${patternFile.path}`);
        return patternFile;
      }
    } else {
      debugLog(plugin, `Folder not found: ${folderPath}`);
    }
    return null;
  }

  // Search in custom patterns folder
  let patternFile = await searchInFolder(plugin.settings.customPatternsFolder);
  
  // If not found, search in fabric patterns folder
  if (!patternFile) {
    patternFile = await searchInFolder(plugin.settings.fabricPatternsFolder);
  }

  if (patternFile) {
    return await plugin.app.vault.read(patternFile);
  }

  // If pattern is not found in either folder
  debugLog(plugin, `Pattern '${patternName}' not found in custom or fabric patterns folders`);
  throw new Error(`Pattern '${patternName}' not found in custom or fabric patterns folders`);
}

export async function searchPatterns(plugin: MeshAIPlugin, query: string, limit: number = 10): Promise<Fuzzysort.Results> {
  const allPatterns = [...await plugin.loadCustomPatterns(), ...await plugin.loadFabricPatterns()];
  return Fuzzysort.go(query, allPatterns, { limit });
}

export async function onPatternSearch(
  plugin: MeshAIPlugin, 
  query: string, 
  resultsContainer: HTMLElement, 
  onSelect: (pattern: string) => void,
  onResultsUpdated: (resultElements: HTMLElement[]) => void
) {
  resultsContainer.empty();
  if (query.length === 0) {
    resultsContainer.addClass('hidden');
    onResultsUpdated([]);
    return;
  }

  const results = await searchPatterns(plugin, query);

  if (results.length > 0) {
    const resultElements: HTMLElement[] = [];
    results.forEach((result, index) => {
      const el = resultsContainer.createEl('div', { text: result.target, cls: 'pattern-result' });
      el.addEventListener('click', () => onSelect(result.target));
      resultElements.push(el);
    });
    resultsContainer.removeClass('hidden');
    onResultsUpdated(resultElements);
  } else {
    resultsContainer.addClass('hidden');
    onResultsUpdated([]);
  }
}

export function onPatternSelect(
  pattern: string, 
  selectedPatterns: string[], 
  updateDisplay: () => void, 
  clearInput: () => void, 
  clearResults: () => void
) {
  if (!selectedPatterns.includes(pattern)) {
    selectedPatterns.push(pattern);
    updateDisplay();
  }
  clearInput();
  clearResults();
}

export function updateSelectedPatternsDisplay(
  title: HTMLElement,
  container: HTMLElement,
  selectedPatterns: string[],
  setSelectedPatterns: (patterns: string[]) => void
) {
  container.empty();
  selectedPatterns.forEach(pattern => {
    const patternEl = createSelectedPatternElement(pattern, (removedPattern) => {
      const updatedPatterns = selectedPatterns.filter(p => p !== removedPattern);
      title.addClass('hidden');
      setSelectedPatterns(updatedPatterns);
      updateSelectedPatternsDisplay(title, container, updatedPatterns, setSelectedPatterns);
    });
    container.appendChild(patternEl);
    title.removeClass('hidden');
  });
}

export function createSelectedPatternElement(pattern: string, onRemove: (pattern: string) => void): HTMLElement {
  const patternEl = document.createElement('div');
  patternEl.textContent = pattern;
  patternEl.className = 'selected-pattern';
  
  const removeButton = patternEl.createEl('span', { text: '×', cls: 'remove-pattern' });
  removeButton.addEventListener('click', () => onRemove(pattern));
  
  return patternEl;
}

