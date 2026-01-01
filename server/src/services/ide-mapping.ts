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
/**
 * Represents the known IDEs that can be detected from model suffixes.
 */
export type KnownIDE = typeof KNOWN_IDES[number];

// IDE Mapping file structure
/**
 * Defines how an IDE-specific tool maps to an MCP (Model Context Protocol) tool.
 */
export interface ToolMapping {
  /** The name of the corresponding MCP tool. */
  mcp: string;
  /** Maps IDE parameter names to MCP parameter names. */
  params?: Record<string, string>;
  /** The name of a transformation function for complex mappings (e.g., parameter restructuring). */
  transform?: string;
  /** An optional description of the tool mapping. */
  description?: string;
}

/**
 * Describes tools that are handled exclusively by the IDE and not by MCP.
 */
export interface IDEOnlyTool {
  /** A description of the IDE-only tool. */
  description: string;
  /** The action to take with this tool: 'passthrough' to IDE or 'ignore'. */
  action: 'passthrough' | 'ignore';
}

/**
 * Represents the structure of an IDE mapping configuration file.
 */
export interface IDEMapping {
  /** The identifier for the IDE (e.g., 'cursor', 'continue'). */
  ide: string;
  /** The version of the mapping configuration. */
  version: string;
  /** A human-readable description of the mapping. */
  description: string;
  /** A suffix appended to model names to identify this IDE, or null if none. */
  modelSuffix: string | null;
  /** Maps IDE tool names to their MCP counterparts. */
  mappings: Record<string, ToolMapping>;
  /** Defines tools handled exclusively by the IDE. */
  ideOnly: Record<string, IDEOnlyTool>;
  /** Optional mappings for browser-specific tools (e.g., for Cursor). */
  browserTools?: Record<string, { mcp: string }>;
  // Note: mcpExtensions is computed dynamically, not stored in JSON
}

/**
 * Represents a parsed model name, identifying the base model and any associated IDE.
 */
export interface ParsedModel {
  /** The base model name (e.g., 'gpt-4o'). */
  baseModel: string;
  /** The detected IDE, or null if none. */
  ide: string | null;
  /** The detected IDE suffix from the model name, or null if none. */
  ideSuffix: string | null;
}

// Cache for loaded mappings to avoid repeated file reads
const mappingCache: Map<string, IDEMapping> = new Map();

/**
 * Parses a model name to extract the base model and identify the IDE suffix.
 * Examples:
 *   "gpt-4o-continue" -> { baseModel: "gpt-4o", ide: "continue", ideSuffix: "continue" }
 *   "claude-3-sonnet-cursor" -> { baseModel: "claude-3-sonnet", ide: "cursor", ideSuffix: "cursor" }
 *   "gpt-4o" -> { baseModel: "gpt-4o", ide: null, ideSuffix: null }
 * @param model - The model name string to parse.
 * @returns An object containing the base model and detected IDE information.
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
 * Loads the IDE mapping configuration from a JSON file.
 * It prioritizes specific IDE mappings and falls back to a default mapping.
 * @param ide - The IDE identifier (e.g., 'cursor') or null for default mapping.
 * @returns A promise that resolves with the IDEMapping configuration.
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

  // Fall back to default mapping if specific mapping not found or failed to load
  try {
    const defaultPath = path.join(IDE_MAPPINGS_DIR, 'default.json');
    const defaultMapping = await fs.readJson(defaultPath) as IDEMapping;
    mappingCache.set(cacheKey, defaultMapping);
    return defaultMapping;
  } catch (error) {
    console.error('Failed to load default IDE mapping:', error);
    // Return empty mapping as a last resort to prevent crashes
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
 * Clears the entire mapping cache. Useful for development or when mappings are updated.
 */
export function clearMappingCache(): void {
  mappingCache.clear();
}

/**
 * Retrieves a list of all IDE tool names that are mapped to MCP tools.
 * @param mapping - The IDEMapping configuration.
 * @returns An array of mapped tool names.
 */
export function getMappedToolNames(mapping: IDEMapping): string[] {
  return Object.keys(mapping.mappings);
}

/**
 * Retrieves a list of all tool names that are exclusively handled by the IDE.
 * @param mapping - The IDEMapping configuration.
 * @returns An array of IDE-only tool names.
 */
export function getIDEOnlyToolNames(mapping: IDEMapping): string[] {
  return Object.keys(mapping.ideOnly);
}

/**
 * Checks if a given tool name is mapped to an MCP tool (either directly or via browserTools).
 * @param toolName - The name of the tool to check.
 * @param mapping - The IDEMapping configuration.
 * @returns True if the tool is mapped, false otherwise.
 */
export function isMappedTool(toolName: string, mapping: IDEMapping): boolean {
  return toolName in mapping.mappings || 
         (mapping.browserTools !== undefined && toolName in mapping.browserTools);
}

/**
 * Checks if a given tool name is exclusively handled by the IDE.
 * @param toolName - The name of the tool to check.
 * @param mapping - The IDEMapping configuration.
 * @returns True if the tool is IDE-only, false otherwise.
 */
export function isIDEOnlyTool(toolName: string, mapping: IDEMapping): boolean {
  return toolName in mapping.ideOnly;
}

/**
 * Computes the list of MCP tools that are enabled for a model but not covered by IDE mappings.
 * These are considered 'MCP extensions'.
 * @param modelEnabledTools - An array of tool names enabled for the current model.
 * @param mapping - The IDEMapping configuration.
 * @returns An array of MCP extension tool names.
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
 * Checks if a specific tool is an MCP extension (i.e., enabled for the model but not mapped by the IDE).
 * @param toolName - The name of the tool to check.
 * @param modelEnabledTools - An array of tool names enabled for the current model.
 * @param mapping - The IDEMapping configuration.
 * @returns True if the tool is an MCP extension, false otherwise.
 */
export function isMCPExtension(toolName: string, modelEnabledTools: string[], mapping: IDEMapping): boolean {
  const extensions = computeMCPExtensions(modelEnabledTools, mapping);
  return extensions.includes(toolName);
}

/**
 * Maps an IDE tool call to its corresponding MCP tool call, handling parameter transformations.
 * @param ideToolName - The name of the tool as called by the IDE.
 * @param ideParams - The parameters for the IDE tool call.
 * @param mapping - The IDEMapping configuration.
 * @returns An object containing the MCP tool name and parameters, or null if no mapping is found.
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
 * Applies a specific transformation function to map IDE parameters to MCP parameters for complex cases.
 * @param transformName - The name of the transformation function.
 * @param ideParams - The parameters from the IDE tool call.
 * @param mapping - The ToolMapping object, which includes the transform name.
 * @returns The transformed MCP tool call details.
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
 * Builds a unified system prompt that describes all available tools (both IDE-mapped and MCP extensions).
 * This helps the LLM understand the full toolset it can utilize.
 * @param modelEnabledTools - An array of tool names that are enabled for the current model.
 * @param mapping - The IDEMapping configuration.
 * @returns A formatted string representing the tool descriptions for the system prompt.
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
 * Retrieves the list of MCP tools that should be added to the model's toolset
 * because they are enabled for the model but not covered by IDE mappings.
 * @param modelEnabledTools - An array of tool names enabled for the current model.
 * @param mapping - The IDEMapping configuration.
 * @returns An array of MCP tool names to be added.
 */
export function getMCPToolsToAdd(modelEnabledTools: string[], mapping: IDEMapping): string[] {
  return computeMCPExtensions(modelEnabledTools, mapping);
}

/**
 * Lists all available IDE mapping files in the `data/ide-mappings` directory.
 * @returns A promise that resolves with an array of available IDE identifiers (filenames without extension).
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
 * Reloads a specific IDE mapping from its JSON file, updating the cache.
 * Useful for applying changes without restarting the server.
 * @param ide - The IDE identifier for which to reload the mapping.
 * @returns A promise that resolves with the reloaded IDEMapping, or null if an error occurs.
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
 * Processes a tool call originating from the LLM response, determining the correct action.
 * It checks if the tool should be executed via MCP, passed to the IDE, or is unknown.
 * @param toolName - The name of the tool called by the LLM.
 * @param toolParams - The parameters of the tool call.
 * @param modelEnabledTools - An array of tool names enabled for the current model.
 * @param mapping - The IDEMapping configuration.
 * @returns An object indicating the action ('execute', 'passthrough', 'unknown') and optionally the MCP tool details.
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
 * Provides statistics about the current IDE mapping configuration.
 * @param modelEnabledTools - An array of tool names enabled for the current model.
 * @param mapping - The IDEMapping configuration.
 * @returns An object containing statistics about the mapping (e.g., counts of different tool types).
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

// Export a singleton-like interface for the IDE mapping functionalities
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
