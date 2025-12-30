export const QUALIFYING_GATE = [
  { id: 'QG-1', name: 'Tool Format Valid', icon: '📝' },
  { id: 'QG-2', name: 'Instruction Following', icon: '📋' },
  { id: 'QG-3', name: 'Context Coherence', icon: '🎯' },
  { id: 'QG-4', name: 'Basic Reasoning', icon: '🧠' },
  { id: 'QG-5', name: 'State Transition', icon: '🔄' },
];

export const CATEGORIES = [
  { key: 'tool', name: 'Tool Calling', icon: '🔧', weight: '20%' },
  { key: 'rag', name: 'RAG Usage', icon: '📚', weight: '18%' },
  { key: 'reasoning', name: 'Reasoning', icon: '🧠', weight: '15%' },
  { key: 'intent', name: 'Intent Recognition', icon: '🎯', weight: '10%' },
  { key: 'browser', name: 'Browser/Web', icon: '🌐', weight: '10%' },
  { key: 'multi_turn', name: 'Multi-Turn', icon: '💬', weight: '10%' },
  { key: 'boundary', name: 'Boundaries', icon: '🧱', weight: '10%' },
  { key: 'fault_injection', name: 'Fault Recovery', icon: '💥', weight: '7%' },
] as const;

export const THRESHOLD = 70;
