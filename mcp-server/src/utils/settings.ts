/**
 * Settings Reader Utility
 *
 * Reads settings.json from the main server directory to get MCP configuration.
 */

import fs from 'fs';
import path from 'path';
import { ToolCategory, ToolsetName } from '../config/toolset-presets.js';

export interface MCPSettings {
  toolset?: ToolsetName;
  customCategories?: ToolCategory[];
}

export interface Settings {
  mcp?: MCPSettings;
  [key: string]: any;
}

/**
 * Read settings.json from the main server directory
 * Returns null if file doesn't exist or can't be parsed
 */
export function readSettingsFile(): Settings | null {
  try {
    // Path relative to mcp-server/src/utils -> ../../server/settings.json
    const settingsPath = path.resolve(__dirname, '../../../server/settings.json');

    if (!fs.existsSync(settingsPath)) {
      console.log('[MCP Settings] settings.json not found at:', settingsPath);
      return null;
    }

    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as Settings;

    return settings;
  } catch (error: any) {
    console.error('[MCP Settings] Failed to read settings.json:', error.message);
    return null;
  }
}

/**
 * Get MCP configuration from settings
 * Returns default values if not configured
 */
export function getMCPConfig(): MCPSettings {
  const settings = readSettingsFile();

  if (!settings || !settings.mcp) {
    console.log('[MCP Settings] No mcp config found, using default: standard');
    return {
      toolset: 'standard',
      customCategories: []
    };
  }

  return {
    toolset: settings.mcp.toolset || 'standard',
    customCategories: settings.mcp.customCategories || []
  };
}
