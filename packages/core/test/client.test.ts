import { describe, expect, it } from "vitest";
import { DEFAULT_USER_AGENT, UscClient } from "../src/client.js";
import { SeatwiseInputError, UscApiError } from "../src/errors.js";
import { checkSeats } from "../src/seats.js";
import { STANDARD_ROUTES, fixtureFetch } from "./helpers.js";

function client(routes: Record<string, string> = STANDARD_ROUTES, now = () => 1_800_000_000_000) {
  const f = fixtureFetch(routes);
  return { c: new UscClient({ fetch: f.fetch, now }), calls: f.calls };
}

describe("UscClient", () => {
  it("lists active terms newest first and picks the default term", async () => {
    const { c } = client();
    const terms = await c.getTerms();
    expect(terms.map((t) => t.code)).toEqual(["20271", "20263", "20262"]);
    expect(terms[0]?.label).toBe("Spring 2027");
    expect(await c.getDefaultTermCode()).toBe("20271");
  });

  it("sends a generic User-Agent and caches responses", async () => {
    const { c, calls } = client();
    await c.getCourse("20271", "CSCI 270");
    await c.getCourse("20271", "csci-270");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers["user-agent"]).toBe(DEFAULT_USER_AGENT);
    expect(calls[0]?.url).toBe("https://classes.usc.edu/api/Courses/Course?termCode=20271&courseCode=CSCI-270");
  });

  it("expires seat data after the short TTL", async () => {
    let t = 1_000_000;
    const { c, calls } = client(STANDARD_ROUTES, () => t);
    await c.getCourse("20271", "CSCI 270");
    t += 61_000;
    await c.getCourse("20271", "CSCI 270");
    expect(calls).toHaveLength(2);
  });

  it("returns null for courses not offered (HTTP 204) and retries without a sequence letter", async () => {
    const { c, calls } = client();
    expect(await c.getCourse("20271", "CSCI 999")).toBeNull();
    // "270A" is not offered, so the client retries as "270" (trailing letters are ambiguous).
    expect((await c.getCourse("20271", "CSCI 270A"))?.code.key).toBe("CSCI 270");
    expect(calls.map((x) => new URL(x.url).searchParams.get("courseCode"))).toEqual(["CSCI-999", "CSCI-270A", "CSCI-270"]);
  });

  it("resolves the school for a department prefix", async () => {
    const { c, calls } = client();
    const r = await c.getDepartmentCourses("20271", "csci");
    expect(r.courses.length).toBeGreaterThan(10);
    expect(calls.some((x) => x.url.includes("school=ENGV&program=CSCI"))).toBe(true);
    await expect(c.getDepartmentCourses("20271", "ZZZZ")).rejects.toBeInstanceOf(SeatwiseInputError);
  });

  it("resolves the GE requirement for a category and tags courses", async () => {
    const { c } = client();
    const r = await c.getGeCourses("20271", "arts");
    expect(r.courses.every((x) => x.geCategories.includes("ARTS"))).toBe(true);
    await expect(c.getGeCourses("20271", "NOPE")).rejects.toThrow(/Valid categories/);
  });

  it("searches", async () => {
    const { c } = client();
    const r = await c.searchCourses("20271", "machine learning");
    expect(r.courses.map((x) => x.code.key)).toContain("CSCI 467");
    await expect(c.searchCourses("20271", "a")).rejects.toBeInstanceOf(SeatwiseInputError);
  });

  it("validates term codes", async () => {
    const { c } = client();
    await expect(c.getCourse("2027", "CSCI 270")).rejects.toThrow(/term code/);
  });

  it("wraps HTTP errors and timeouts", async () => {
    const { c } = client({ "/api/Courses/Course?termCode=20271&courseCode=CSCI-270": "status:503" });
    await expect(c.getCourse("20271", "CSCI 270")).rejects.toMatchObject({ kind: "http", status: 503 });

    const slow = new UscClient({
      timeoutMs: 20,
      fetch: ((_u: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        })) as typeof fetch,
    });
    const err = await slow.getTerms().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UscApiError);
    expect((err as UscApiError).kind).toBe("timeout");
  });
});

describe("checkSeats", () => {
  it("reports requested sections and flags unknown IDs", async () => {
    const { c } = client();
    const [r, missing] = await checkSeats(c, "20271", [
      { course: "CSCI 270", sectionIds: ["30009", "12345"] },
      { course: "CSCI 999" },
    ]);
    expect(r?.sections).toHaveLength(1);
    expect(r?.sections[0]).toMatchObject({ sectionId: "30009", type: "Lecture", state: "open" });
    expect(r?.missingSectionIds).toEqual(["12345"]);
    expect(r?.fetchedAt).toMatch(/^\d{4}-/);
    expect(missing).toMatchObject({ courseKey: "CSCI 999", found: false });
  });
});
