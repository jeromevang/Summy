import learningSystem from './learning-system.js';
import patternExtractor from './pattern-extractor.js';
import memoryStore from './memory-store.js';
import promptBuilder from './prompt-builder.js';

export { learningSystem };
export { patternExtractor };
export { memoryStore };
export { promptBuilder };

// Types
export type { Interaction, ExtractedPattern } from './learning-system.js';
export type { LearnedPattern, Interaction as PatternInteraction } from './pattern-extractor.js';
export type {
    GlobalMemory,
    ProjectMemory,
    PatternMemory,
    LearningInteraction
} from './memory-store.js';
export type { PromptContext, BuiltPrompt, ToolConfig } from './prompt-builder.js';

// Prosthetic Store (Phase 11 - Agentic Readiness)
export * from './prosthetic-store.js';

