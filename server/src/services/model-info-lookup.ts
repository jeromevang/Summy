/**
 * Model Info Lookup Service
 * Provides functionality for looking up detailed information about LLM models.
 */

import { modelInfoService } from './model-info/ModelInfoService.js';

/**
 * Looks up detailed information for a given model ID.
 * @param modelId - The identifier of the model to look up.
 * @param skipCache - If true, bypasses the cache and fetches fresh information.
 * @returns The model information object.
 */
export const lookupModelInfo = (modelId: string, skipCache: boolean = false) => 
  modelInfoService.lookupModelInfo(modelId, skipCache);

/**
 * The singleton instance of the Model Info Service.
 */
export { modelInfoService };

/**
 * Default export of the modelInfoService instance.
 */
export default modelInfoService;