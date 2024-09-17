import MeshAIPlugin from '../main';
import { Workflow } from '../types';
import { processPatterns, processStitchedPatterns } from './MeshUtils';

export async function processWorkflow(plugin: MeshAIPlugin, workflow: Workflow, input: string): Promise<string> {
    if (workflow.usePatternStitching == true) {
        return await processStitchedPatterns(plugin, workflow.provider, workflow.patterns, input);
    } else {
        return await processPatterns(plugin, workflow.provider, workflow.patterns, input);
    }
}