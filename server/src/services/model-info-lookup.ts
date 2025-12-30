/**
 * Model Info Lookup Service
 */

export * from './model-info/index.js';
import { modelInfoService } from './model-info/ModelInfoService.js';

export const lookupModelInfo = (modelId: string, skipCache: boolean = false) => 
  modelInfoService.lookupModelInfo(modelId, skipCache);

export { modelInfoService };
export default modelInfoService;