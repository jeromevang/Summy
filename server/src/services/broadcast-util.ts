import { wsBroadcast } from './ws-broadcast.js';
import { getFullStatus } from './lmstudio-status.js';

export const wsClients: Set<any> = new Set();

export const broadcastToClients = (type: string, data: any) => {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    wsClients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(message);
        }
    });
};

export const broadcastStatus = async (getFullStatus: (check: boolean) => Promise<any>) => {
    if (wsClients.size === 0) return;

    const status = await getFullStatus(false);
    const message = JSON.stringify({
        type: 'status',
        data: status,
        timestamp: new Date().toISOString()
    });

    wsClients.forEach(client => {
        if (client.readyState === 1) { // OPEN
            client.send(message);
        }
    });
};
