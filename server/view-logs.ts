import { db } from './src/services/database.js';

async function showLogs() {
    try {
        const logs = db.getExecutionLogs({ limit: 10 });
        console.log(JSON.stringify(logs, null, 2));
    } catch (e: any) {
        console.error('Error fetching logs:', e.message);
    }
}

showLogs();
