/**
 * Cognitive Engine Module
 */

export * from './cognitive-engine/index.js';

import { cognitiveEngine as engine } from './cognitive-engine/cognitive-engine-impl.js';
export const cognitiveEngine = engine;
export default cognitiveEngine;