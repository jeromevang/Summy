export interface DebugEntry {
    timestamp: string;
    type: 'request' | 'response' | 'session' | 'error' | 'warning';
    message: string;
    data?: any;
}

export const debugLog: DebugEntry[] = [];
export const MAX_DEBUG_ENTRIES = 100;

export const addDebugEntry = (type: DebugEntry['type'], message: string, data?: any) => {
    debugLog.unshift({
        timestamp: new Date().toISOString(),
        type,
        message,
        data
    });

    if (debugLog.length > MAX_DEBUG_ENTRIES) {
        debugLog.splice(MAX_DEBUG_ENTRIES);
    }

    console.log(`[${type.toUpperCase()}] ${message}`);
};
