import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SERVER_NAME, SERVER_VERSION, createSeatwiseServer, type SeatwiseServerOptions } from "./server.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

async function handleMcp(req: IncomingMessage, res: ServerResponse, opts: SeatwiseServerOptions): Promise<void> {
  // Stateless: a fresh server + transport per request (no session IDs, no shared request-ID space).
  const server = createSeatwiseServer(opts);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

/** Create (but do not start) the HTTP server: POST /mcp (Streamable HTTP, stateless) and GET /healthz. */
export function createHttpServer(opts: SeatwiseServerOptions = {}): Server {
  return createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (path === "/healthz" && (req.method === "GET" || req.method === "HEAD")) {
      sendJson(res, 200, { ok: true, name: SERVER_NAME, version: SERVER_VERSION });
      return;
    }
    if (path === "/mcp") {
      if (req.method !== "POST") {
        // Stateless JSON mode: no server-initiated SSE stream and no sessions to delete.
        res.setHeader("Allow", "POST, OPTIONS");
        sendJson(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST /mcp." }, id: null });
        return;
      }
      handleMcp(req, res, opts).catch((err: unknown) => {
        console.error("MCP request failed:", err);
        if (!res.headersSent) {
          sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
        } else {
          res.end();
        }
      });
      return;
    }
    sendJson(res, 404, { error: "Not found. MCP endpoint is POST /mcp; health check is GET /healthz." });
  });
}

function isMain(): boolean {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "0.0.0.0";
  const server = createHttpServer();
  server.listen(port, host, () => {
    console.error(`Seatwise MCP server listening on http://${host}:${port}/mcp (health: /healthz)`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
