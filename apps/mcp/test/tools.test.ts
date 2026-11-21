import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UscClient } from "@seatwise/core";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STANDARD_ROUTES, fixtureFetch } from "../../../packages/core/test/helpers.js";
import { createHttpServer } from "../src/http.js";
import { createSeatwiseServer } from "../src/server.js";
import { handleMcpRequest, healthResponse } from "../src/web.js";

function fixtureSource() {
  const f = fixtureFetch(STANDARD_ROUTES);
  return { source: new UscClient({ fetch: f.fetch }), calls: f.calls };
}

async function connect() {
  const { source, calls } = fixtureSource();
  const server = createSeatwiseServer({ source });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult & { structuredContent?: any };
  return { client, call, calls };
}

const text = (r: CallToolResult) => r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");

describe("MCP tools (fixtures, no network)", () => {
  let t: Awaited<ReturnType<typeof connect>>;
  beforeAll(async () => {
    t = await connect();
  });

  it("advertises tools with read-only annotations and server instructions", async () => {
    const { tools } = await t.client.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual([
      "build_schedule",
      "check_eligibility",
      "check_seats",
      "get_course_details",
      "list_departments",
      "list_ge_categories",
      "list_terms",
      "search_courses",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.description!.length).toBeGreaterThan(80);
    }
    expect(t.client.getInstructions()).toMatch(/STARS/);
  });

  it("list_terms returns the default term", async () => {
    const r = await t.call("list_terms");
    expect(r.structuredContent.defaultTermCode).toBe("20271");
    expect(text(r)).toMatch(/Spring 2027: 20271 \(default\)/);
  });

  it("list_departments filters", async () => {
    const r = await t.call("list_departments", { query: "computer science" });
    expect(text(r)).toMatch(/CSCI Computer Science/);
  });

  it("search_courses by department + level, paginated", async () => {
    const r = await t.call("search_courses", { department: "CSCI", level: "undergraduate", limit: 3 });
    const s = r.structuredContent;
    expect(s.count).toBe(3);
    expect(s.hasMore).toBe(true);
    expect(s.courses.every((c: { code: string }) => Number(c.code.split(" ")[1]) < 500)).toBe(true);
  });

  it("search_courses by GE category tags results", async () => {
    const r = await t.call("search_courses", { geCategory: "GPH" });
    expect(r.structuredContent.courses.map((c: { code: string }) => c.code)).toContain("HIST 107");
    expect(r.structuredContent.courses[0].geCategories).toEqual(["GPH"]);
  });

  it("search_courses requires some criterion", async () => {
    const r = await t.call("search_courses", {});
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/at least one/);
  });

  it("get_course_details groups sections by link code", async () => {
    const r = await t.call("get_course_details", { courseCode: "CSCI 270" });
    expect(r.structuredContent.course.linkGroups[0].requiredTypes.sort()).toEqual(["Discussion", "Lecture", "Quiz"]);
    expect(text(r)).toMatch(/Prerequisites:\*\* \(CSCI 104 or CSCI 114\) and CSCI 170/);
    const missing = await t.call("get_course_details", { courseCode: "CSCI 999" });
    expect(missing.structuredContent.found).toBe(false);
  });

  it("check_eligibility for an exchange CS student", async () => {
    const r = await t.call("check_eligibility", {
      courseCodes: ["CSCI 270", "CSCI 999"],
      profile: { majors: ["Computer Science"], classStanding: "junior", completedCourses: ["CSCI 104", "CSCI 170"], isVisitingOrExchange: true },
    });
    expect(r.structuredContent.results[0].status).toBe("eligible");
    expect(r.structuredContent.notOffered).toEqual(["CSCI 999"]);
    expect(text(r)).toMatch(/home institution/);
  });

  it("rejects invalid input with an actionable message", async () => {
    const r = await t.call("check_eligibility", { courseCodes: ["data structures"], profile: { completedCourses: [] } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not a valid USC course code/);
  });

  it("build_schedule: CSCI 270 + one GE candidate, using listing data already cached", async () => {
    await t.call("search_courses", { geCategory: "GPH" }); // primes AHIS 121 / HIST 107 / CLAS 101
    const before = t.calls.length;
    const r = await t.call("build_schedule", {
      mustHave: ["CSCI 270"],
      pickOneFrom: [["HIST 107", "CLAS 101"]],
      constraints: { earliestStart: "09:30" },
      profile: { completedCourses: ["CSCI 104", "CSCI 170"] },
    });
    expect(t.calls.length - before).toBe(0);
    const s = r.structuredContent;
    expect(s.schedules.length).toBeGreaterThan(0);
    expect(s.schedules[0].courses.map((c: { courseKey: string }) => c.courseKey)).toContain("CSCI 270");
    expect(s.eligibility.find((e: { courseKey: string }) => e.courseKey === "CSCI 270").status).toBe("eligible");
    expect(text(r)).toMatch(/Option 1/);
  });

  it("check_seats", async () => {
    const r = await t.call("check_seats", { sections: [{ course: "CSCI 270", sectionIds: ["30009"] }] });
    expect(r.structuredContent.reports[0].sections[0]).toMatchObject({ sectionId: "30009", state: "open" });
    expect(text(r)).toMatch(/30009 Lecture/);
  });
});

describe("HTTP transport", () => {
  let base: string;
  let server: ReturnType<typeof createHttpServer>;
  beforeAll(async () => {
    server = createHttpServer({ source: fixtureSource().source });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("serves /healthz", async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("rejects GET /mcp in stateless mode", async () => {
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });

  it("handles a full client session over POST /mcp", async () => {
    const client = new Client({ name: "http-test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const r = (await client.callTool({ name: "list_terms", arguments: {} })) as CallToolResult & { structuredContent?: any };
    expect(r.structuredContent.defaultTermCode).toBe("20271");
    await client.close();
  });
});

describe("Web-standard handler (Vercel)", () => {
  const handler = (input: RequestInfo | URL, init?: RequestInit) =>
    handleMcpRequest(new Request(input, init), { source: fixtureSource().source });

  it("serves /healthz", async () => {
    const body = await healthResponse().json();
    expect(body).toMatchObject({ ok: true, name: "seatwise-mcp-server" });
  });

  it("answers CORS preflight and rejects GET", async () => {
    const pre = await handler("https://example.test/mcp", { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await handler("https://example.test/mcp")).status).toBe(405);
  });

  it("handles a full client session", async () => {
    const client = new Client({ name: "web-test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL("https://example.test/mcp"), { fetch: handler }));
    const tools = await client.listTools();
    expect(tools.tools.length).toBe(8);
    const r = (await client.callTool({ name: "list_terms", arguments: {} })) as CallToolResult & { structuredContent?: any };
    expect(r.structuredContent.defaultTermCode).toBe("20271");
    await client.close();
  });
});
