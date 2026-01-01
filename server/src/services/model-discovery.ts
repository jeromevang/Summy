/**
 * Model Discovery Service
 * Provides functionality for discovering and managing available LLM models.
 */

import { modelDiscovery } from './model-discovery/ModelDiscoveryService.js';

/**
 * The singleton instance of the Model Discovery Service.
 */
export { modelDiscovery };

/**
 * Default export of the modelDiscovery instance.
 */
export default modelDiscovery;