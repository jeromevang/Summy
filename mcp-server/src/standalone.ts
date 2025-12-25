import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { server } from "./server.js";

const app = express();
const port = process.env.PORT || 3005;

let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
    console.error("[MCP] New SSE connection");
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
});

app.post("/messages", async (req, res) => {
    console.error("[MCP] Message received");
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        res.status(400).send("No active SSE session");
    }
});

app.listen(port, () => {
    console.error(`[MCP] Standalone SSE server listening on http://localhost:${port}`);
    console.error(`[MCP] SSE endpoint: http://localhost:${port}/sse`);
    console.error(`[MCP] Message endpoint: http://localhost:${port}/messages`);
});
