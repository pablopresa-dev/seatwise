import { describe, expect, it } from "vitest";
import { buildSchedules, linkGroups, meetingsConflict } from "../src/schedule.js";
import { normalizeCourse } from "../src/normalize.js";
import type { RawCourse } from "../src/raw.js";
import { allCourses, course, fixtureJson, synthetic } from "./helpers.js";

const all = () => [...allCourses().values()];
const ids = (s: { courses: { sections: { id: string }[] }[] }) => s.courses.flatMap((c) => c.sections.map((x) => x.id)).sort();

describe("conflict detection", () => {
  const m = (days: ("Mon" | "Tue" | "Wed")[], start: number, end: number) => ({
    days,
    start,
    end,
    startTime: null,
    endTime: null,
    tba: false,
  });

  it("detects overlap on shared days only", () => {
    expect(meetingsConflict([m(["Mon", "Wed"], 600, 650)], [m(["Wed"], 640, 700)])).toBe(true);
    expect(meetingsConflict([m(["Mon"], 600, 650)], [m(["Tue"], 600, 650)])).toBe(false);
  });

  it("treats back-to-back as compatible and ignores TBA", () => {
    expect(meetingsConflict([m(["Mon"], 600, 650)], [m(["Mon"], 650, 700)])).toBe(false);
    const tba = { days: [], start: null, end: null, startTime: null, endTime: null, tba: true };
    expect(meetingsConflict([tba], [m(["Mon"], 600, 650)])).toBe(false);
  });
});

describe("link groups", () => {
  it("one of each type within a link code (CSCI 102: lecture + lab + quiz)", () => {
    const groups = linkGroups(course("CSCI 102"));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.types).toEqual(["Lab", "Lecture", "Quiz"]);
  });

  it("never mixes sections from different link codes (CSCI 570 B/C/D)", () => {
    const r = buildSchedules(all(), { mustHave: ["CSCI 570"], maxResults: 10, constraints: { dClearance: "allow" } });
    expect(r.schedules.length).toBe(3);
    for (const s of r.schedules) {
      const links = new Set(s.courses[0]!.sections.map((x) => x.linkCode));
      expect(links.size).toBe(1);
      expect(s.courses[0]!.sections.map((x) => x.type).sort()).toEqual(["Discussion", "Lecture", "Quiz"]);
    }
  });

  it("null-link group with its own lecture stays separate (CSCI 450)", () => {
    const groups = linkGroups(course("CSCI 450"));
    expect(groups.map((g) => g.key)).toEqual(["(none)", "D"]);
  });

  it("orphan null-link discussion is offered inside the lettered group and flagged (CLAS 101)", () => {
    const groups = linkGroups(course("CLAS 101"));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.inferredIds.has("36909")).toBe(true);
    const r = buildSchedules(all(), { mustHave: ["CLAS 101"], maxResults: 10, diverse: false, constraints: { dClearance: "allow" } });
    const inferred = r.schedules.find((s) => ids(s).includes("36909"));
    expect(inferred?.courses[0]?.linkInferred).toBe(true);
    expect(inferred?.warnings.join(" ")).toMatch(/inference/);
  });
  it("unlinked lecture + linked discussions are paired, never scheduled alone (COLT 102)", () => {
    const colt = normalizeCourse(fixtureJson<RawCourse>("course-colt-102-20271.json"), "20271");
    const groups = linkGroups(colt);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.types).toEqual(["Discussion", "Lecture"]);
    const r = buildSchedules([colt], { mustHave: ["COLT 102"], maxResults: 10, diverse: false });
    expect(r.schedules).toHaveLength(4);
    for (const s of r.schedules) {
      expect(s.courses[0]!.sections.map((x) => x.type).sort()).toEqual(["Discussion", "Lecture"]);
      expect(s.courses[0]!.linkInferred).toBe(true);
    }
  });
});

describe("buildSchedules", () => {
  it("builds CSCI 270 + a GE with no conflicts, deterministic", () => {
    const req = { mustHave: ["CSCI 270"], pickOneFrom: [["AHIS 121", "HIST 107", "CLAS 101"]] };
    const a = buildSchedules(all(), req);
    const b = buildSchedules(all(), req);
    expect(a.schedules.length).toBeGreaterThan(0);
    expect(a.schedules.map(ids)).toEqual(b.schedules.map(ids));
    expect(a.exhaustive).toBe(true);
    for (const s of a.schedules) {
      expect(s.courses.map((c) => c.courseKey)).toContain("CSCI 270");
      expect(s.courses).toHaveLength(2);
      expect(s.totalUnits).toBe(8);
    }
    // Ranked: scores ascending.
    const scores = a.schedules.map((s) => s.score);
    expect([...scores].sort((x, y) => x - y)).toEqual(scores);
  });

  it("skips cancelled sections and explains why a course cannot be scheduled", () => {
    const r = buildSchedules(all(), { mustHave: ["THTR 205"] });
    expect(r.schedules).toEqual([]);
    expect(r.diagnostics[0]).toMatchObject({ courseKey: "THTR 205", filteredSections: { cancelled: 1 } });
    expect(r.notes[0]).toMatch(/THTR 205/);
  });

  it("reports unknown courses", () => {
    const r = buildSchedules(all(), { mustHave: ["CSCI 999"] });
    expect(r.diagnostics[0]).toMatchObject({ found: false });
  });

  it("respects earliest start / latest end", () => {
    const r = buildSchedules(all(), { mustHave: ["CSCI 102"], maxResults: 25, diverse: false, constraints: { latestEnd: "16:00" } });
    // Lab 30247 (17:00) and the 19:00 quiz end after 16:00, so nothing fits.
    expect(r.schedules).toEqual([]);
    expect(r.diagnostics[0]?.filteredSections.ends_too_late).toBeGreaterThan(0);

    const early = buildSchedules(all(), { mustHave: ["CSCI 102"], maxResults: 25, diverse: false, constraints: { earliestStart: "12:00" } });
    for (const s of early.schedules) expect(ids(s)).not.toContain("30250"); // W 11:00 lab
    expect(early.schedules.length).toBeGreaterThan(0);
  });

  it("respects days off", () => {
    const r = buildSchedules(all(), { mustHave: ["CSCI 270"], constraints: { daysOff: ["Fri"] } });
    expect(r.schedules).toEqual([]); // discussions and quiz are on Friday
    expect(r.diagnostics[0]?.filteredSections.meets_on_day_off).toBeGreaterThan(0);
  });

  it("openSeatsOnly drops full sections", () => {
    const full = synthetic("TEST 201", [
      { id: "a", days: ["Mon"], start: "10:00", end: "11:00", seats: [50, 50] },
      { id: "b", days: ["Tue"], start: "10:00", end: "11:00", seats: [10, 50] },
    ]);
    const r = buildSchedules([full], { mustHave: ["TEST 201"], constraints: { openSeatsOnly: true } });
    expect(r.schedules.map(ids)).toEqual([["b"]]);
    const loose = buildSchedules([full], { mustHave: ["TEST 201"] });
    expect(loose.schedules[0] && ids(loose.schedules[0])).toEqual(["b"]); // full one ranks lower
    expect(loose.schedules).toHaveLength(2);
  });

  it("enforces max units and prefers more nice-to-haves", () => {
    const x = synthetic("TEST 301", [{ id: "x", days: ["Mon"], start: "10:00", end: "11:00" }]);
    const y = synthetic("TEST 302", [{ id: "y", days: ["Tue"], start: "10:00", end: "11:00" }]);
    const z = synthetic("TEST 303", [{ id: "z", days: ["Wed"], start: "10:00", end: "11:00" }]);
    const r = buildSchedules([x, y, z], { mustHave: ["TEST 301"], niceToHave: ["TEST 302", "TEST 303"] });
    expect(r.schedules[0]?.niceToHaveIncluded).toBe(2);
    const capped = buildSchedules([x, y, z], { mustHave: ["TEST 301"], niceToHave: ["TEST 302", "TEST 303"], constraints: { maxUnits: 8 } });
    expect(capped.schedules.every((s) => s.totalUnits <= 8)).toBe(true);
    expect(capped.schedules[0]?.niceToHaveIncluded).toBe(1);
  });

  it("reports must-have pairs that always conflict", () => {
    const x = synthetic("TEST 401", [{ id: "x", days: ["Mon"], start: "10:00", end: "11:00" }]);
    const y = synthetic("TEST 402", [{ id: "y", days: ["Mon"], start: "10:30", end: "11:30" }]);
    const r = buildSchedules([x, y], { mustHave: ["TEST 401", "TEST 402"] });
    expect(r.schedules).toEqual([]);
    expect(r.incompatiblePairs).toEqual([["TEST 401", "TEST 402"]]);
  });

  it("D-clearance policy: avoid ranks them last, exclude removes them", () => {
    const c = synthetic("TEST 501", [
      { id: "d", link: "D", days: ["Tue"], start: "12:00", end: "13:00", dClearance: true },
      { id: "n", link: "A", days: ["Mon"], start: "08:00", end: "09:00" },
    ]);
    const avoid = buildSchedules([c], { mustHave: ["TEST 501"] });
    expect(avoid.schedules.map(ids)).toEqual([["n"], ["d"]]);
    const excl = buildSchedules([c], { mustHave: ["TEST 501"], constraints: { dClearance: "exclude" } });
    expect(excl.schedules.map(ids)).toEqual([["n"]]);
  });

  it("pinned sections are always used", () => {
    const r = buildSchedules(all(), { mustHave: ["CSCI 102"], constraints: { pinnedSectionIds: ["30201"] }, maxResults: 25, diverse: false });
    expect(r.schedules.length).toBeGreaterThan(0);
    for (const s of r.schedules) expect(ids(s)).toContain("30201");
  });

  it("fewer early classes rank higher", () => {
    const c = synthetic("TEST 601", [
      { id: "early", link: "A", days: ["Mon", "Wed"], start: "08:00", end: "09:20" },
      { id: "late", link: "B", days: ["Mon", "Wed"], start: "11:00", end: "12:20" },
    ]);
    const r = buildSchedules([c], { mustHave: ["TEST 601"] });
    expect(r.schedules.map(ids)).toEqual([["late"], ["early"]]);
    expect(r.schedules[1]?.metrics.earlyMeetings).toBe(2);
  });

  it("stops at the search budget and says so", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      synthetic(
        `TEST 7${i}0`,
        Array.from({ length: 8 }, (_, j) => ({ id: `${i}-${j}`, link: String.fromCharCode(65 + j), days: ["Mon" as const], start: `${String(8 + j).padStart(2, "0")}:00`, end: `${String(8 + j).padStart(2, "0")}:30` })),
      ),
    );
    const r = buildSchedules(many, { mustHave: many.map((c) => c.code.key), searchBudget: 1000 });
    expect(r.exhaustive).toBe(false);
    expect(r.notes.join(" ")).toMatch(/budget/);
  });
});
