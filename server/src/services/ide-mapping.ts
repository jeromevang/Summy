/**
 * IDE Mapping Service
 * 
 * Handles detection of IDE from model name suffix and maps IDE-specific
 * tools to MCP tools. Also builds unified system prompts that combine
 * IDE tools with additional MCP capabilities.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { TOOL_PROMPTS } from '../modules/tooly/tool-prompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to IDE mapping files
const IDE_MAPPINGS_DIR = path.join(__dirname, '../../data/ide-mappings');

// Known IDE suffixes
const KNOWN_IDES = ['continue', 'cursor', 'copilot', 'windsurf', 'zed', 'vscode'] as const;
type KnownIDE = typeof KNOWN_IDES[number];

// IDE Mapping file structure
export interface ToolMapping {
  mcp: string;
  params?: Record<string, string>;  // IDE param name -> MCP param name
  transform?: string;  // Name of transform function for complex mappings
  description?: string;
}

export interface IDEOnlyTool {
  description: string;
  action: 'passthrough' | 'ignore';
}

export interface IDEMapping {
  ide: string;
  version: string;
  description: string;
  modelSuffix: string | null;
  mappings: Record<string, ToolMapping>;
  ideOnly: Record<string, IDEOnlyTool>;
  browserTools?: Record<string, { mcp: string }>;
  // Note: mcpExtensions is computed dynamically, not stored in JSON
}

export interface ParsedModel {
  baseModel: string;
  ide: string | null;
  ideSuffix: string | null;
}

// Cache for loaded mappings
const mappingCache: Map<string, IDEMapping> = new Map();

/**
 * Parse model name to extract base model and IDE suffix
 * Examples:
 *   "gpt-4o-continue" -> { baseModel: "gpt-4o", ide: "continue", ideSuffix: "continue" }
 *   "claude-3-sonnet-cursor" -> { baseModel: "claude-3-sonnet", ide: "cursor", ideSuffix: "cursor" }
 *   "gpt-4o" -> { baseModel: "gpt-4o", ide: null, ideSuffix: null }
 */
export function parseModelIDE(model: string): ParsedModel {
  if (!model) {
    return { baseModel: model, ide: null, ideSuffix: null };
  }

  const lowerModel = model.toLowerCase();
  
  // Check if model ends with a known IDE suffix
  for (const ide of KNOWN_IDES) {
    if (lowerModel.endsWith(`-${ide}`)) {
      const baseModel = model.slice(0, -(ide.length + 1));  // Remove "-ide" suffix
      return {
        baseModel,
        ide,
        ideSuffix: ide
      };
    }
  }

  return { baseModel: model, ide: null, ideSuffix: null };
}

/**
 * Load IDE mapping from JSON file
 */
export async function loadIDEMapping(ide: string | null): Promise<IDEMapping> {
  const mappingFile = ide ? `${ide}.json` : 'default.json';
  const cacheKey = mappingFile;

  // Check cache first
  if (mappingCache.has(cacheKey)) {
    return mappingCache.get(cacheKey)!;
  }

  const filePath = path.join(IDE_MAPPINGS_DIR, mappingFile);
  
  try {
    // Try to load specific IDE mapping
    if (await fs.pathExists(filePath)) {
      const mapping = await fs.readJson(filePath) as IDEMapping;
      mappingCache.set(cacheKey, mapping);
      return mapping;
    }
  } catch (error) {
    console.warn(`Failed to load IDE mapping ${mappingFile}:`, error);
  }

  // Fall back to default mapping
  try {
    const defaultPath = path.join(IDE_MAPPINGS_DIR, 'default.json');
    const defaultMapping = await fs.readJson(defaultPath) as IDEMapping;
    mappingCache.set(cacheKey, defaultMapping);
    return defaultMapping;
  } catch (error) {
    console.error('Failed to load default IDE mapping:', error);
    // Return empty mapping as last resort
    return {
      ide: 'Unknown',
      version: '1.0.0',
      description: 'Fallback empty mapping',
      modelSuffix: null,
      mappings: {},
      ideOnly: {}
    };
  }
}

/**
 * Clear the mapping cache (useful for hot-reloading)
 */
export function clearMappingCache(): void {
  mappingCache.clear();
}

/**
 * Get all mapped tool names (IDE tools that map to MCP tools)
 */
export function getMappedToolNames(mapping: IDEMapping): string[] {
  return Object.keys(mapping.mappings);
}

/**
 * Get all IDE-only tool names (tools handled by IDE, not MCP)
 */
export function getIDEOnlyToolNames(mapping: IDEMapping): string[] {
  return Object.keys(mapping.ideOnly);
}

/**
 * Check if a tool is mapped to MCP
 */
export function isMappedTool(toolName: string, mapping: IDEMapping): boolean {
  return toolName in mapping.mappings || 
         (mapping.browserTools !== undefined && toolName in mapping.browserTools);
}

/**
 * Check if a tool is IDE-only (passthrough)
 */
export function isIDEOnlyTool(toolName: string, mapping: IDEMapping): boolean {
  return toolName in mapping.ideOnly;
}

/**
 * Compute MCP extensions from model's enabled tools
 * Returns tools that are enabled for the model but NOT covered by IDE mappings
 */
export function computeMCPExtensions(modelEnabledTools: string[], mapping: IDEMapping): string[] {
  // Get all MCP tools that IDE mappings cover
  const coveredByIDE = new Set<string>();
  
  // Add tools from regular mappings
  for (const toolMapping of Object.values(mapping.mappings)) {
    coveredByIDE.add(toolMapping.mcp);
  }
  
  // Add tools from browser mappings
  if (mapping.browserTools) {
    for (const browserMapping of Object.values(mapping.browserTools)) {
      coveredByIDE.add(browserMapping.mcp);
    }
  }
  
  // Return enabled tools that aren't covered by IDE mappings
  return modelEnabledTools.filter(tool => !coveredByIDE.has(tool));
}

/**
 * Check if a tool is an MCP extension (not covered by IDE)
 */
export function isMCPExtension(toolName: string, modelEnabledTools: string[], mapping: IDEMapping): boolean {
  const extensions = computeMCPExtensions(modelEnabledTools, mapping);
  return extensions.includes(toolName);
}

/**
 * Map IDE tool call to MCP tool call
 */
export function mapToolCall(
  ideToolName: string, 
  ideParams: Record<string, any>, 
  mapping: IDEMapping
): { mcpTool: string; mcpParams: Record<string, any> } | null {
  
  // Check browser tools first (for Cursor)
  if (mapping.browserTools && ideToolName in mapping.browserTools) {
    const browserMapping = mapping.browserTools[ideToolName];
    return {
      mcpTool: browserMapping.mcp,
      mcpParams: ideParams  // Browser tools use same params
    };
  }

  // Check regular mappings
  const toolMapping = mapping.mappings[ideToolName];
  if (!toolMapping) {
    return null;
  }

  // If there's a transform, we need special handling
  if (toolMapping.transform) {
    return applyTransform(toolMapping.transform, ideParams, toolMapping);
  }

  // Simple parameter mapping
  const mcpParams: Record<string, any> = {};
  
  if (toolMapping.params) {
    for (const [ideParam, mcpParam] of Object.entries(toolMapping.params)) {
      if (ideParam in ideParams) {
        mcpParams[mcpParam] = ideParams[ideParam];
      }
    }
  } else {
    // No param mapping, pass through as-is
    Object.assign(mcpParams, ideParams);
  }

  return {
    mcpTool: toolMapping.mcp,
    mcpParams
  };
}

/**
 * Apply transform function for complex mappings
 */
function applyTransform(
  transformName: string, 
  ideParams: Record<string, any>,
  mapping: ToolMapping
): { mcpTool: string; mcpParams: Record<string, any> } {
  
  switch (transformName) {
    case 'continueEditToMcpEdit':
      // Continue's edit_existing_file uses different structure
      return {
        mcpTool: mapping.mcp,
        mcpParams: {
          path: ideParams.filepath || ideParams.path,
          edits: [{
            oldText: ideParams.find || ideParams.old_string,
            newText: ideParams.replace || ideParams.new_string
          }]
        }
      };

    case 'cursorStrReplaceToMcpEdit':
      // Cursor's StrReplace maps to edit_file
      return {
        mcpTool: mapping.mcp,
        mcpParams: {
          path: ideParams.path,
          edits: [{
            oldText: ideParams.old_string,
            newText: ideParams.new_string
          }]
        }
      };

    default:
      console.warn(`Unknown transform: ${transformName}`);
      return {
        mcpTool: mapping.mcp,
        mcpParams: ideParams
      };
  }
}

/**
 * Build unified system prompt that describes all available tools
 * (both IDE-mapped tools and MCP extensions)
 */
export function buildUnifiedToolPrompt(modelEnabledTools: string[], mapping: IDEMapping): string {
  const sections: string[] = [];
  const mcpExtensions = computeMCPExtensions(modelEnabledTools, mapping);

  // Add MCP extension tools that aren't covered by IDE
  if (mcpExtensions.length > 0) {
    const toolDescriptions = mcpExtensions
      .filter(tool => TOOL_PROMPTS[tool])
      .map(tool => `- **${tool}**: ${TOOL_PROMPTS[tool]}`)
      .join('\n');

    if (toolDescriptions) {
      sections.push(`
<additional_mcp_tools>
You also have access to these additional tools via MCP:

${toolDescriptions}

To use these tools, call them by name with the appropriate parameters.
</additional_mcp_tools>`);
    }
  }

  return sections.join('\n\n');
}

/**
 * Get the list of MCP tools to add to the tools array
 * These are tools not covered by IDE mappings
 */
export function getMCPToolsToAdd(modelEnabledTools: string[], mapping: IDEMapping): string[] {
  return computeMCPExtensions(modelEnabledTools, mapping);
}

/**
 * List all available IDE mappings
 */
export async function listAvailableIDEs(): Promise<string[]> {
  try {
    const files = await fs.readdir(IDE_MAPPINGS_DIR);
    return files
      .filter(f => f.endsWith('.json') && f !== 'default.json')
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/**
 * Reload a specific IDE mapping (for hot reload)
 */
export async function reloadIDEMapping(ide: string): Promise<IDEMapping | null> {
  mappingCache.delete(`${ide}.json`);
  try {
    return await loadIDEMapping(ide);
  } catch {
    return null;
  }
}

/**
 * Process a tool call from LLM response
 * Returns the mapped MCP tool info or null if it should be passed through to IDE
 */
export function processToolCall(
  toolName: string,
  toolParams: Record<string, any>,
  modelEnabledTools: string[],
  mapping: IDEMapping
): { action: 'execute' | 'passthrough' | 'unknown'; mcpTool?: string; mcpParams?: Record<string, any> } {
  
  // Check if it's an IDE-only tool (passthrough to IDE)
  if (isIDEOnlyTool(toolName, mapping)) {
    return { action: 'passthrough' };
  }
  
  // Check if it's a mapped tool (IDE -> MCP)
  const mapped = mapToolCall(toolName, toolParams, mapping);
  if (mapped) {
    return {
      action: 'execute',
      mcpTool: mapped.mcpTool,
      mcpParams: mapped.mcpParams
    };
  }
  
  // Check if it's a direct MCP tool from model's enabled tools
  if (isMCPExtension(toolName, modelEnabledTools, mapping)) {
    return {
      action: 'execute',
      mcpTool: toolName,
      mcpParams: toolParams
    };
  }
  
  // Unknown tool
  return { action: 'unknown' };
}

/**
 * Get statistics about the IDE mapping
 */
export function getMappingStats(modelEnabledTools: string[], mapping: IDEMapping): {
  ide: string;
  mappedTools: number;
  ideOnlyTools: number;
  mcpExtensions: number;
  browserTools: number;
} {
  const extensions = computeMCPExtensions(modelEnabledTools, mapping);
  return {
    ide: mapping.ide,
    mappedTools: Object.keys(mapping.mappings).length,
    ideOnlyTools: Object.keys(mapping.ideOnly).length,
    mcpExtensions: extensions.length,
    browserTools: mapping.browserTools ? Object.keys(mapping.browserTools).length : 0
  };
}

// Export singleton-like interface
export const ideMapping = {
  parseModelIDE,
  loadIDEMapping,
  clearMappingCache,
  getMappedToolNames,
  getIDEOnlyToolNames,
  isMappedTool,
  isIDEOnlyTool,
  isMCPExtension,
  mapToolCall,
  computeMCPExtensions,
  buildUnifiedToolPrompt,
  getMCPToolsToAdd,
  listAvailableIDEs,
  reloadIDEMapping,
  processToolCall,
  getMappingStats
};

export default ideMapping;
