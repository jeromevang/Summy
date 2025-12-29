/**
 * Shared Types for Tooly Frontend
 * Extracted from Tooly.tsx to reduce file size and improve reusability
 */

// ============================================================
// PROBE TYPES
// ============================================================

export interface ProbeTestResult {
    passed: boolean;
    score: number;
    details: string;
}

export interface ReasoningProbeResults {
    intentExtraction: ProbeTestResult;
    multiStepPlanning: ProbeTestResult;
    conditionalReasoning: ProbeTestResult;
    contextContinuity: ProbeTestResult;
    logicalConsistency: ProbeTestResult;
    explanation: ProbeTestResult;
    edgeCaseHandling: ProbeTestResult;
}

export interface ExtendedProbeResult {
    name: string;
    passed: boolean;
    score?: number;
}

export interface ProbeResults {
    testedAt: string;
    // Core tool probes (1.1 - 1.4)
    emitTest: ProbeTestResult;
    schemaTest: ProbeTestResult;
    selectionTest: ProbeTestResult;
    suppressionTest: ProbeTestResult;
    // Enhanced tool probes (1.5 - 1.8)
    nearIdenticalSelectionTest?: ProbeTestResult;
    multiToolEmitTest?: ProbeTestResult;
    argumentValidationTest?: ProbeTestResult;
    schemaReorderTest?: ProbeTestResult;
    // Reasoning
    reasoningProbes?: ReasoningProbeResults;
    // Extended probes
    strategicRAGProbes?: ExtendedProbeResult[];
    architecturalProbes?: ExtendedProbeResult[];
    navigationProbes?: ExtendedProbeResult[];
    helicopterProbes?: ExtendedProbeResult[];
    proactiveProbes?: ExtendedProbeResult[];
    intentProbes?: ExtendedProbeResult[];
    toolScore?: number;
    reasoningScore?: number;
    overallScore: number;
}

// ============================================================
// MODEL TYPES
// ============================================================

export interface ContextLatencyData {
    testedContextSizes: number[];
    latencies: Record<number, number>;
    maxUsableContext: number;
    recommendedContext: number;
    modelMaxContext?: number;
    minLatency?: number;
    isInteractiveSpeed?: boolean;
    speedRating?: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
}

export interface ModelInfo {
    name?: string;
    author?: string;
    description?: string;
    parameters?: string;
    architecture?: string;
    contextLength?: number;
    license?: string;
    quantization?: string;
    capabilities?: string[];
    tags?: string[];
    source?: string;
}

export interface Recommendation {
    id: string;
    type: 'success' | 'warning' | 'improvement' | 'info';
    message: string;
    action?: string;
}

export interface ModelProfile {
    modelId: string;
    displayName: string;
    provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter';
    testedAt: string;
    score: number;
    enabledTools: string[];
    capabilities: Record<string, { supported: boolean; score: number; nativeAliases?: string[] }>;
    contextLength?: number;
    maxContextLength?: number;
    role?: 'main' | 'executor' | 'both' | 'none';
    probeResults?: ProbeResults;
    contextLatency?: ContextLatencyData;
    systemPrompt?: string;
    discoveredNativeTools?: string[];
    unmappedNativeTools?: string[];
    scoreBreakdown?: {
        ragScore?: number;
        bugDetectionScore?: number;
        architecturalScore?: number;
        navigationScore?: number;
        proactiveScore?: number;
        toolScore?: number;
        reasoningScore?: number;
        intentScore?: number;
        overallScore?: number;
    };
    badges?: Array<{ id: string; name: string; icon: string }>;
    modelInfo?: ModelInfo;
    recommendations?: Recommendation[];
}

export interface DiscoveredModel {
    id: string;
    displayName: string;
    provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter';
    status: 'tested' | 'untested' | 'failed' | 'known_good';
    score?: number;
    toolScore?: number;
    reasoningScore?: number;
    toolCount?: number;
    totalTools?: number;
    role?: 'main' | 'executor' | 'both' | 'none';
    maxContextLength?: number;
    sizeBytes?: number;
    quantization?: string;
}

// ============================================================
// TEST TYPES
// ============================================================

export interface TestDefinition {
    id: string;
    tool: string;
    category: string;
    difficulty: string;
    prompt: string;
}

export interface ExecutionLog {
    id: string;
    timestamp: string;
    model: string;
    tool: string;
    status: 'success' | 'failed' | 'timeout';
    durationMs: number;
    backupId?: string;
}

export type TabId = 'models' | 'tests' | 'logs';

export type TestAllMode = 'quick' | 'standard' | 'deep' | 'optimization';

// ============================================================
// TOOL CATEGORIES
// ============================================================

export const TOOL_CATEGORIES: Record<string, string[]> = {
    'RAG - Semantic Search': ['rag_query', 'rag_status', 'rag_index'],
    'File Operations': ['read_file', 'read_multiple_files', 'write_file', 'edit_file', 'delete_file', 'copy_file', 'move_file', 'get_file_info', 'list_directory', 'search_files', 'create_directory', 'delete_directory', 'list_allowed_directories'],
    'Git Operations': ['git_status', 'git_diff', 'git_log', 'git_init', 'git_add', 'git_commit', 'git_push', 'git_pull', 'git_checkout', 'git_stash', 'git_stash_pop', 'git_reset', 'git_clone', 'git_branch_create', 'git_branch_list', 'git_blame', 'git_show'],
    'NPM Operations': ['npm_run', 'npm_install', 'npm_uninstall', 'npm_init', 'npm_test', 'npm_build', 'npm_list'],
    'Browser': ['browser_navigate', 'browser_go_back', 'browser_go_forward', 'browser_click', 'browser_type', 'browser_hover', 'browser_select_option', 'browser_press_key', 'browser_snapshot', 'browser_fetch_content', 'browser_take_screenshot', 'browser_wait', 'browser_resize', 'browser_handle_dialog', 'browser_drag', 'browser_tabs', 'browser_evaluate', 'browser_console_messages', 'browser_network_requests'],
    'HTTP/Search': ['http_request', 'url_fetch_content', 'web_search'],
    'Code Execution': ['shell_exec', 'run_python', 'run_node', 'run_typescript'],
    'Memory': ['memory_store', 'memory_retrieve', 'memory_list', 'memory_delete'],
    'Text': ['text_summarize', 'diff_files'],
    'Process': ['process_list', 'process_kill'],
    'Archive': ['zip_create', 'zip_extract'],
    'Utility': ['mcp_rules', 'env_get', 'env_set', 'json_parse', 'base64_encode', 'base64_decode']
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Extract category from test name (e.g., "1.1 Emit Test" -> "Tool Probes")
 */
export const extractCategoryFromTest = (testName: string, testType?: 'probe' | 'tools' | 'latency'): string => {
    if (!testName) return 'Running Tests';
    const lower = testName.toLowerCase();

    if (testType === 'tools') {
        for (const [catName, tools] of Object.entries(TOOL_CATEGORIES)) {
            if (tools.some(tool => lower.includes(tool.replace(/_/g, ' ')) || lower === tool)) {
                return `🔧 ${catName}`;
            }
        }
        return '🔧 Tool Tests';
    }

    if (lower.includes('emit') || lower.includes('schema') || lower.includes('selection') || lower.includes('suppression') || lower.includes('1.')) return 'Tool Behavior (1.x)';
    if (lower.includes('reasoning') || lower.includes('intent extraction') || lower.includes('planning') || lower.includes('2.')) return 'Reasoning (2.x)';
    if (lower.includes('rag') || lower.includes('3.')) return '🔍 Strategic RAG';
    if (lower.includes('architecture') || lower.includes('4.')) return '🏗️ Architecture';
    if (lower.includes('navigation') || lower.includes('5.')) return '🧭 Navigation';
    if (lower.includes('helicopter') || lower.includes('6.')) return '🐛 Bug Detection';
    if (lower.includes('proactive') || lower.includes('7.')) return '💡 Proactive';
    if (lower.includes('intent') || lower.includes('8.')) return '🎯 Intent';
    if (lower.includes('tool')) return 'Tool Tests';
    if (lower.includes('latency') || lower.includes('context')) return 'Latency Profile';
    return 'Running Tests';
};
