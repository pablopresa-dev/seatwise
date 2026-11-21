import { describe, expect, it } from "vitest";
import { codeSatisfies, parseCourseCode, toApiCode } from "../src/codes.js";
import { normalizeCourse } from "../src/normalize.js";
import type { RawCourse } from "../src/raw.js";
import { course, fixtureJson } from "./helpers.js";

describe("course codes", () => {
  it("parses common spellings", () => {
    expect(parseCourseCode("CSCI 270")?.key).toBe("CSCI 270");
    expect(parseCourseCode("csci-102L")?.key).toBe("CSCI 102");
    expect(parseCourseCode("CSCI102")?.key).toBe("CSCI 102");
    expect(parseCourseCode("AHIS 121gp")?.key).toBe("AHIS 121");
    expect(parseCourseCode("math 505b")?.key).toBe("MATH 505B");
    expect(parseCourseCode("Data Structures")).toBeNull();
  });

  it("builds API codes and compares sequences", () => {
    const seq = parseCourseCode("CSCI 491B")!;
    expect(toApiCode(seq)).toBe("CSCI-491B");
    expect(toApiCode(seq, false)).toBe("CSCI-491");
    expect(codeSatisfies(parseCourseCode("CSCI 102L")!, parseCourseCode("CSCI 102")!)).toBe(true);
    expect(codeSatisfies(parseCourseCode("CSCI 491A")!, seq)).toBe(false);
    expect(codeSatisfies(parseCourseCode("EE 450")!, parseCourseCode("CSCI 450")!)).toBe(false);
  });
});

describe("normalizeCourse (real fixtures)", () => {
  it("parses AND-of-OR prerequisites (CSCI 270)", () => {
    const c = course("CSCI 270");
    expect(c.prerequisiteText).toBe("(CSCI 104 or CSCI 114) and CSCI 170");
    expect(c.prerequisites).toMatchObject({ kind: "all" });
  });

  it("parses options with nested `ands` (CSCI 420)", () => {
    expect(course("CSCI 420").prerequisiteText).toBe(
      "CSCI 104 and (MATH 225 or (EE 141 and MATH 126) or (EE 141 and MATH 127) or (EE 141 and MATH 129))",
    );
  });

  it("treats requiredCourses = n as all-of (CSCI 401)", () => {
    const c = course("CSCI 401");
    expect(c.prerequisites).toMatchObject({ kind: "choose", count: 2 });
    expect(c.prerequisiteText).toBe("CSCI 270 and CSCI 310");
  });

  it("parses corequisites (CSCI 559)", () => {
    expect(course("CSCI 559").corequisiteText).toBe("EE 503 and EE 510");
  });

  it("maps Inclusive/Exclusive restrictions", () => {
    expect(course("CSCI 113").restrictions).toEqual([
      expect.objectContaining({ kind: "major", mode: "closed_to" }),
    ]);
    expect(course("CSCI 445").restrictions).toEqual([
      { kind: "class_level", mode: "open_only_to", groups: [{ code: "U3", description: "Junior" }, { code: "U4", description: "Senior" }] },
    ]);
    const buad = course("BUAD 102").restrictions.map((r) => `${r.kind}:${r.mode}`);
    expect(buad).toEqual(["class_level:open_only_to", "major:open_only_to"]);
  });

  it("normalizes sections, seats, meetings and TBA", () => {
    const c = course("CSCI 450");
    const lec = c.sections.find((s) => s.id === "30828")!;
    expect(lec).toMatchObject({ type: "Lecture", linkCode: null, units: [4] });
    expect(lec.meetings[0]).toMatchObject({ days: ["Mon", "Wed"], startTime: "10:00", endTime: "11:50", start: 600, end: 710, tba: false });
    expect(lec.seats).toMatchObject({ total: 82, registered: 26, available: 56, state: "open" });
    const quiz = c.sections.find((s) => s.id === "31189")!;
    expect(quiz.meetings[0]?.tba).toBe(true);
    const den = c.sections.find((s) => s.id === "30568")!;
    expect(den).toMatchObject({ linkCode: "D", requiresDClearance: true, sessionCode: "014" });
  });

  it("keeps display suffixes and cross-listing", () => {
    expect(course("CSCI 102").displayCode).toBe("CSCI 102L");
    expect(course("CSCI 368")).toMatchObject({ isCrossListed: true, scheduledAs: "TAC 368" });
    expect(course("THTR 205").sections[0]).toMatchObject({ isCancelled: true, seats: expect.objectContaining({ state: "cancelled" }) });
    expect(course("AHIS 121").geCategories).toEqual(["ARTS"]);
  });

  it("normalizes the single-course endpoint payload", () => {
    const raw = fixtureJson<RawCourse>("course-csci-270-20271.json");
    const c = normalizeCourse(raw, "20271");
    expect(c.code.key).toBe("CSCI 270");
    expect(c.sections.map((s) => s.type).sort()).toEqual(["Discussion", "Discussion", "Lecture", "Quiz"]);
  });

  it("survives a nearly empty payload", () => {
    const c = normalizeCourse({ fullCourseName: "ABCD 100" }, "20271");
    expect(c).toMatchObject({ title: "ABCD 100", sections: [], prerequisites: null, restrictions: [] });
  });
});
