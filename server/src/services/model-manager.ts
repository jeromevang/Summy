/**
 * Enhanced Model Management Service
 * Provides a unified interface for managing various LLM models across different providers.
 */

import { modelManager } from './model-manager/ModelManagerService.js';

/**
 * The singleton instance of the Model Management Service.
 */
export { modelManager };

/**
 * Default export of the modelManager instance.
 */
export default modelManager;