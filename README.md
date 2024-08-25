# Mesh AI

### Fabric Alernative

This plugin integrates various AI providers into Obsidian, allowing for AI-generated content and interactions directly within your notes. 

## Table of Contents

- [Mesh AI](#mesh-ai)
    - [Fabric Alernative](#fabric-alernative)
  - [Table of Contents](#table-of-contents)
  - [Description](#description)
  - [Installation](#installation)
  - [Usage](#usage)
    - [General Workflow](#general-workflow)
    - [Detailed Steps](#detailed-steps)
  - [Settings](#settings)
    - [Configuration Options](#configuration-options)
  - [Commands](#commands)
  - [Patterns](#patterns)
    - [Managing Patterns](#managing-patterns)
  - [License](#license)

## Description

A plugin to integrate AI functionalities into Obsidian. Supported providers include OpenAI, Google, Microsoft, Anthropic, Grocq, and Ollama. This plugin allows for querying these services, managing patterns for content generation, and integrating responses directly into your Obsidian vault.

## Installation

1. **Download the plugin**: Get the latest release from the repository.
2. **Install the plugin**: Place the plugin files in `<vault>/.obsidian/plugins/mesh-ai-integration`.
3. **Enable the plugin**: Go to the Obsidian settings, find the Mesh AI Integration Plugin, and enable it.

## Usage

### General Workflow

1. **Select provider**: Choose an AI service provider from the available options.
2. **Choose input source**: Decide whether the input text will come from the active note, clipboard, or a Tavily search.
3. **Select patterns**: Add patterns for processing the content.
4. **Generate output**: Submit your inputs to generate an AI response, which will be directly integrated into a new note or the current content.

### Detailed Steps

1. Open the Mesh AI view using the ribbon icon.
2. Select the desired AI provider and model.
3. Choose the source of your input: active note, clipboard, or perform a Tavily search.
4. Select and order patterns for processing the content.
5. Click "Submit" to generate the AI response.

## Settings

Access the settings tab for Mesh AI Integration Plugin via the Obsidian settings panel. 

### Configuration Options

- **API Keys**: Enter the API keys for OpenAI, Google, Microsoft, Anthropic, Grocq, and Tavily.
- **Model Selection**: For each provider, select the model to be used.
- **Custom Patterns Folder**: Specify the folder path for your custom patterns.
- **Fabric Patterns Folder**: Specify the default folder for downloaded fabric patterns.
- **Mesh Output Folder**: Specify the folder for the AI-generated output.
- **Enable Debugging**: Toggle console logging for debugging purposes.

## Commands

This plugin supports several commands accessible via the command palette:

- **Load Patterns**: Load patterns from custom and fabric folders.
- **Download Patterns from GitHub**: Download patterns from an official repository.
- **Clear Fabric Patterns Folder**: Delete all the patterns from the fabric patterns folder.

## Patterns

Patterns are markdown files with specific structures recognized by the plugin to modify and process the input content before querying the AI provider. You can manage patterns within the specified folders.

### Managing Patterns

- **Load Patterns**: Automatically detect and list patterns from the custom and fabric folders.
- **Download Patterns**: Fetch patterns from a GitHub repository and store/update them in the fabric patterns folder.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

For any further queries or issues, please refer to the official [GitHub repository](https://github.com/your-rerepository/mesh-ai-integration).