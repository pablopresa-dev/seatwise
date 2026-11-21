import { makeCode, parseCourseCode } from "./codes.js";
import type {
  RawCourse,
  RawCourseCode,
  RawMeeting,
  RawRequisiteGroup,
  RawRestriction,
  RawSection,
} from "./raw.js";
import {
  DAYS,
  type Course,
  type CourseCode,
  type Day,
  type Meeting,
  type Requisite,
  type Restriction,
  type RestrictionKind,
  type SeatStatus,
  type Section,
} from "./types.js";

const DAY_SET = new Set<string>(DAYS);

export function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normalizeMeeting(raw: RawMeeting): Meeting {
  const days = (raw.days ?? []).filter((d): d is Day => DAY_SET.has(d));
  const start = parseTime(raw.startTime);
  const end = parseTime(raw.endTime);
  const tba = start === null || end === null || days.length === 0;
  return {
    days,
    start: tba ? null : start,
    end: tba ? null : end,
    startTime: tba ? null : formatTime(start!),
    endTime: tba ? null : formatTime(end!),
    tba,
  };
}

export function normalizeSeats(raw: RawSection): SeatStatus {
  const total = raw.totalSeats ?? 0;
  const registered = raw.registeredSeats ?? 0;
  const isCancelled = raw.isCancelled === true;
  const isFull = raw.isFull === true || (total > 0 && registered >= total);
  return {
    sectionId: raw.sisSectionId ?? "",
    total,
    registered,
    available: Math.max(0, total - registered),
    waitlisted: raw.waitlistedSeats ?? null,
    isFull,
    isCancelled,
    state: isCancelled ? "cancelled" : isFull ? "full" : "open",
  };
}

function cleanText(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

function parseUnits(values: readonly (string | number)[] | null | undefined): number[] {
  const out = new Set<number>();
  for (const v of values ?? []) {
    const n = typeof v === "number" ? v : Number.parseFloat(v);
    if (Number.isFinite(n)) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export function normalizeSection(raw: RawSection, courseKey: string): Section {
  const noteParts: string[] = [];
  for (const n of [raw.name, raw.description, raw.notes]) {
    const t = cleanText(n);
    if (t && !noteParts.includes(t)) noteParts.push(t);
  }
  const instructors = (raw.instructors ?? [])
    .map((i) => [i.firstName, i.lastName].filter(Boolean).join(" ").trim())
    .filter((n) => n.length > 0);
  return {
    id: raw.sisSectionId ?? "",
    courseKey,
    type: raw.rnrMode ?? "Unknown",
    typeCode: raw.rnrModeCode ?? null,
    linkCode: cleanText(raw.linkCode),
    sessionCode: raw.session?.rnrSessionCode ?? null,
    units: parseUnits(raw.units),
    meetings: (raw.schedule ?? []).map(normalizeMeeting),
    instructors,
    seats: normalizeSeats(raw),
    requiresDClearance: raw.hasDClearance === true,
    isCancelled: raw.isCancelled === true,
    notes: noteParts.length ? noteParts.join(" | ") : null,
    syllabusUrl: raw.syllabus ?? null,
  };
}

function rawCodeToCode(raw: RawCourseCode): CourseCode | null {
  const prefix = raw.prefix?.trim();
  const rest = raw.theRest?.trim() ?? raw.number?.trim();
  if (prefix && rest) {
    const parsed = parseCourseCode(`${prefix} ${rest}`);
    if (parsed) return parsed;
  }
  return raw.courseSpace ? parseCourseCode(raw.courseSpace) : null;
}

function rawCodeText(raw: RawCourseCode): string {
  return raw.courseSpace ?? [raw.prefix, raw.theRest ?? raw.number].filter(Boolean).join(" ");
}

function courseNode(raw: RawCourseCode): Requisite {
  const code = rawCodeToCode(raw);
  return code ? { kind: "course", code } : { kind: "unparsed", text: rawCodeText(raw) || "(empty)" };
}

function simplify(node: Requisite): Requisite {
  if (node.kind === "all" && node.items.length === 1) return node.items[0]!;
  if (node.kind === "choose" && node.items.length === 1 && node.count <= 1) return node.items[0]!;
  return node;
}

/**
 * Build a requisite expression from the raw groups. Semantics confirmed against the
 * classes.usc.edu "courseRequisite" renderer: groups are ANDed; inside a group, at least
 * `requiredCourses` of the `courseOptions` are needed; an option with `ands` means
 * (option AND each of ands). The `order` field is ignored by the site and by us.
 */
export function normalizeRequisites(groups: RawRequisiteGroup[] | null | undefined): Requisite | null {
  const items: Requisite[] = [];
  for (const g of groups ?? []) {
    const options = (g.courseOptions ?? []).map((opt): Requisite => {
      const head = courseNode(opt);
      const ands = (opt.ands ?? []).map(courseNode);
      return ands.length ? { kind: "all", items: [head, ...ands] } : head;
    });
    if (!options.length) continue;
    const count = Math.max(1, Math.min(g.requiredCourses ?? 1, options.length));
    items.push(simplify({ kind: "choose", count, items: options }));
  }
  if (!items.length) return null;
  return simplify({ kind: "all", items });
}

/** Render a requisite like the official site does, e.g. "CSCI 104 and (MATH 225 or (EE 141 and MATH 126))". */
export function requisiteToText(node: Requisite): string {
  const wrap = (n: Requisite): string => {
    const t = requisiteToText(n);
    return n.kind === "course" || n.kind === "unparsed" ? t : `(${t})`;
  };
  switch (node.kind) {
    case "course":
      return node.code.key;
    case "unparsed":
      return node.text;
    case "all":
      return node.items.map(wrap).join(" and ");
    case "choose":
      if (node.count === 1) return node.items.map(wrap).join(" or ");
      if (node.count >= node.items.length) return node.items.map(wrap).join(" and ");
      return `${node.count} from (${node.items.map(wrap).join(" or ")})`;
  }
}

function normalizeRestrictionList(kind: RestrictionKind, list: RawRestriction[] | null | undefined): Restriction[] {
  const byMode = new Map<Restriction["mode"], Restriction>();
  for (const r of list ?? []) {
    const code = r.groupCode?.trim();
    if (!code) continue;
    const mode: Restriction["mode"] =
      r.restriction === "Inclusive" || r.restrictionCode === "I"
        ? "open_only_to"
        : r.restriction === "Exclusive" || r.restrictionCode === "E"
          ? "closed_to"
          : "unknown";
    let entry = byMode.get(mode);
    if (!entry) {
      entry = { kind, mode, groups: [] };
      byMode.set(mode, entry);
    }
    entry.groups.push({ code, description: cleanText(r.groupDescription) });
  }
  return [...byMode.values()];
}

export interface NormalizeOptions {
  /** GE category prefix the course was listed under (GE endpoint only). */
  geCategory?: string;
}

export function normalizeCourse(raw: RawCourse, termCode: string, opts: NormalizeOptions = {}): Course {
  const full = raw.fullCourseName ?? `${raw.prefix ?? "?"} ${raw.classNumber ?? "?"}`;
  const parsed = parseCourseCode(full);
  const code =
    parsed ??
    makeCode((raw.prefix ?? "UNKNOWN").toUpperCase(), raw.classNumber ?? "000", raw.sequence ?? null);
  // Prefer the explicit sequence field when present.
  const finalCode = raw.sequence && code.sequence !== raw.sequence.toUpperCase()
    ? makeCode(code.prefix, code.number, raw.sequence)
    : code;
  const suffix = raw.suffix?.trim() ?? "";
  const sections = (raw.sections ?? []).map((s) => normalizeSection(s, finalCode.key));
  let units = parseUnits(raw.courseUnits ?? []);
  if (!units.length) units = parseUnits(sections.flatMap((s) => s.units.map(String)));
  const prerequisites = normalizeRequisites(raw.prerequisiteCourseCodes);
  const corequisites = normalizeRequisites(raw.corequisiteCourseCodes);
  const scheduled = raw.scheduledCourseCode?.courseSpace ?? null;
  const notes = [cleanText(raw.courseNotes), cleanText(raw.termNotes)].filter((x): x is string => !!x);
  return {
    termCode,
    code: finalCode,
    displayCode: `${finalCode.key}${suffix && suffix.toUpperCase() !== finalCode.sequence ? suffix : ""}`,
    title: cleanText(raw.name) ?? finalCode.key,
    description: cleanText(raw.description),
    units,
    prerequisites,
    corequisites,
    prerequisiteText: prerequisites ? requisiteToText(prerequisites) : null,
    corequisiteText: corequisites ? requisiteToText(corequisites) : null,
    concurrentRaw: raw.concurrentCourses ?? [],
    recommendedPrep: cleanText(raw.recommendedPrep),
    duplicateCredit: cleanText(raw.duplicateCredit),
    restrictions: [
      ...normalizeRestrictionList("class_level", raw.courseRestrictions),
      ...normalizeRestrictionList("major", raw.majorRestrictions),
      ...normalizeRestrictionList("school", raw.schoolRestrictions),
    ],
    geCategories: opts.geCategory ? [opts.geCategory] : [],
    isCrossListed: raw.isCrossListed === true,
    scheduledAs: raw.isCrossListed && scheduled && scheduled !== finalCode.key ? scheduled : null,
    notes: notes.length ? notes.join(" | ") : null,
    seatSummary: {
      total: raw.sectionSeatCount ?? null,
      remaining: raw.remainingSectionSeats ?? null,
    },
    sections,
  };
}
