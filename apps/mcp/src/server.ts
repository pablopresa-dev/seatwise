import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UscClient, type CourseDataSource } from "@seatwise/core";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { TOOLS, TOOL_ANNOTATIONS, toolError, type ToolContext } from "./tools.js";

export const SERVER_NAME = "seatwise-mcp-server";
export const SERVER_VERSION = "0.1.0";

export interface SeatwiseServerOptions {
  /** Data source; defaults to a live UscClient. Share one instance across sessions to share its cache. */
  source?: CourseDataSource;
}

let sharedClient: UscClient | null = null;

/** Process-wide live client, so every HTTP request/session shares one cache. */
export function defaultSource(): UscClient {
  sharedClient ??= new UscClient();
  return sharedClient;
}

export function createSeatwiseServer(opts: SeatwiseServerOptions = {}): McpServer {
  const ctx: ToolContext = { source: opts.source ?? defaultSource() };
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS, capabilities: { tools: {} } },
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { title: tool.title, ...TOOL_ANNOTATIONS },
      },
      async (args: unknown): Promise<CallToolResult> => {
        try {
          return await tool.handler(args as never, ctx);
        } catch (err) {
          return toolError(err);
        }
      },
    );
  }
  return server;
}
