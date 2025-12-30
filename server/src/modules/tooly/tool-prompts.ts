/**
 * Tool Prompts and Schemas
 * Barrel export for tool system prompt snippets and OpenAI-compatible schemas
 */

import { TOOL_PROMPTS } from './prompts/tool-prompts.js';
import { TOOL_SCHEMAS, OpenAIToolSchema } from './schemas/tool-schemas.js';

export { TOOL_PROMPTS, TOOL_SCHEMAS };
export type { OpenAIToolSchema };

/**
 * Get the OpenAI-compatible schemas for a list of tools
 */
export function getToolSchemas(enabledTools: string[]): OpenAIToolSchema[] {
  return enabledTools
    .filter(tool => TOOL_SCHEMAS[tool])
    .map(tool => TOOL_SCHEMAS[tool]);
}

/**
 * Get a single tool's prompt
 */
export function getToolPrompt(toolName: string): string | null {
  return TOOL_PROMPTS[toolName] || null;
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return Object.keys(TOOL_SCHEMAS);
}

/**
 * Build a combined system prompt from enabled tools
 */
export function buildToolSystemPrompt(enabledTools: string[]): string {
  const prompts = enabledTools
    .filter(tool => TOOL_PROMPTS[tool])
    .map(tool => TOOL_PROMPTS[tool]);
  
  if (prompts.length === 0) return '';
  
  return `## Available Tools\n\n${prompts.join('\n\n')}`;
}

/**
 * Build a full system prompt with custom options
 */
export interface BuildSystemPromptOptions {
  enabledTools: string[];
  customHeader?: string;
  customRules?: string[];
  includeRiskWarnings?: boolean;
}

export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const { enabledTools, customHeader, customRules, includeRiskWarnings = true } = options;
  
  const parts: string[] = [];
  
  if (customHeader) parts.push(customHeader);
  
  const toolPrompts = enabledTools
    .filter(tool => TOOL_PROMPTS[tool])
    .map(tool => TOOL_PROMPTS[tool]);
  
  if (toolPrompts.length > 0) {
    parts.push(`## Available Tools\n\n${toolPrompts.join('\n\n')}`);
  }
  
  if (customRules && customRules.length > 0) {
    parts.push(`## Rules\n\n${customRules.map(r => `- ${r}`).join('\n')}`);
  }
  
  if (includeRiskWarnings) {
    const dangerousTools = enabledTools.filter(t => 
      ['file_delete', 'folder_delete', 'git_reset', 'shell_exec'].includes(t)
    );
    if (dangerousTools.length > 0) {
      parts.push(`## ⚠️ Risk Warnings\n\nThe following tools can cause data loss: ${dangerousTools.join(', ')}. Use with caution.`);
    }
  }
  
  return parts.join('\n\n');
}