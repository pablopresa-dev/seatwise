import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCourse } from "../src/normalize.js";
import type { RawCourse } from "../src/raw.js";
import type { Course, Day } from "../src/types.js";

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export function fixtureText(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

export function fixtureJson<T = unknown>(name: string): T {
  return JSON.parse(fixtureText(name)) as T;
}

/** Normalized courses from a saved list response (program/search/GE). */
export function fixtureCourses(name: string, geCategory?: string): Course[] {
  const raw = fixtureJson<{ courses: RawCourse[] }>(name);
  return raw.courses.map((c) => normalizeCourse(c, "20271", geCategory ? { geCategory } : {}));
}

let cache: Map<string, Course> | null = null;

/** Every fixture course, keyed by course key ("CSCI 270"). */
export function allCourses(): Map<string, Course> {
  if (cache) return cache;
  cache = new Map();
  const lists: [string, string?][] = [
    ["program-csci-20271.json"],
    ["program-buad-20271.json"],
    ["ge-arts-20271.json", "ARTS"],
    ["ge-gph-20271.json", "GPH"],
  ];
  for (const [file, ge] of lists) {
    for (const c of fixtureCourses(file, ge)) if (!cache.has(c.code.key)) cache.set(c.code.key, c);
  }
  return cache;
}

export function course(key: string): Course {
  const c = allCourses().get(key);
  if (!c) throw new Error(`fixture course ${key} missing`);
  return c;
}

/**
 * Fake fetch that maps classes.usc.edu URLs to fixture files. Unknown course lookups return 204,
 * like the real API. Records every request for assertions.
 */
export function fixtureFetch(routes: Record<string, string>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url, headers });
    const u = new URL(url);
    const key = `${u.pathname}?${[...u.searchParams.entries()].map(([k, v]) => `${k}=${v}`).join("&")}`;
    const file = routes[key];
    if (!file) return new Response(null, { status: 204 });
    if (file.startsWith("status:")) return new Response("error", { status: Number(file.slice(7)) });
    return new Response(fixtureText(file), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetch: impl, calls };
}

export const STANDARD_ROUTES: Record<string, string> = {
  "/api/Terms/Active?": "terms-active.json",
  "/api/Schools/TermCode?termCode=20271": "schools-20271.json",
  "/api/Ge/TermCode?termCode=20271": "ge-requirements-20271.json",
  "/api/Courses/CoursesByTermSchoolProgram?termCode=20271&school=ENGV&program=CSCI": "program-csci-20271.json",
  "/api/Courses/GeCoursesByTerm?termCode=20271&geRequirementPrefix=ACORELIT&categoryPrefix=ARTS": "ge-arts-20271.json",
  "/api/Courses/GeCoursesByTerm?termCode=20271&geRequirementPrefix=AGLOPERS&categoryPrefix=GPH": "ge-gph-20271.json",
  "/api/Search/Basic?termCode=20271&searchTerm=machine learning": "search-machine-learning-20271.json",
  "/api/Courses/Course?termCode=20271&courseCode=CSCI-270": "course-csci-270-20271.json",
};

export interface SynthSection {
  id: string;
  type?: string;
  link?: string | null;
  days?: Day[];
  start?: string;
  end?: string;
  seats?: [registered: number, total: number];
  dClearance?: boolean;
  cancelled?: boolean;
  units?: number;
}

/** Build a small course by hand (for conflict/constraint edge cases). */
export function synthetic(key: string, sections: SynthSection[], units = 4): Course {
  const [prefix, number] = key.split(" ") as [string, string];
  const raw: RawCourse = {
    fullCourseName: key,
    prefix,
    classNumber: number,
    name: `${key} synthetic`,
    courseUnits: [units],
    sections: sections.map((s) => ({
      sisSectionId: s.id,
      linkCode: s.link === undefined ? "A" : s.link,
      rnrMode: s.type ?? "Lecture",
      schedule: s.days
        ? [{ days: s.days, startTime: s.start ?? "TBA", endTime: s.end ?? "TBA" }]
        : [{ days: [], startTime: "TBA", endTime: "TBA" }],
      registeredSeats: s.seats?.[0] ?? 0,
      totalSeats: s.seats?.[1] ?? 50,
      hasDClearance: s.dClearance ?? false,
      isCancelled: s.cancelled ?? false,
      isFull: s.seats ? s.seats[0] >= s.seats[1] : false,
      units: [String(s.units ?? ((s.type ?? "Lecture") === "Lecture" ? units : 0))],
    })),
  };
  return normalizeCourse(raw, "20271");
}
