import { describe, expect, it } from "vitest";
import { parseCourseCode } from "../src/codes.js";
import { checkEligibility, evaluateRequisite, unmetRequisites } from "../src/eligibility.js";
import type { StudentProfile } from "../src/types.js";
import { course, synthetic } from "./helpers.js";

const codes = (...xs: string[]) => xs.map((x) => parseCourseCode(x)!);
const rule = (r: ReturnType<typeof checkEligibility>, name: string) => r.rules.find((x) => x.rule === name);

describe("prerequisite evaluation", () => {
  const req = course("CSCI 270").prerequisites!;

  it("handles AND of OR groups", () => {
    expect(evaluateRequisite(req, codes("CSCI 104", "CSCI 170"))).toBe(true);
    expect(evaluateRequisite(req, codes("CSCI 114", "CSCI 170"))).toBe(true);
    expect(evaluateRequisite(req, codes("CSCI 104"))).toBe(false);
    expect(unmetRequisites(req, codes("CSCI 104"))).toEqual(["CSCI 170"]);
    expect(unmetRequisites(req, [])).toEqual(["CSCI 104 or CSCI 114", "CSCI 170"]);
  });

  it("handles nested ands inside options (CSCI 420)", () => {
    const r = course("CSCI 420").prerequisites!;
    expect(evaluateRequisite(r, codes("CSCI 104", "MATH 225"))).toBe(true);
    expect(evaluateRequisite(r, codes("CSCI 104", "EE 141", "MATH 127"))).toBe(true);
    expect(evaluateRequisite(r, codes("CSCI 104", "EE 141"))).toBe(false);
  });

  it("handles k-of-n groups (CSCI 401 needs both)", () => {
    const r = course("CSCI 401").prerequisites!;
    expect(evaluateRequisite(r, codes("CSCI 270"))).toBe(false);
    expect(evaluateRequisite(r, codes("CSCI 270", "CSCI 310"))).toBe(true);
  });

  it("returns unknown for unparseable entries instead of guessing", () => {
    const r = { kind: "choose" as const, count: 1, items: [{ kind: "unparsed" as const, text: "AP CS" }] };
    expect(evaluateRequisite(r, [])).toBeNull();
  });
});

describe("checkEligibility", () => {
  const base: StudentProfile = { completedCourses: [] };

  it("eligible when prerequisites are met", () => {
    const r = checkEligibility(course("CSCI 270"), { ...base, completedCourses: ["CSCI 104L", "CSCI 170"] });
    expect(r.status).toBe("eligible");
    expect(rule(r, "prerequisites")?.outcome).toBe("pass");
    expect(rule(r, "duplicate_credit")?.outcome).toBe("info");
  });

  it("blocked with missing prerequisites listed", () => {
    const r = checkEligibility(course("CSCI 270"), { ...base, completedCourses: ["CSCI 103"] });
    expect(r.status).toBe("blocked");
    expect(rule(r, "prerequisites")?.missing).toEqual(["CSCI 104 or CSCI 114", "CSCI 170"]);
  });

  it("class-level: open only to juniors/seniors", () => {
    const c = course("CSCI 445");
    const done = ["CSCI 104"];
    expect(checkEligibility(c, { completedCourses: done, classStanding: "sophomore" }).status).toBe("blocked");
    expect(checkEligibility(c, { completedCourses: done, classStanding: "senior" }).status).toBe("eligible");
    const unknown = checkEligibility(c, { completedCourses: done });
    expect(unknown.status).toBe("unknown");
    expect(rule(unknown, "class_level")?.message).toMatch(/not provided/);
  });

  it("class-level: closed to freshmen/sophomores", () => {
    const c = course("CSCI 450");
    expect(checkEligibility(c, { ...base, classStanding: "freshman" }).status).toBe("blocked");
    expect(checkEligibility(c, { ...base, classStanding: "masters" }).status).toBe("eligible");
  });

  it("major closed_to: CS majors cannot take CSCI 113", () => {
    expect(checkEligibility(course("CSCI 113"), { ...base, majors: ["CSCI"] }).status).toBe("blocked");
    expect(checkEligibility(course("CSCI 113"), { ...base, majors: ["Computer Science"] }).status).toBe("blocked");
    expect(checkEligibility(course("CSCI 113"), { ...base, majors: ["History"] }).status).toBe("eligible");
    expect(checkEligibility(course("CSCI 113"), base).status).toBe("unknown");
  });

  it("major open_only_to: matches by code/name, is honest about partial names", () => {
    // BUAD 102 is also D-clearance on every section in Spring 2027, so look at the major rule itself.
    const c = course("BUAD 102");
    const p = { completedCourses: ["BUAD 101"], classStanding: "freshman" as const };
    const major = (majors: string[]) => rule(checkEligibility(c, { ...p, majors }), "major")?.outcome;
    expect(major(["BUAD"])).toBe("pass");
    expect(major(["Business Administration"])).toBe("pass");
    expect(major(["Physics"])).toBe("fail");
    expect(checkEligibility(c, { ...p, majors: ["Physics"] }).status).toBe("blocked");
    expect(checkEligibility(c, { ...p, majors: ["BUAD"] }).status).toBe("needs_d_clearance");
    const partial = checkEligibility(c, { ...p, majors: ["Accounting and"] });
    expect(rule(partial, "major")?.outcome).toBe("unknown");
    expect(rule(partial, "major")?.message).toMatch(/may correspond/);
  });

  it("visiting/exchange: inclusive major restriction becomes unknown, never a false pass", () => {
    const c = synthetic("TEST 111", [{ id: "1", days: ["Mon"], start: "10:00", end: "11:00" }]);
    c.restrictions.push({ kind: "major", mode: "open_only_to", groups: [{ code: "CSCI", description: "Computer Science" }] });
    const p = { completedCourses: [], majors: ["Computer Science"] };
    expect(checkEligibility(c, p).status).toBe("eligible");
    const r = checkEligibility(c, { ...p, isVisitingOrExchange: true });
    expect(r.status).toBe("unknown");
    expect(rule(r, "major")?.message).toMatch(/exchange/);
    expect(rule(r, "visiting")?.outcome).toBe("info");
  });

  it("corequisites can be satisfied by planned courses", () => {
    const c = course("BUAD 311");
    expect(checkEligibility(c, base).status).toBe("blocked");
    expect(checkEligibility(c, { ...base, plannedCourses: ["BUAD 310"] }).status).toBe("eligible");
  });

  it("D-clearance on every section yields needs_d_clearance", () => {
    const c = synthetic("TEST 101", [{ id: "1", days: ["Mon"], start: "10:00", end: "11:00", dClearance: true }]);
    expect(checkEligibility(c, base).status).toBe("needs_d_clearance");
    const mixed = course("CSCI 570");
    const r = checkEligibility(mixed, base);
    expect(r.status).toBe("eligible");
    expect(rule(r, "d_clearance")?.message).toMatch(/1 of 9/);
  });

  it("all sections cancelled blocks", () => {
    const r = checkEligibility(course("THTR 205"), base);
    expect(r.status).toBe("blocked");
    expect(rule(r, "offering")?.message).toMatch(/cancelled/);
  });
});
