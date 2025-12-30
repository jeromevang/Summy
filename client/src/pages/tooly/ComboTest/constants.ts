import { TestCategory, DifficultyTier } from './types';

export const CATEGORY_LABELS: Record<TestCategory, { name: string; emoji: string }> = {
  suppress: { name: 'Suppress', emoji: '🚫' },
  single_tool: { name: 'Single Tool', emoji: '🔧' },
  tool_select: { name: 'Tool Select', emoji: '🎯' },
  param_extract: { name: 'Param Extract', emoji: '📝' },
  clarify: { name: 'Clarify', emoji: '❓' },
  multi_tool: { name: 'Multi-Tool', emoji: '🔗' },
  reasoning: { name: 'Reasoning', emoji: '🧠' },
  refusal: { name: 'Refusal', emoji: '🛡️' },
};

export const TIER_COLORS: Record<DifficultyTier, string> = {
  simple: 'text-green-400',
  medium: 'text-yellow-400',
  complex: 'text-red-400',
};

export const CONTEXT_SIZES = [4096, 8192, 16384, 32768];
export const THRESHOLD = 70;
