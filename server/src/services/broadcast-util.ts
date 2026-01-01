// Removed unused import: getFullStatus

/**
 * A set of active WebSocket clients currently connected to the server.
 */
export const wsClients: Set<any> = new Set(); // Using 'any' for WebSocket client type for flexibility

/**
 * Broadcasts a message of a specific type and data payload to all connected WebSocket clients.
 * Messages are JSON-stringified and include a timestamp.
 * @param type - The type of the message (e.g., 'status', 'update').
 * @param data - The data payload to send with the message.
 */
export const broadcastToClients = (type: string, data: any) => {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    wsClients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(message);
        }
    });
};

/**
 * Broadcasts the current system status to all connected WebSocket clients.
 * It uses `getFullStatus` to retrieve the status.
 * @param fetchFullStatus - A function that fetches the full system status.
 *                         It expects a boolean argument indicating whether to check LM Studio.
 */
export const broadcastStatus = async (fetchFullStatus: (check: boolean) => Promise<any>) => { // Corrected parameter type
    if (wsClients.size === 0) return;

    // Call the provided fetchFullStatus function with 'false' to avoid actively checking LM Studio every broadcast
    const status = await fetchFullStatus(false); 
    const message = JSON.stringify({
        type: 'status',
        data: status,
        timestamp: new Date().toISOString()
    });

    wsClients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN is 1
            client.send(message);
        }
    });
};
