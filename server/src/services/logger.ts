export interface DebugEntry {
    timestamp: string;
    type: 'request' | 'response' | 'session' | 'error' | 'warning';
    message: string;
    data?: any;
}

export const debugLog: DebugEntry[] = [];
export const MAX_DEBUG_ENTRIES = 100;

/**
 * Adds a new entry to the debug log, maintaining a maximum number of entries.
 * The latest entries are always at the beginning of the log.
 *
 * @param type The type of the debug entry (e.g., 'request', 'response', 'error').
 * @param message A descriptive message for the debug entry.
 * @param data Optional supplementary data related to the entry.
 */
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
