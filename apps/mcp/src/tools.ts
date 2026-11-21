import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  InvalidCourseCodeError,
  SeatwiseInputError,
  UscApiError,
  buildSchedules,
  checkEligibility,
  checkSeats,
  isValidTermCode,
  parseCourseCode,
  type Course,
  type CourseDataSource,
  type CourseListResult,
  type StudentProfile,
} from "@seatwise/core";
import { z } from "zod";
import {
  clip,
  courseDetail,
  courseDetailText,
  courseSummary,
  courseSummaryText,
  eligibilityText,
  scheduleResultText,
  seatReportText,
} from "./format.js";

// ---------------------------------------------------------------------------
// Shared schemas

const DAY = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const TIME = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use 24-hour "HH:MM", e.g. "09:00" or "17:30".');
const COURSE_CODE = z
  .string()
  .min(4)
  .max(20)
  .describe('USC course code, PREFIX NUMBER, e.g. "CSCI 270", "WRIT 150", "MATH 226".');

const termCode = z
  .string()
  .regex(/^\d{4}[123]$/, 'Term code is YYYYS with S = 1 spring, 2 summer, 3 fall, e.g. "20271".')
  .optional()
  .describe('USC term code YYYYS (S: 1 spring, 2 summer, 3 fall), e.g. "20271" = Spring 2027. Omit to use the newest active term.');

const profileShape = {
  majors: z
    .array(z.string().min(1).max(80))
    .max(5)
    .optional()
    .describe('Declared USC major(s), as major codes (e.g. "CSCI") or exact names ("Computer Science"). Omit if unknown.'),
  school: z
    .string()
    .max(80)
    .optional()
    .describe('USC school code (e.g. "ENGV") or name ("Viterbi School of Engineering"). Omit if unknown.'),
  classStanding: z
    .enum(["freshman", "sophomore", "junior", "senior", "fifth_year_senior", "masters", "doctoral"])
    .optional()
    .describe("Class standing for the target term. Omit if unknown."),
  completedCourses: z
    .array(z.string().min(2).max(20))
    .max(200)
    .default([])
    .describe(
      'Completed USC courses (incl. transfer/AP credit already mapped to USC codes), e.g. ["CSCI 103", "MATH 125"]. Extract these yourself from a STARS report or transcript the student shares; the server does not read files.',
    ),
  plannedCourses: z
    .array(z.string().min(2).max(20))
    .max(20)
    .optional()
    .describe("Courses the student will take in the same term (used to satisfy corequisites)."),
  isVisitingOrExchange: z.boolean().optional().describe("True for visiting, exchange or other non-degree students."),
};
const ProfileSchema = z.object(profileShape).strict();

// ---------------------------------------------------------------------------
// Helpers

export interface ToolContext {
  source: CourseDataSource;
}

function ok(text: string, structured: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

export function toolError(err: unknown): CallToolResult {
  let msg: string;
  if (err instanceof SeatwiseInputError || err instanceof InvalidCourseCodeError || err instanceof RangeError) {
    msg = `Input error: ${err.message}`;
  } else if (err instanceof UscApiError) {
    msg = `USC Schedule of Classes error: ${err.message}`;
  } else {
    msg = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { content: [{ type: "text", text: msg }], isError: true };
}

async function resolveTerm(ctx: ToolContext, term: string | undefined): Promise<string> {
  if (term) {
    if (!isValidTermCode(term)) throw new SeatwiseInputError(`Invalid term code "${term}".`);
    return term;
  }
  return ctx.source.getDefaultTermCode();
}

function validateCodes(codes: readonly string[]): void {
  const bad = codes.filter((c) => !parseCourseCode(c));
  if (bad.length) throw new InvalidCourseCodeError(bad.join(", "));
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

function matchesText(c: Course, query: string): boolean {
  const hay = `${c.code.key} ${c.displayCode} ${c.title} ${c.description ?? ""}`.toLowerCase();
  return words(query).every((w) => hay.includes(w));
}

// ---------------------------------------------------------------------------
// Tool definitions

type Handler<S extends z.ZodRawShape> = (args: z.objectOutputType<S, z.ZodTypeAny>, ctx: ToolContext) => Promise<CallToolResult>;

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  handler: Handler<S>;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
export const TOOL_ANNOTATIONS = READ_ONLY;

function def<S extends z.ZodRawShape>(d: ToolDef<S>): ToolDef<S> {
  return d;
}

export const listTerms = def({
  name: "list_terms",
  title: "List active USC terms",
  description:
    'List the terms currently published in the USC Schedule of Classes (e.g. "Spring 2027" = 20271), newest first. The first one is the default term used when other tools get no termCode. Call this first if the student has not said which term they are planning.',
  inputSchema: {},
  handler: async (_args, ctx) => {
    const terms = await ctx.source.getTerms();
    const def0 = terms[0]?.code ?? null;
    const text = terms.length
      ? `Active terms:\n${terms.map((t) => `- ${t.label}: ${t.code}${t.code === def0 ? " (default)" : ""}`).join("\n")}`
      : "No active terms are published right now.";
    return ok(text, { defaultTermCode: def0, terms });
  },
});

export const listDepartments = def({
  name: "list_departments",
  title: "List USC schools and department prefixes",
  description:
    'List USC schools and the department (program) prefixes offered in a term, e.g. Viterbi School of Engineering -> CSCI (Computer Science). Use it to turn a subject ("computer science", "cinema") into the prefix that search_courses expects, or to learn a school code for check_eligibility. Optional `query` filters by prefix, department name or school name.',
  inputSchema: {
    termCode,
    query: z.string().min(2).max(60).optional().describe('Filter, e.g. "computer", "CSCI", "Viterbi".'),
  },
  handler: async (args, ctx) => {
    const term = await resolveTerm(ctx, args.termCode);
    const schools = await ctx.source.getSchools(term);
    const q = args.query?.toLowerCase().trim();
    const filtered = schools
      .map((s) => {
        if (!q) return s;
        const schoolHit = s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q;
        const programs = schoolHit
          ? s.programs
          : s.programs.filter((p) => p.prefix.toLowerCase() === q || p.name.toLowerCase().includes(q));
        return { ...s, programs };
      })
      .filter((s) => s.programs.length);
    const text = filtered.length
      ? clip(
          `Term ${term}. School (code): department prefixes\n${filtered
            .map((s) => `- ${s.name} (${s.code}): ${s.programs.map((p) => `${p.prefix} ${p.name}`).join("; ")}`)
            .join("\n")}`,
          "Pass a narrower `query`.",
        )
      : `No school or department matches "${args.query}" in term ${term}.`;
    return ok(text, { termCode: term, schools: filtered });
  },
});

export const listGeCategories = def({
  name: "list_ge_categories",
  title: "List USC GE categories",
  description:
    'List the General Education categories for a term with their prefixes, e.g. ARTS (Category A: The Arts), HINQ, SANA, LIFE, PSC, QREA, GPG, GPH. Pass a prefix as `geCategory` to search_courses. Students who started Fall 2015 or later use the "Fall2015OrLater" group.',
  inputSchema: { termCode },
  handler: async (args, ctx) => {
    const term = await resolveTerm(ctx, args.termCode);
    const cats = await ctx.source.getGeCategories(term);
    const groups = [...new Set(cats.map((c) => c.groupType))];
    const text = groups
      .map((g) => `**${g}**\n${cats.filter((c) => c.groupType === g).map((c) => `- ${c.prefix}: ${c.name} (${c.requirementName})`).join("\n")}`)
      .join("\n\n");
    return ok(text || "No GE categories published for this term.", { termCode: term, categories: cats });
  },
});

export const searchCoursesTool = def({
  name: "search_courses",
  title: "Search USC courses",
  description: `Find courses offered in a term by keyword, department prefix and/or GE category. Provide at least one of query, department, geCategory; combining them narrows the results (e.g. geCategory "ARTS" + query "film").
Returns compact summaries: code, title, units, GE category (only known when geCategory is given), prerequisites, restrictions, seat totals, lecture times. Use get_course_details for every section.
Keyword search matches course titles/codes the way classes.usc.edu does (e.g. "machine learning", "CSCI 270"). Paginate with offset.`,
  inputSchema: {
    termCode,
    query: z.string().min(2).max(100).optional().describe('Keywords or a course code, e.g. "algorithms", "CSCI 270".'),
    department: z.string().min(2).max(6).optional().describe('Department prefix, e.g. "CSCI", "MATH", "CTCS" (see list_departments).'),
    geCategory: z.string().min(2).max(10).optional().describe('GE category prefix, e.g. "ARTS", "HINQ", "GPH" (see list_ge_categories).'),
    level: z.enum(["undergraduate", "graduate", "any"]).default("any").describe("undergraduate = 000-499, graduate = 500+."),
    minUnits: z.number().min(0).max(20).optional(),
    maxUnits: z.number().min(0).max(20).optional(),
    onlyWithOpenSeats: z.boolean().default(false).describe("Only courses that still have open seats."),
    limit: z.number().int().min(1).max(50).default(15),
    offset: z.number().int().min(0).default(0),
  },
  handler: async (args, ctx) => {
    if (!args.query && !args.department && !args.geCategory) {
      throw new SeatwiseInputError("Provide at least one of query, department or geCategory.");
    }
    const term = await resolveTerm(ctx, args.termCode);
    let base: CourseListResult;
    if (args.department) base = await ctx.source.getDepartmentCourses(term, args.department);
    else if (args.geCategory) base = await ctx.source.getGeCourses(term, args.geCategory);
    else base = await ctx.source.searchCourses(term, args.query!);
    let courses = base.courses;
    if (args.department && args.geCategory) {
      const ge = await ctx.source.getGeCourses(term, args.geCategory);
      const geKeys = new Map(ge.courses.map((c) => [c.code.key, c.geCategories]));
      courses = courses
        .filter((c) => geKeys.has(c.code.key))
        .map((c) => ({ ...c, geCategories: [...new Set([...c.geCategories, ...(geKeys.get(c.code.key) ?? [])])] }));
    }
    if (args.query && (args.department || args.geCategory)) courses = courses.filter((c) => matchesText(c, args.query!));
    if (args.level !== "any") {
      courses = courses.filter((c) => {
        const n = Number(c.code.number);
        return args.level === "graduate" ? n >= 500 : n < 500;
      });
    }
    if (args.minUnits !== undefined) courses = courses.filter((c) => c.units.some((u) => u >= args.minUnits!));
    if (args.maxUnits !== undefined) courses = courses.filter((c) => c.units.some((u) => u <= args.maxUnits!));
    if (args.onlyWithOpenSeats) {
      // Course-level remaining seats when published; otherwise any open lecture-type (or any) section.
      courses = courses.filter((c) => {
        if (c.seatSummary.remaining !== null) return c.seatSummary.remaining > 0;
        const active = c.sections.filter((s) => !s.isCancelled);
        const lectures = active.filter((s) => /lec/i.test(s.type));
        return (lectures.length ? lectures : active).some((s) => s.seats.state === "open");
      });
    }
    courses = [...courses].sort((a, b) => a.code.key.localeCompare(b.code.key, "en", { numeric: true }));
    const total = courses.length;
    const page = courses.slice(args.offset, args.offset + args.limit).map(courseSummary);
    const hasMore = args.offset + page.length < total;
    const structured = {
      termCode: term,
      total,
      count: page.length,
      offset: args.offset,
      hasMore,
      nextOffset: hasMore ? args.offset + page.length : null,
      fetchedAt: base.fetchedAt,
      courses: page,
    };
    const header = `Term ${term}: ${total} course(s) match${total ? `, showing ${args.offset + 1}-${args.offset + page.length}` : ""}.${hasMore ? ` More available: offset=${structured.nextOffset}.` : ""}`;
    const text = total ? `${header}\n\n${page.map(courseSummaryText).join("\n\n")}` : `${header} Try broader keywords, a department prefix, or a different term.`;
    return ok(clip(text, "Use a smaller `limit` or paginate with `offset`."), structured);
  },
});

export const getCourseDetails = def({
  name: "get_course_details",
  title: "Get USC course details and sections",
  description: `Full details for one course in a term: description, prerequisites/corequisites (as published), restrictions (class level, major, school), duplicate credit, notes, and every section grouped by link code with type, days/times, instructors, seats, D-clearance and cancellation.
Registration rule: choose ONE group and register for one section of each listed type in it (e.g. lecture + lab + quiz). Groups flagged inferredPairing contain sections without a published link code that were paired by inference. build_schedule applies the same rule automatically.`,
  inputSchema: { termCode, courseCode: COURSE_CODE },
  handler: async (args, ctx) => {
    const term = await resolveTerm(ctx, args.termCode);
    validateCodes([args.courseCode]);
    const course = await ctx.source.getCourse(term, args.courseCode);
    if (!course) {
      return ok(`${args.courseCode} is not offered in term ${term} (or the code is wrong). Try search_courses.`, {
        termCode: term,
        found: false,
        courseCode: args.courseCode,
      });
    }
    return ok(clip(courseDetailText(course), "Ask about specific sections with check_seats."), {
      termCode: term,
      found: true,
      course: courseDetail(course),
    });
  },
});

export const checkEligibilityTool = def({
  name: "check_eligibility",
  title: "Check course eligibility",
  description: `Check, rule by rule, whether a student can register for up to 15 courses: class-level, major and school restrictions; prerequisites (AND/OR, evaluated against completedCourses); corequisites (completed or plannedCourses); D-clearance; cancelled offerings; duplicate credit.
Statuses: eligible | needs_d_clearance | blocked | unknown. "unknown" means the published data or the profile is not enough to decide (e.g. major not given, partial name match); ask the student or tell them to confirm with the department. Never upgrade unknown to eligible.
completedCourses must be USC codes. Extract them yourself from a STARS report or transcript the student shares (the server does not read PDFs).`,
  inputSchema: {
    termCode,
    courseCodes: z.array(COURSE_CODE).min(1).max(15).describe("Courses to check."),
    profile: ProfileSchema.describe("What is known about the student. Leave fields out rather than guessing."),
  },
  handler: async (args, ctx) => {
    const term = await resolveTerm(ctx, args.termCode);
    validateCodes(args.courseCodes);
    const { found, missing } = await ctx.source.getCourses(term, args.courseCodes);
    const profile: StudentProfile = args.profile;
    const results = [...found.values()].map((c) => checkEligibility(c, profile));
    const parts = results.map(eligibilityText);
    if (missing.length) parts.push(`Not offered in term ${term} (or not found): ${missing.join(", ")}.`);
    const counts = Object.fromEntries(
      (["eligible", "needs_d_clearance", "blocked", "unknown"] as const).map((s) => [s, results.filter((r) => r.status === s).length]),
    );
    const header = `Term ${term}. ${Object.entries(counts).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(", ") || "No courses checked"}.`;
    return ok(clip(`${header}\n\n${parts.join("\n\n")}`, "Check fewer courses per call."), {
      termCode: term,
      results,
      notOffered: missing,
    });
  },
});

export const buildScheduleTool = def({
  name: "build_schedule",
  title: "Build conflict-free schedules",
  description: `Generate ranked, conflict-free section combinations for a term. Every mustHave course is included; each pickOneFrom list contributes exactly one course (e.g. several GE candidates); niceToHave courses are added when they fit (more is ranked higher).
Respects linked sections (one section of each type within one link group: lecture + lab/discussion/quiz), skips cancelled sections, and applies constraints: earliestStart/latestEnd, daysOff, maxUnits/minUnits, openSeatsOnly, dClearance policy (avoid by default), excluded or pinned section IDs.
Ranking (lower score is better): fewer classes before 10:00 or after 18:00, fewer idle gaps and campus days, open seats, no D-clearance. Quiz (exam) sections count for conflicts but not for comfort. Deterministic. If nothing fits, the result explains which course or pair of courses is the problem.
Run check_eligibility first; pass the same profile here to get each course's eligibility attached (courses are never dropped automatically).`,
  inputSchema: {
    termCode,
    mustHave: z.array(COURSE_CODE).max(8).default([]).describe("Courses that must be in every schedule."),
    niceToHave: z.array(COURSE_CODE).max(8).optional().describe("Courses to include when they fit."),
    pickOneFrom: z
      .array(z.array(COURSE_CODE).min(1).max(12))
      .max(4)
      .optional()
      .describe('Groups of alternatives; exactly one course from each group is used, e.g. [["AHIS 121", "HIST 107"]].'),
    constraints: z
      .object({
        earliestStart: TIME.optional().describe('No class before this time, e.g. "10:00".'),
        latestEnd: TIME.optional().describe('No class ending after this time, e.g. "18:00".'),
        daysOff: z.array(DAY).max(6).optional().describe('Days to keep free, e.g. ["Fri"].'),
        maxUnits: z.number().min(0).max(30).optional(),
        minUnits: z.number().min(0).max(30).optional(),
        openSeatsOnly: z.boolean().optional().describe("Only use sections with open seats right now."),
        dClearance: z
          .enum(["allow", "avoid", "exclude"])
          .optional()
          .describe("Sections that need D-clearance: avoid (default, ranked last), exclude, or allow."),
        excludeSectionIds: z.array(z.string().max(10)).max(50).optional(),
        pinnedSectionIds: z.array(z.string().max(10)).max(20).optional().describe("Section IDs that must be used (e.g. a preferred instructor)."),
      })
      .strict()
      .optional(),
    maxResults: z.number().int().min(1).max(10).default(5),
    profile: ProfileSchema.optional().describe("Optional: attach eligibility per course to the result."),
  },
  handler: async (args, ctx) => {
    const term = await resolveTerm(ctx, args.termCode);
    const mustHave = args.mustHave ?? [];
    const groups = args.pickOneFrom ?? [];
    const nice = args.niceToHave ?? [];
    const all = [...mustHave, ...groups.flat(), ...nice];
    if (!all.length) throw new SeatwiseInputError("Give at least one course in mustHave, pickOneFrom or niceToHave.");
    validateCodes(all);
    const { found, missing } = await ctx.source.getCourses(term, all);
    const result = buildSchedules([...found.values()], {
      mustHave,
      niceToHave: nice,
      pickOneFrom: groups,
      ...(args.constraints ? { constraints: args.constraints } : {}),
      maxResults: args.maxResults,
    });
    const eligibility = args.profile
      ? [...found.values()].map((c) => {
          const r = checkEligibility(c, args.profile as StudentProfile);
          return { courseKey: r.courseKey, status: r.status, summary: r.summary };
        })
      : null;
    let text = `Term ${term}. ${scheduleResultText(result)}`;
    if (missing.length) text = `Not offered in term ${term} (or not found): ${missing.join(", ")}.\n${text}`;
    if (eligibility) {
      text += `\n\nEligibility: ${eligibility.map((e) => `${e.courseKey} ${e.status}`).join(", ")}.`;
    }
    text += "\n\nSeat counts can change; confirm with check_seats before registering in WebReg.";
    return ok(clip(text, "Request fewer results (maxResults)."), {
      termCode: term,
      ...result,
      notOffered: missing,
      eligibility,
    });
  },
});

export const checkSeatsTool = def({
  name: "check_seats",
  title: "Check live seat counts",
  description:
    "Current seat counts (registered/total/open, full, cancelled, D-clearance) for specific sections, or for every section of a course when sectionIds is omitted. Data is at most ~60 seconds old from the public Schedule of Classes and can lag WebReg slightly. Use right before the student registers.",
  inputSchema: {
    termCode,
    sections: z
      .array(
        z
          .object({
            course: COURSE_CODE,
            sectionIds: z.array(z.string().min(1).max(10)).max(30).optional().describe('Section IDs, e.g. ["30009", "30268"].'),
          })
          .strict(),
      )
      .min(1)
      .max(15),
  },
  handler: async (args, ctx) => {
    const term = await resolveTerm(ctx, args.termCode);
    validateCodes(args.sections.map((s) => s.course));
    const reports = await checkSeats(ctx.source, term, args.sections);
    return ok(clip(`Term ${term}.\n\n${reports.map(seatReportText).join("\n\n")}`, "Ask for fewer sections."), {
      termCode: term,
      reports,
    });
  },
});

export const TOOLS = [
  listTerms,
  listDepartments,
  listGeCategories,
  searchCoursesTool,
  getCourseDetails,
  checkEligibilityTool,
  buildScheduleTool,
  checkSeatsTool,
] as unknown as ToolDef[];
