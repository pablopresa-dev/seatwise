// Vercel Function: health check, served at /healthz through the rewrite in vercel.json.
import { healthResponse } from "@seatwise/mcp/web";

export const GET = () => healthResponse();
