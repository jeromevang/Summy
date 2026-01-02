/**
 * Hook Logger Service
 * Tracks and broadcasts Claude Code hook executions
 * Provides real-time monitoring and statistics for hook activity
 */

// ============================================================
// TYPES
// ============================================================

export interface HookExecution {
  id: string;
  hookName: string;
  timestamp: Date;
  status: 'running' | 'success' | 'error';
  duration?: number;
  input?: {
    transcriptPath?: string;
    messageCount?: number;
    estimatedTokens?: number;
  };
  output?: {
    summary?: string;
    compression?: number;
    tokensSaved?: number;
  };
  error?: string;
  lmStudioTime?: number;
  cliTime?: number;
}

export interface HookStats {
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  lastHourCount: number;
  lmStudioOnline: boolean;
}

// ============================================================
// IN-MEMORY STORAGE
// ============================================================

const MAX_HISTORY = 100;
const hookExecutions: HookExecution[] = [];
const activeExecutions = new Map<string, HookExecution>();

// ============================================================
// HOOK LOGGING FUNCTIONS
// ============================================================

/**
 * Start logging a hook execution
 */
export function logHookStart(data: {
  hookName: string;
  transcriptPath?: string;
  messageCount?: number;
}): string {
  const id = `hook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const execution: HookExecution = {
    id,
    hookName: data.hookName,
    timestamp: new Date(),
    status: 'running',
    input: {
      transcriptPath: data.transcriptPath,
      messageCount: data.messageCount
    }
  };

  activeExecutions.set(id, execution);
  hookExecutions.unshift(execution);

  // Trim history
  if (hookExecutions.length > MAX_HISTORY) {
    hookExecutions.length = MAX_HISTORY;
  }

  // Broadcast to WebSocket
  broadcastHookActivity(execution);

  return id;
}

/**
 * Complete a hook execution successfully
 */
export function logHookComplete(id: string, data: {
  summary?: string;
  compression?: number;
  tokensSaved?: number;
  duration?: number;
  lmStudioTime?: number;
  cliTime?: number;
}): void {
  const execution = activeExecutions.get(id);

  if (!execution) {
    console.warn(`[HookLogger] Execution ${id} not found`);
    return;
  }

  execution.status = 'success';
  execution.duration = data.duration || (Date.now() - execution.timestamp.getTime());
  execution.lmStudioTime = data.lmStudioTime;
  execution.cliTime = data.cliTime;
  execution.output = {
    summary: data.summary,
    compression: data.compression,
    tokensSaved: data.tokensSaved
  };

  activeExecutions.delete(id);

  // Broadcast update
  broadcastHookActivity(execution);
}

/**
 * Mark a hook execution as failed
 */
export function logHookError(id: string, error: string): void {
  const execution = activeExecutions.get(id);

  if (!execution) {
    console.warn(`[HookLogger] Execution ${id} not found`);
    return;
  }

  execution.status = 'error';
  execution.duration = Date.now() - execution.timestamp.getTime();
  execution.error = error;

  activeExecutions.delete(id);

  // Broadcast update
  broadcastHookActivity(execution);
}

// ============================================================
// QUERY FUNCTIONS
// ============================================================

/**
 * Get recent hook executions
 */
export function getRecentExecutions(limit: number = 20): HookExecution[] {
  return hookExecutions.slice(0, limit);
}

/**
 * Get a specific execution by ID
 */
export function getExecution(id: string): HookExecution | undefined {
  return hookExecutions.find(exec => exec.id === id);
}

/**
 * Get hook statistics
 */
export function getHookStats(): HookStats {
  const oneHourAgo = Date.now() - 3600000;
  const recentExecutions = hookExecutions.filter(exec => exec.timestamp.getTime() > oneHourAgo);

  const completedExecutions = hookExecutions.filter(exec => exec.status !== 'running');
  const successfulExecutions = completedExecutions.filter(exec => exec.status === 'success');

  const avgDuration = completedExecutions.length > 0
    ? completedExecutions.reduce((sum, exec) => sum + (exec.duration || 0), 0) / completedExecutions.length
    : 0;

  // Check if LM Studio is online (heuristic: recent successful AI-generated summaries)
  const recentSuccesses = recentExecutions.filter(exec => exec.status === 'success');
  const lmStudioOnline = recentSuccesses.some(exec => exec.lmStudioTime && exec.lmStudioTime > 0);

  return {
    totalExecutions: hookExecutions.length,
    successRate: completedExecutions.length > 0
      ? (successfulExecutions.length / completedExecutions.length) * 100
      : 0,
    avgDuration: Math.round(avgDuration),
    lastHourCount: recentExecutions.length,
    lmStudioOnline
  };
}

// ============================================================
// WEBSOCKET BROADCASTING
// ============================================================

let wsBroadcast: ((type: string, data: any) => void) | null = null;

/**
 * Initialize WebSocket broadcasting
 */
export function initializeHookLogger(broadcastFn: (type: string, data: any) => void): void {
  wsBroadcast = broadcastFn;
  console.log('[HookLogger] Initialized with WebSocket broadcasting');
}

/**
 * Broadcast hook activity to connected clients
 */
function broadcastHookActivity(execution: HookExecution): void {
  if (wsBroadcast) {
    wsBroadcast('hook-activity', {
      execution,
      stats: getHookStats()
    });
  }
}

// ============================================================
// CLEANUP
// ============================================================

/**
 * Clear all hook execution history
 */
export function clearHistory(): void {
  hookExecutions.length = 0;
  activeExecutions.clear();
  console.log('[HookLogger] History cleared');
}

/**
 * Get active (running) executions
 */
export function getActiveExecutions(): HookExecution[] {
  return Array.from(activeExecutions.values());
}

