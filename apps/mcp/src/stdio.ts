#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSeatwiseServer } from "./server.js";

async function main(): Promise<void> {
  const server = createSeatwiseServer();
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol; log to stderr only.
  console.error("Seatwise MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("Seatwise MCP server failed:", err);
  process.exit(1);
});
