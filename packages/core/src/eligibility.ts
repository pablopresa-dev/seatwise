import { codeSatisfies, parseCourseCode } from "./codes.js";
import { requisiteToText } from "./normalize.js";
import type { ClassStanding, Course, CourseCode, Requisite, Restriction, StudentProfile } from "./types.js";

export type EligibilityStatus = "eligible" | "needs_d_clearance" | "blocked" | "unknown";
export type RuleOutcome = "pass" | "fail" | "needs_d_clearance" | "unknown" | "info";
export type EligibilityRule =
  | "offering"
  | "class_level"
  | "major"
  | "school"
  | "prerequisites"
  | "corequisites"
  | "concurrent"
  | "d_clearance"
  | "visiting"
  | "recommended_prep"
  | "duplicate_credit"
  | "already_completed";

export interface EligibilityRuleResult {
  rule: EligibilityRule;
  outcome: RuleOutcome;
  message: string;
  /** Unmet requirement expressions, e.g. ["CSCI 104 or CSCI 114"]. */
  missing?: string[];
}

export interface EligibilityResult {
  courseKey: string;
  title: string;
  status: EligibilityStatus;
  summary: string;
  rules: EligibilityRuleResult[];
}

/** Class-level codes as published by the API (observed: U1-U5, M, D). */
export const CLASS_STANDING_CODES: Record<ClassStanding, string> = {
  freshman: "U1",
  sophomore: "U2",
  junior: "U3",
  senior: "U4",
  fifth_year_senior: "U5",
  masters: "M",
  doctoral: "D",
};
const KNOWN_LEVEL_CODES = new Set(Object.values(CLASS_STANDING_CODES));

type Tri = boolean | null;

/** Evaluate a requisite: true = satisfied, false = not satisfied, null = cannot tell. */
export function evaluateRequisite(node: Requisite, have: readonly CourseCode[]): Tri {
  switch (node.kind) {
    case "course":
      return have.some((h) => codeSatisfies(h, node.code));
    case "unparsed":
      return null;
    case "all": {
      const r = node.items.map((i) => evaluateRequisite(i, have));
      if (r.includes(false)) return false;
      if (r.includes(null)) return null;
      return true;
    }
    case "choose": {
      const r = node.items.map((i) => evaluateRequisite(i, have));
      const yes = r.filter((x) => x === true).length;
      const maybe = r.filter((x) => x === null).length;
      if (yes >= node.count) return true;
      if (yes + maybe >= node.count) return null;
      return false;
    }
  }
}

/** Human-readable list of the parts of a requisite that are not (definitely) satisfied. */
export function unmetRequisites(node: Requisite, have: readonly CourseCode[]): string[] {
  const r = evaluateRequisite(node, have);
  if (r === true) return [];
  if (node.kind === "all") return node.items.flatMap((i) => unmetRequisites(i, have));
  return [requisiteToText(node)];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

interface GroupMatch {
  definite: string[];
  possible: string[];
}

function matchGroups(restriction: Restriction, values: readonly string[]): GroupMatch {
  const definite: string[] = [];
  const possible: string[] = [];
  for (const g of restriction.groups) {
    const label = g.description ? `${g.description} (${g.code})` : g.code;
    const code = norm(g.code);
    const desc = g.description ? norm(g.description) : "";
    for (const v of values) {
      const nv = norm(v);
      if (!nv) continue;
      if (nv === code || (desc && nv === desc)) {
        if (!definite.includes(label)) definite.push(label);
      } else if (desc && nv.length >= 4 && (desc.includes(nv) || nv.includes(desc))) {
        if (!possible.includes(label)) possible.push(label);
      }
    }
  }
  return { definite, possible };
}

function groupList(r: Restriction): string {
  return r.groups.map((g) => (g.description ? `${g.description} (${g.code})` : g.code)).join(", ");
}

const KIND_NOUN: Record<Restriction["kind"], string> = {
  class_level: "class levels",
  major: "majors",
  school: "schools",
};

function checkMembershipRestriction(
  r: Restriction,
  values: readonly string[],
  visiting: boolean,
): EligibilityRuleResult {
  const rule = r.kind;
  const noun = KIND_NOUN[r.kind];
  const list = groupList(r);
  if (r.mode === "unknown") {
    return { rule, outcome: "unknown", message: `Has a ${noun} restriction of an unrecognized type: ${list}.` };
  }
  const open = r.mode === "open_only_to";
  const what = open ? `Open only to ${noun}: ${list}.` : `Closed to ${noun}: ${list}.`;
  if (!values.length) {
    return {
      rule,
      outcome: "unknown",
      message: `${what} The student's ${rule === "major" ? "major" : "school"} was not provided.`,
    };
  }
  const { definite, possible } = matchGroups(r, values);
  if (definite.length) {
    if (!open) {
      return { rule, outcome: "fail", message: `${what} The student is in ${definite.join(", ")}.` };
    }
    if (visiting) {
      return {
        rule,
        outcome: "unknown",
        message: `${what} The stated ${rule} matches ${definite.join(", ")}, but visiting/exchange students are often coded under a non-degree or exchange program in USC's system rather than this ${rule}. Confirm with the department (they can issue D-clearance).`,
      };
    }
    return { rule, outcome: "pass", message: `${what} Matches ${definite.join(", ")}.` };
  }
  if (possible.length) {
    return {
      rule,
      outcome: "unknown",
      message: `${what} "${values.join(", ")}" may correspond to ${possible.join(", ")}, but not exactly. Confirm the student's exact USC ${rule} code.`,
    };
  }
  if (!open) return { rule, outcome: "pass", message: `${what} The student is not in any of them.` };
  return {
    rule,
    outcome: visiting ? "unknown" : "fail",
    message: visiting
      ? `${what} "${values.join(", ")}" is not listed. Visiting/exchange students outside these ${noun} generally need department approval (D-clearance); ask the department.`
      : `${what} "${values.join(", ")}" is not listed. If the student's ${rule} appears above under another name, re-check with that exact code.`,
  };
}

function checkClassLevel(r: Restriction, standing: ClassStanding | undefined): EligibilityRuleResult {
  const list = groupList(r);
  const open = r.mode === "open_only_to";
  const what = open ? `Open only to class levels: ${list}.` : `Closed to class levels: ${list}.`;
  if (r.mode === "unknown") return { rule: "class_level", outcome: "unknown", message: `Class-level restriction of an unrecognized type: ${list}.` };
  if (!standing) return { rule: "class_level", outcome: "unknown", message: `${what} The student's class standing was not provided.` };
  const code = CLASS_STANDING_CODES[standing];
  const inList = r.groups.some((g) => g.code.toUpperCase() === code);
  const hasUnknownCodes = r.groups.some((g) => !KNOWN_LEVEL_CODES.has(g.code.toUpperCase()));
  if (inList) {
    return { rule: "class_level", outcome: open ? "pass" : "fail", message: `${what} Student is ${standing.replace(/_/g, " ")} (${code}).` };
  }
  if (hasUnknownCodes) {
    return { rule: "class_level", outcome: "unknown", message: `${what} Some codes are not recognized, so ${standing.replace(/_/g, " ")} (${code}) cannot be checked reliably.` };
  }
  return { rule: "class_level", outcome: open ? "fail" : "pass", message: `${what} Student is ${standing.replace(/_/g, " ")} (${code}).` };
}

const CODE_IN_TEXT = /\b([A-Z]{2,5})[\s-]?(\d{3}[A-Za-z]?)\b/g;

function codesInText(text: string): CourseCode[] {
  const out: CourseCode[] = [];
  for (const m of text.matchAll(CODE_IN_TEXT)) {
    const c = parseCourseCode(`${m[1]} ${m[2]}`);
    if (c) out.push(c);
  }
  return out;
}

/**
 * Check whether a student can register for a course, rule by rule. Deterministic and
 * conservative: when the data does not settle a rule, the rule is "unknown" (never guessed).
 */
export function checkEligibility(course: Course, profile: StudentProfile): EligibilityResult {
  const rules: EligibilityRuleResult[] = [];
  const completed = profile.completedCourses.map(parseCourseCode).filter((c): c is CourseCode => !!c);
  const planned = (profile.plannedCourses ?? []).map(parseCourseCode).filter((c): c is CourseCode => !!c);
  const visiting = profile.isVisitingOrExchange === true;
  const majors = profile.majors ?? [];
  const schools = profile.school ? [profile.school] : [];

  if (completed.some((c) => codeSatisfies(c, course.code))) {
    rules.push({ rule: "already_completed", outcome: "info", message: `The student lists ${course.code.key} as already completed; retaking may not earn credit.` });
  }

  const active = course.sections.filter((s) => !s.isCancelled);
  if (!course.sections.length || !active.length) {
    rules.push({
      rule: "offering",
      outcome: "fail",
      message: course.sections.length ? "Every section of this course is cancelled this term." : "No sections are listed for this term.",
    });
  }

  for (const r of course.restrictions) {
    if (r.kind === "class_level") rules.push(checkClassLevel(r, profile.classStanding));
    else rules.push(checkMembershipRestriction(r, r.kind === "major" ? majors : schools, visiting));
  }

  if (course.prerequisites) {
    const ok = evaluateRequisite(course.prerequisites, completed);
    const text = course.prerequisiteText ?? requisiteToText(course.prerequisites);
    if (ok === true) {
      rules.push({
        rule: "prerequisites",
        outcome: "pass",
        message: `Prerequisites met: ${text}.${visiting ? " Coursework from a home institution is not on the USC record; the department may need to verify it before registration." : ""}`,
      });
    } else if (ok === false) {
      rules.push({
        rule: "prerequisites",
        outcome: "fail",
        message: `Prerequisites not met. Requires: ${text}. If equivalent coursework was completed elsewhere (AP, transfer, home university), list its USC equivalent in completedCourses or ask the department for a prerequisite override.`,
        missing: unmetRequisites(course.prerequisites, completed),
      });
    } else {
      rules.push({ rule: "prerequisites", outcome: "unknown", message: `Prerequisite data could not be fully interpreted: ${text}.` });
    }
  }

  if (course.corequisites) {
    const have = [...completed, ...planned];
    const ok = evaluateRequisite(course.corequisites, have);
    const text = course.corequisiteText ?? requisiteToText(course.corequisites);
    if (ok === true) {
      rules.push({ rule: "corequisites", outcome: "pass", message: `Corequisite satisfied (completed or planned): ${text}.` });
    } else if (ok === false) {
      rules.push({
        rule: "corequisites",
        outcome: "fail",
        message: `Corequisite required: ${text}. It is normally taken in the same term (prior completion usually also counts). Add it to plannedCourses if the student will take it concurrently.`,
        missing: unmetRequisites(course.corequisites, have),
      });
    } else {
      rules.push({ rule: "corequisites", outcome: "unknown", message: `Corequisite data could not be fully interpreted: ${text}.` });
    }
  }

  if (course.concurrentRaw.length) {
    rules.push({
      rule: "concurrent",
      outcome: "unknown",
      message: `A concurrent-enrollment requirement is listed but its format is not understood: ${JSON.stringify(course.concurrentRaw).slice(0, 200)}.`,
    });
  }

  if (active.length) {
    const dSections = active.filter((s) => s.requiresDClearance);
    if (dSections.length === active.length) {
      rules.push({
        rule: "d_clearance",
        outcome: "needs_d_clearance",
        message: "Every active section requires departmental clearance (D-clearance) from the offering department before registering.",
      });
    } else if (dSections.length) {
      rules.push({
        rule: "d_clearance",
        outcome: "info",
        message: `${dSections.length} of ${active.length} active sections require D-clearance (${dSections.map((s) => s.id).join(", ")}); the others do not.`,
      });
    }
  }

  if (visiting) {
    rules.push({
      rule: "visiting",
      outcome: "info",
      message: "Visiting/exchange students may face extra registration steps (department approval, limited access to some programs). This check only covers what the public Schedule of Classes publishes.",
    });
  }

  if (course.recommendedPrep) {
    rules.push({ rule: "recommended_prep", outcome: "info", message: `Recommended preparation (not enforced): ${course.recommendedPrep.trim().replace(/[.\s]+$/, "")}.` });
  }

  if (course.duplicateCredit) {
    const dupes = codesInText(course.duplicateCredit);
    const hit = dupes.filter((d) => completed.some((c) => codeSatisfies(c, d)));
    rules.push({
      rule: "duplicate_credit",
      outcome: "info",
      message: hit.length
        ? `Duplicates credit with ${hit.map((h) => h.key).join(", ")}, which the student completed: they likely will not earn credit for both.`
        : `Duplicates credit with: ${course.duplicateCredit}.`,
    });
  }

  const status: EligibilityStatus = rules.some((r) => r.outcome === "fail")
    ? "blocked"
    : rules.some((r) => r.outcome === "needs_d_clearance")
      ? "needs_d_clearance"
      : rules.some((r) => r.outcome === "unknown")
        ? "unknown"
        : "eligible";

  return { courseKey: course.code.key, title: course.title, status, summary: summarize(status, rules), rules };
}

function summarize(status: EligibilityStatus, rules: EligibilityRuleResult[]): string {
  const pick = (o: RuleOutcome) => rules.filter((r) => r.outcome === o).map((r) => r.rule.replace(/_/g, " "));
  switch (status) {
    case "eligible":
      return "No published restriction or requisite blocks registration.";
    case "blocked":
      return `Blocked by: ${pick("fail").join(", ")}.`;
    case "needs_d_clearance":
      return "Requires departmental clearance (D-clearance) before registering.";
    case "unknown":
      return `Could not determine: ${pick("unknown").join(", ")}. See rule messages for what information is missing.`;
  }
}
