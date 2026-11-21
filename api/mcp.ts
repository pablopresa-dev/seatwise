// Vercel Function: the public MCP endpoint, served at /mcp through the rewrite in vercel.json.
import { handleMcpRequest } from "@seatwise/mcp/web";

export const POST = (request: Request) => handleMcpRequest(request);
export const GET = (request: Request) => handleMcpRequest(request);
export const OPTIONS = (request: Request) => handleMcpRequest(request);
