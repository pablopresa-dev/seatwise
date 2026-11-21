import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { SERVER_NAME, SERVER_VERSION, createSeatwiseServer, type SeatwiseServerOptions } from "./server.js";

/**
 * Web-standard (Request -> Response) entry point, for serverless hosts such as Vercel Functions.
 * Same behaviour as the node:http server in http.ts: stateless Streamable HTTP with JSON responses.
 */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  });
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** Handle one MCP request. Only POST carries MCP traffic; GET is rejected because the server is stateless. */
export async function handleMcpRequest(request: Request, opts: SeatwiseServerOptions = {}): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") {
    return json(
      405,
      { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST /mcp." }, id: null },
      { Allow: "POST, OPTIONS" },
    );
  }

  // Stateless: a fresh server and transport per request (no session IDs, no shared request-ID space).
  const server = createSeatwiseServer(opts);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return withCors(await transport.handleRequest(request));
  } catch (err) {
    console.error("MCP request failed:", err);
    return json(500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  } finally {
    void transport.close();
    void server.close();
  }
}

export function healthResponse(): Response {
  return json(200, { ok: true, name: SERVER_NAME, version: SERVER_VERSION });
}
