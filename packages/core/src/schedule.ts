import { parseCourseCode } from "./codes.js";
import { formatTime, parseTime } from "./normalize.js";
import type { Course, Day, Meeting, SeatStatus, Section } from "./types.js";

export type DClearancePolicy = "allow" | "avoid" | "exclude";

export interface ScheduleConstraints {
  /** No meeting may start before this time ("HH:MM", 24h). */
  earliestStart?: string;
  /** No meeting may end after this time ("HH:MM", 24h). */
  latestEnd?: string;
  /** Days that must stay free. */
  daysOff?: Day[];
  maxUnits?: number;
  minUnits?: number;
  /** Only use sections that currently have open seats. */
  openSeatsOnly?: boolean;
  /** D-clearance sections: "allow", "avoid" (default; allowed but ranked last), or "exclude". */
  dClearance?: DClearancePolicy;
  /** Never use these section IDs. */
  excludeSectionIds?: string[];
  /** Section IDs that must be used when their course is scheduled (e.g. a preferred professor). */
  pinnedSectionIds?: string[];
}

export interface ScheduleRequest {
  /** Courses that must all be in every schedule. */
  mustHave: string[];
  /** Courses to include when they fit; schedules with more of them rank higher. */
  niceToHave?: string[];
  /** Each inner list: exactly one of these courses is included (e.g. GE candidates). */
  pickOneFrom?: string[][];
  constraints?: ScheduleConstraints;
  /** Number of schedules to return (default 5, max 25). */
  maxResults?: number;
  /** Search budget in visited nodes (default 200k). */
  searchBudget?: number;
  /** When true (default), results differ in their lecture choices, not only in labs/discussions. */
  diverse?: boolean;
}

export interface ScheduledSection {
  id: string;
  type: string;
  linkCode: string | null;
  meetings: Meeting[];
  instructors: string[];
  seats: SeatStatus;
  requiresDClearance: boolean;
  notes: string | null;
}

export type CourseRole = "must_have" | "nice_to_have" | "pick_one";

export interface ScheduledCourse {
  courseKey: string;
  displayCode: string;
  title: string;
  role: CourseRole;
  units: number;
  variableUnits: boolean;
  sections: ScheduledSection[];
  /** True when a section had no published linkCode and its pairing was inferred. */
  linkInferred: boolean;
}

/** Comfort metrics. Exam-style "Quiz" sections are excluded here (they still count for conflicts). */
export interface ScheduleMetrics {
  earliestStart: string | null;
  latestEnd: string | null;
  daysOnCampus: Day[];
  /** Idle minutes between classes, summed over the week. */
  gapMinutes: number;
  /** Meetings starting before 10:00 (counted per day). */
  earlyMeetings: number;
  fullSections: number;
  dClearanceSections: number;
  tbaSections: number;
}

export interface Schedule {
  rank: number;
  courses: ScheduledCourse[];
  totalUnits: number;
  niceToHaveIncluded: number;
  /** Lower is better. */
  score: number;
  metrics: ScheduleMetrics;
  warnings: string[];
}

export interface CourseDiagnostic {
  courseKey: string;
  role: CourseRole;
  found: boolean;
  /** Valid section packages (one section of each required type within a link group). */
  packagesBeforeConstraints: number;
  packagesAfterConstraints: number;
  /** Why sections were filtered, e.g. { cancelled: 1, outside_time_window: 3 }. */
  filteredSections: Record<string, number>;
  message: string | null;
}

export interface ScheduleResult {
  schedules: Schedule[];
  diagnostics: CourseDiagnostic[];
  /** Pairs of must-have courses that can never be scheduled together under the constraints. */
  incompatiblePairs: [string, string][];
  nodesVisited: number;
  /** False when the search budget ran out before every combination was tried. */
  exhaustive: boolean;
  notes: string[];
}

// ---------------------------------------------------------------------------

interface Package {
  course: Course;
  role: CourseRole;
  sections: Section[];
  slots: TimeSlot[];
  units: number;
  linkInferred: boolean;
  /** Cost of this package alone (used to order the search). */
  cost: number;
}

interface TimeSlot {
  day: Day;
  start: number;
  end: number;
  /** False for exam-style "Quiz" sections: they count for conflicts but not for comfort scoring. */
  scored: boolean;
}

const LINK_NONE = "\u0000none";

export function meetingsConflict(a: readonly Meeting[], b: readonly Meeting[]): boolean {
  return slotsConflict(toSlots(a), toSlots(b));
}

function toSlots(meetings: readonly Meeting[], scored = true): TimeSlot[] {
  const out: TimeSlot[] = [];
  for (const m of meetings) {
    if (m.tba || m.start === null || m.end === null) continue;
    for (const d of m.days) out.push({ day: d, start: m.start, end: m.end, scored });
  }
  return out;
}

const isQuizType = (type: string) => /quiz/i.test(type);

function slotsConflict(a: readonly TimeSlot[], b: readonly TimeSlot[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x.day === y.day && x.start < y.end && y.start < x.end) return true;
    }
  }
  return false;
}

const isLectureType = (type: string) => /lec/i.test(type);

export interface LinkGroup {
  key: string;
  sections: Section[];
  /** One section of each of these types makes a registration package. */
  types: string[];
  /** Sections whose pairing with this group was inferred (no published linkCode). */
  inferredIds: Set<string>;
}

/**
 * Group sections into registration packages. Inferred from real data (see docs/usc-api.md):
 * within a linkCode group you register for one section of each type present. Sections with no
 * linkCode are handled by shape:
 * - they contain a lecture-type section and every lettered group has its own lecture: they form
 *   their own group (CSCI 450, BUAD 307);
 * - they contain a lecture and some lettered group has none (e.g. lecture unlinked, discussions
 *   linked "T", as in COLT 102): the unlinked sections are merged into each lecture-less group;
 * - they contain no lecture (an orphan discussion, as in CLAS 101): they are offered as extra
 *   alternatives inside every lettered group that has the same type.
 * Merged sections are flagged as inferred so callers can warn.
 */
export function linkGroups(course: Course): LinkGroup[] {
  const byLink = new Map<string, Section[]>();
  for (const s of course.sections) {
    const k = s.linkCode ?? LINK_NONE;
    let arr = byLink.get(k);
    if (!arr) byLink.set(k, (arr = []));
    arr.push(s);
  }
  const typesOf = (secs: Section[]) => [...new Set(secs.map((s) => s.type))].sort();
  const hasLecture = (secs: Section[]) => secs.some((s) => isLectureType(s.type));
  const none = byLink.get(LINK_NONE) ?? [];
  const lettered = [...byLink.entries()].filter(([k]) => k !== LINK_NONE).sort(([a], [b]) => a.localeCompare(b));
  const lectureless = lettered.filter(([, secs]) => !hasLecture(secs));
  const groups: LinkGroup[] = [];

  const noneWithLecture = none.length > 0 && hasLecture(none);
  const mergeNoneIntoLectureless = noneWithLecture && lectureless.length > 0;
  const orphans = none.length > 0 && !noneWithLecture && lettered.length > 0 ? none : [];
  if (none.length && !mergeNoneIntoLectureless && !orphans.length) {
    groups.push({ key: "(none)", sections: none, types: typesOf(none), inferredIds: new Set() });
  }
  for (const [k, secs] of lettered) {
    if (mergeNoneIntoLectureless && !hasLecture(secs)) {
      const all = [...none, ...secs];
      groups.push({ key: `${k}+(none)`, sections: all, types: typesOf(all), inferredIds: new Set(none.map((s) => s.id)) });
      continue;
    }
    const types = typesOf(secs);
    const extras = orphans.filter((o) => types.includes(o.type));
    groups.push({ key: k, sections: [...secs, ...extras], types, inferredIds: new Set(extras.map((e) => e.id)) });
  }
  return groups;
}

interface BuildContext {
  earliest: number | null;
  latest: number | null;
  daysOff: Set<Day>;
  openOnly: boolean;
  dPolicy: DClearancePolicy;
  excluded: Set<string>;
  pinned: Set<string>;
}

function sectionFilterReason(s: Section, ctx: BuildContext): string | null {
  if (s.isCancelled) return "cancelled";
  if (ctx.excluded.has(s.id)) return "excluded_by_request";
  if (ctx.dPolicy === "exclude" && s.requiresDClearance) return "requires_d_clearance";
  if (ctx.openOnly && s.seats.state !== "open") return "no_open_seats";
  for (const m of s.meetings) {
    if (m.tba) continue;
    if (m.days.some((d) => ctx.daysOff.has(d))) return "meets_on_day_off";
    if (ctx.earliest !== null && m.start! < ctx.earliest) return "starts_too_early";
    if (ctx.latest !== null && m.end! > ctx.latest) return "ends_too_late";
  }
  return null;
}

function cartesian<T>(lists: T[][], cap: number): T[][] {
  let acc: T[][] = [[]];
  for (const list of lists) {
    const next: T[][] = [];
    for (const prefix of acc) {
      for (const item of list) {
        next.push([...prefix, item]);
        if (next.length >= cap) break;
      }
      if (next.length >= cap) break;
    }
    acc = next;
  }
  return acc;
}

const PACKAGE_CAP = 2000;

function packageUnits(course: Course, sections: Section[]): number {
  const sum = sections.reduce((t, s) => t + (s.units.length ? Math.min(...s.units) : 0), 0);
  if (sum > 0) return sum;
  return course.units.length ? Math.min(...course.units) : 0;
}

function buildPackages(course: Course, role: CourseRole, ctx: BuildContext, diag: CourseDiagnostic): Package[] {
  const out: Package[] = [];
  let before = 0;
  const pinnedHere = course.sections.filter((s) => ctx.pinned.has(s.id)).map((s) => s.id);
  for (const g of linkGroups(course)) {
    const perTypeAll = g.types.map((t) => g.sections.filter((s) => s.type === t));
    before += perTypeAll.reduce((n, l) => n * l.length, 1);
    const perType = perTypeAll.map((list) =>
      list.filter((s) => {
        const reason = sectionFilterReason(s, ctx);
        if (reason) diag.filteredSections[reason] = (diag.filteredSections[reason] ?? 0) + 1;
        return !reason;
      }),
    );
    if (perType.some((l) => l.length === 0)) continue;
    for (const combo of cartesian(perType, PACKAGE_CAP)) {
      // Every pinned section of this course must be part of the package.
      if (pinnedHere.length && !pinnedHere.every((id) => combo.some((s) => s.id === id))) continue;
      const slotsBySection = combo.map((s) => toSlots(s.meetings, !isQuizType(s.type)));
      let internal = false;
      for (let i = 0; i < slotsBySection.length && !internal; i++) {
        for (let j = i + 1; j < slotsBySection.length; j++) {
          if (slotsConflict(slotsBySection[i]!, slotsBySection[j]!)) {
            internal = true;
            break;
          }
        }
      }
      if (internal) continue;
      const slots = slotsBySection.flat();
      const pkg: Package = {
        course,
        role,
        sections: combo,
        slots,
        units: packageUnits(course, combo),
        linkInferred: combo.some((s) => g.inferredIds.has(s.id)),
        cost: 0,
      };
      pkg.cost = packageCost(pkg, ctx);
      out.push(pkg);
    }
  }
  diag.packagesBeforeConstraints = before;
  diag.packagesAfterConstraints = out.length;
  out.sort((a, b) => a.cost - b.cost || sig(a).localeCompare(sig(b)));
  return out;
}

const sig = (p: Package) => p.sections.map((s) => s.id).join("+");

// --- scoring ---------------------------------------------------------------

const EARLY_CUTOFF = 10 * 60;
const LATE_CUTOFF = 18 * 60;
const W = {
  earlyPerMinute: 0.5,
  latePerMinute: 0.3,
  gapPerMinute: 0.1,
  perCampusDay: 30,
  fullSection: 200,
  lowSeats: 20,
  dClearance: 150,
  linkInferred: 50,
};

function seatCost(s: Section): number {
  if (s.seats.state !== "open") return W.fullSection;
  if (s.seats.total > 0 && s.seats.available < 5) return W.lowSeats;
  return 0;
}

function packageCost(p: Package, ctx: BuildContext): number {
  let c = 0;
  for (const s of p.sections) {
    c += seatCost(s);
    if (s.requiresDClearance && ctx.dPolicy === "avoid") c += W.dClearance;
  }
  for (const sl of p.slots) {
    if (!sl.scored) continue;
    c += Math.max(0, EARLY_CUTOFF - sl.start) * W.earlyPerMinute;
    c += Math.max(0, sl.end - LATE_CUTOFF) * W.latePerMinute;
  }
  if (p.linkInferred) c += W.linkInferred;
  return c;
}

function scheduleMetrics(pkgs: Package[]): { metrics: ScheduleMetrics; cost: number } {
  const byDay = new Map<Day, TimeSlot[]>();
  for (const p of pkgs) {
    for (const s of p.slots) {
      if (!s.scored) continue;
      let arr = byDay.get(s.day);
      if (!arr) byDay.set(s.day, (arr = []));
      arr.push(s);
    }
  }
  let gap = 0;
  let early = 0;
  let minStart: number | null = null;
  let maxEnd: number | null = null;
  for (const slots of byDay.values()) {
    slots.sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = slots[0]!.end;
    for (const s of slots) {
      if (s.start > cursor) gap += s.start - cursor;
      cursor = Math.max(cursor, s.end);
      if (s.start < EARLY_CUTOFF) early++;
      minStart = minStart === null ? s.start : Math.min(minStart, s.start);
      maxEnd = maxEnd === null ? s.end : Math.max(maxEnd, s.end);
    }
  }
  const allSections = pkgs.flatMap((p) => p.sections);
  const order: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const metrics: ScheduleMetrics = {
    earliestStart: minStart === null ? null : formatTime(minStart),
    latestEnd: maxEnd === null ? null : formatTime(maxEnd),
    daysOnCampus: order.filter((d) => byDay.has(d)),
    gapMinutes: gap,
    earlyMeetings: early,
    fullSections: allSections.filter((s) => s.seats.state !== "open").length,
    dClearanceSections: allSections.filter((s) => s.requiresDClearance).length,
    tbaSections: allSections.filter((s) => s.meetings.length === 0 || s.meetings.every((m) => m.tba)).length,
  };
  const cost = gap * W.gapPerMinute + byDay.size * W.perCampusDay;
  return { metrics, cost };
}

// --- search ----------------------------------------------------------------

interface Slot {
  label: string;
  optional: boolean;
  packages: Package[];
}

/**
 * Build ranked, conflict-free schedules. Deterministic: same input, same output.
 * `courses` must contain every requested course that exists in the term (others are reported).
 */
export function buildSchedules(courses: readonly Course[], request: ScheduleRequest): ScheduleResult {
  const c = request.constraints ?? {};
  const ctx: BuildContext = {
    earliest: c.earliestStart ? requireTime(c.earliestStart, "earliestStart") : null,
    latest: c.latestEnd ? requireTime(c.latestEnd, "latestEnd") : null,
    daysOff: new Set(c.daysOff ?? []),
    openOnly: c.openSeatsOnly === true,
    dPolicy: c.dClearance ?? "avoid",
    excluded: new Set(c.excludeSectionIds ?? []),
    pinned: new Set(c.pinnedSectionIds ?? []),
  };
  const maxResults = Math.min(Math.max(request.maxResults ?? 5, 1), 25);
  const budget = Math.max(1000, request.searchBudget ?? 200_000);
  const diverse = request.diverse !== false;

  const byKey = new Map<string, Course>();
  for (const course of courses) byKey.set(course.code.key, course);

  const diagnostics: CourseDiagnostic[] = [];
  const notes: string[] = [];
  const used = new Set<string>();
  const packagesFor = (input: string, role: CourseRole): { key: string; packages: Package[] } | null => {
    const code = parseCourseCode(input);
    const key = code?.key ?? input;
    if (used.has(key)) return null;
    used.add(key);
    const course = code ? byKey.get(code.key) : undefined;
    const diag: CourseDiagnostic = {
      courseKey: key,
      role,
      found: !!course,
      packagesBeforeConstraints: 0,
      packagesAfterConstraints: 0,
      filteredSections: {},
      message: null,
    };
    diagnostics.push(diag);
    if (!course) {
      diag.message = code ? "Not offered in this term (or not found)." : "Not a valid course code.";
      return { key, packages: [] };
    }
    const packages = buildPackages(course, role, ctx, diag);
    if (!packages.length) {
      const reasons = Object.entries(diag.filteredSections)
        .map(([r, n]) => `${n} ${r.replace(/_/g, " ")}`)
        .join(", ");
      diag.message = diag.packagesBeforeConstraints
        ? `No valid section combination under the constraints${reasons ? ` (sections filtered: ${reasons})` : ""}.`
        : "No sections listed.";
    }
    return { key, packages };
  };

  const required: Slot[] = [];
  for (const input of request.mustHave) {
    const r = packagesFor(input, "must_have");
    if (r) required.push({ label: r.key, optional: false, packages: r.packages });
  }
  const groups: Slot[] = [];
  for (const group of request.pickOneFrom ?? []) {
    const pkgs: Package[] = [];
    const labels: string[] = [];
    for (const input of group) {
      const r = packagesFor(input, "pick_one");
      if (r) {
        pkgs.push(...r.packages);
        labels.push(r.key);
      }
    }
    if (!labels.length) continue;
    pkgs.sort((a, b) => a.cost - b.cost || sig(a).localeCompare(sig(b)));
    groups.push({ label: `one of ${labels.join(" / ")}`, optional: false, packages: pkgs });
  }
  const optional: Slot[] = [];
  for (const input of request.niceToHave ?? []) {
    const r = packagesFor(input, "nice_to_have");
    if (r && r.packages.length) optional.push({ label: r.key, optional: true, packages: r.packages });
  }

  const emptyRequired = [...required, ...groups].filter((s) => !s.packages.length);
  if (emptyRequired.length) {
    notes.push(`Cannot build any schedule: ${emptyRequired.map((s) => s.label).join(", ")} has no usable sections (see diagnostics).`);
    return { schedules: [], diagnostics, incompatiblePairs: [], nodesVisited: 0, exhaustive: true, notes };
  }

  required.sort((a, b) => a.packages.length - b.packages.length || a.label.localeCompare(b.label));
  const slots = [...required, ...groups, ...optional];

  // DFS
  type Leaf = { pkgs: Package[]; nice: number; score: number; signature: string; primary: string };
  const best: Leaf[] = [];
  let nodes = 0;
  let exhausted = false;
  const chosen: Package[] = [];
  const usedIds = new Set<string>();
  const maxUnits = c.maxUnits ?? Infinity;
  const minUnits = c.minUnits ?? 0;
  let units = 0;

  const consider = () => {
    if (units < minUnits) return;
    const pkgs = [...chosen];
    const { cost } = scheduleMetrics(pkgs);
    const score = Math.round((cost + pkgs.reduce((t, p) => t + p.cost, 0)) * 10) / 10;
    const nice = pkgs.filter((p) => p.role === "nice_to_have").length;
    const sorted = [...pkgs].sort((a, b) => a.course.code.key.localeCompare(b.course.code.key));
    const signature = sorted.map(sig).join("|");
    const primary = sorted
      .map((p) => {
        const lec = p.sections.filter((s) => isLectureType(s.type));
        return `${p.course.code.key}:${(lec.length ? lec : p.sections).map((s) => s.id).join("+")}`;
      })
      .join("|");
    const leaf: Leaf = { pkgs, nice, score, signature, primary };
    const better = (a: Leaf, b: Leaf) =>
      a.nice !== b.nice ? a.nice > b.nice : a.score !== b.score ? a.score < b.score : a.signature < b.signature;
    if (diverse) {
      const idx = best.findIndex((l) => l.primary === primary);
      if (idx >= 0) {
        if (better(leaf, best[idx]!)) best.splice(idx, 1);
        else return;
      }
    }
    let pos = best.findIndex((l) => better(leaf, l));
    if (pos < 0) pos = best.length;
    if (pos >= maxResults) return;
    best.splice(pos, 0, leaf);
    if (best.length > maxResults) best.pop();
  };

  const fits = (p: Package) => {
    if (units + p.units > maxUnits) return false;
    for (const s of p.sections) if (usedIds.has(s.id)) return false;
    for (const q of chosen) if (slotsConflict(p.slots, q.slots)) return false;
    return true;
  };

  const dfs = (i: number) => {
    if (exhausted) return;
    if (++nodes > budget) {
      exhausted = true;
      return;
    }
    if (i === slots.length) {
      consider();
      return;
    }
    const slot = slots[i]!;
    for (const p of slot.packages) {
      if (exhausted) return;
      if (!fits(p)) continue;
      chosen.push(p);
      for (const s of p.sections) usedIds.add(s.id);
      units += p.units;
      dfs(i + 1);
      units -= p.units;
      for (const s of p.sections) usedIds.delete(s.id);
      chosen.pop();
    }
    if (slot.optional) dfs(i + 1);
  };
  dfs(0);

  const schedules: Schedule[] = best.map((leaf, idx) => toSchedule(leaf.pkgs, idx + 1, leaf.score, leaf.nice));

  let incompatiblePairs: [string, string][] = [];
  if (!schedules.length) {
    incompatiblePairs = findIncompatiblePairs([...required, ...groups]);
    notes.push(
      incompatiblePairs.length
        ? `No conflict-free schedule. These never fit together: ${incompatiblePairs.map(([a, b]) => `${a} + ${b}`).join("; ")}.`
        : "No conflict-free schedule found under the constraints (try relaxing time window, days off, unit limits or openSeatsOnly).",
    );
  }
  if (exhausted) notes.push(`Search budget reached after ${budget} steps; results are the best found, not guaranteed optimal.`);
  return { schedules, diagnostics, incompatiblePairs, nodesVisited: nodes, exhaustive: !exhausted, notes };
}

function findIncompatiblePairs(slots: Slot[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]!;
      const b = slots[j]!;
      const ok = a.packages.some((p) =>
        b.packages.some((q) => !slotsConflict(p.slots, q.slots) && !p.sections.some((s) => q.sections.some((t) => t.id === s.id))),
      );
      if (!ok) out.push([a.label, b.label]);
    }
  }
  return out;
}

function toSchedule(pkgs: Package[], rank: number, score: number, nice: number): Schedule {
  const { metrics } = scheduleMetrics(pkgs);
  const warnings: string[] = [];
  const courses = [...pkgs]
    .sort((a, b) => a.course.code.key.localeCompare(b.course.code.key))
    .map((p): ScheduledCourse => {
      const variable = p.course.units.length > 1;
      if (variable) warnings.push(`${p.course.code.key} has variable units (${p.course.units.join("/")}); counted as ${p.units}.`);
      if (p.linkInferred) warnings.push(`${p.course.code.key}: a section without a published link code was paired by inference; confirm the pairing in WebReg.`);
      for (const s of p.sections) {
        if (s.requiresDClearance) warnings.push(`${p.course.code.key} section ${s.id} requires D-clearance.`);
        if (s.seats.state !== "open") warnings.push(`${p.course.code.key} section ${s.id} is ${s.seats.state}.`);
      }
      return {
        courseKey: p.course.code.key,
        displayCode: p.course.displayCode,
        title: p.course.title,
        role: p.role,
        units: p.units,
        variableUnits: variable,
        linkInferred: p.linkInferred,
        sections: p.sections.map((s) => ({
          id: s.id,
          type: s.type,
          linkCode: s.linkCode,
          meetings: s.meetings,
          instructors: s.instructors,
          seats: s.seats,
          requiresDClearance: s.requiresDClearance,
          notes: s.notes,
        })),
      };
    });
  if (metrics.tbaSections) warnings.push(`${metrics.tbaSections} section(s) have TBA times and were not checked for conflicts.`);
  return {
    rank,
    courses,
    totalUnits: pkgs.reduce((t, p) => t + p.units, 0),
    niceToHaveIncluded: nice,
    score,
    metrics,
    warnings,
  };
}

function requireTime(t: string, field: string): number {
  const v = parseTime(t);
  if (v === null) throw new RangeError(`${field} must be "HH:MM" in 24-hour time, got "${t}".`);
  return v;
}
