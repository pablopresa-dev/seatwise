import { TtlCache } from "./cache.js";
import { parseCourseCode, requireCourseCode, toApiCode } from "./codes.js";
import { SeatwiseInputError, UscApiError, assertTermCode } from "./errors.js";
import { normalizeCourse } from "./normalize.js";
import type { RawCourse, RawCourseList, RawGeResponse, RawSchool, RawSearchResponse, RawTerm } from "./raw.js";
import type { Course, CourseCode, GeCategory, School, Term } from "./types.js";

export const DEFAULT_BASE_URL = "https://classes.usc.edu";
export const DEFAULT_USER_AGENT = "Seatwise/0.1 (open-source course planner)";

export interface UscClientOptions {
  baseUrl?: string;
  userAgent?: string;
  /** Per-request timeout. Default 15s. */
  timeoutMs?: number;
  /** TTL for seat-bearing single-course lookups. Default 60s. */
  seatTtlMs?: number;
  /** TTL for course listings (search, department, GE). Default 5 min. */
  listTtlMs?: number;
  /** TTL for catalog metadata (terms, schools, GE structure). Default 12h. */
  catalogTtlMs?: number;
  /** Max parallel requests when fetching many courses. Default 3. */
  concurrency?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface CourseListResult {
  termCode: string;
  courses: Course[];
  fetchedAt: string;
}

export interface GetCoursesResult {
  found: Map<string, Course>;
  /** Input codes that do not exist in the term (or could not be parsed). */
  missing: string[];
}

/** The read operations Seatwise needs. Implemented by UscClient; easy to fake in tests. */
export interface CourseDataSource {
  getTerms(): Promise<Term[]>;
  getDefaultTermCode(): Promise<string>;
  getSchools(termCode: string): Promise<School[]>;
  getGeCategories(termCode: string): Promise<GeCategory[]>;
  searchCourses(termCode: string, query: string): Promise<CourseListResult>;
  getDepartmentCourses(termCode: string, prefix: string): Promise<CourseListResult>;
  getGeCourses(termCode: string, categoryPrefix: string): Promise<CourseListResult>;
  /** Single-course lookup (short TTL, used for seats). Returns null when not offered in that term. */
  getCourse(termCode: string, code: string | CourseCode): Promise<Course | null>;
  getCourses(termCode: string, codes: readonly string[]): Promise<GetCoursesResult>;
}

export class UscClient implements CourseDataSource {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly seatTtl: number;
  private readonly listTtl: number;
  private readonly catalogTtl: number;
  private readonly concurrency: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cache: TtlCache;

  constructor(opts: UscClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.seatTtl = opts.seatTtlMs ?? 60_000;
    this.listTtl = opts.listTtlMs ?? 5 * 60_000;
    this.catalogTtl = opts.catalogTtlMs ?? 12 * 60 * 60_000;
    this.concurrency = Math.max(1, opts.concurrency ?? 3);
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = opts.now ?? Date.now;
    this.cache = new TtlCache(500, this.now);
  }

  /** GET a JSON endpoint. Returns null for 204/empty bodies (the API's "not found"). */
  private async getJson<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
    const qs = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e?.name === "TimeoutError" || e?.name === "AbortError") {
        throw new UscApiError(
          "timeout",
          `classes.usc.edu did not answer within ${Math.round(this.timeoutMs / 1000)}s (${path}). It may be slow or down; try again shortly.`,
          url,
        );
      }
      throw new UscApiError("network", `Could not reach classes.usc.edu (${path}): ${e?.message ?? String(err)}`, url);
    }
    if (res.status === 204) return null;
    if (!res.ok) {
      throw new UscApiError(
        "http",
        `classes.usc.edu answered HTTP ${res.status} for ${path}. ${res.status >= 500 ? "The USC service may be having problems; try again later." : "The request was rejected; check the term code and course code."}`,
        url,
        res.status,
      );
    }
    const text = await res.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new UscApiError("parse", `classes.usc.edu returned a non-JSON response for ${path}.`, url, res.status);
    }
  }

  private stamp(): string {
    return new Date(this.now()).toISOString();
  }

  async getTerms(): Promise<Term[]> {
    return this.cache.getOrLoad("terms", this.catalogTtl, async () => {
      const raw = (await this.getJson<RawTerm[]>("/api/Terms/Active")) ?? [];
      return raw
        .filter((t) => t.termCode)
        .map((t): Term => {
          const code = String(t.termCode);
          const season = t.season ?? seasonFromCode(code);
          const year = t.year ?? Number(code.slice(0, 4));
          return { code, season, year, label: `${season} ${year}` };
        })
        .sort((a, b) => b.code.localeCompare(a.code));
    });
  }

  /** The newest active term (the one students are registering for). */
  async getDefaultTermCode(): Promise<string> {
    const terms = await this.getTerms();
    const first = terms[0];
    if (!first) throw new UscApiError("parse", "classes.usc.edu returned no active terms.", `${this.baseUrl}/api/Terms/Active`);
    return first.code;
  }

  async getSchools(termCode: string): Promise<School[]> {
    assertTermCode(termCode);
    return this.cache.getOrLoad(`schools:${termCode}`, this.catalogTtl, async () => {
      const raw = (await this.getJson<RawSchool[]>("/api/Schools/TermCode", { termCode })) ?? [];
      return raw
        .filter((s) => s.prefix)
        .map((s) => ({
          code: s.prefix!,
          name: s.name?.trim() ?? s.prefix!,
          programs: (s.programs ?? [])
            .filter((p) => p.prefix)
            .map((p) => ({ prefix: p.prefix!.toUpperCase(), name: p.name?.trim() ?? p.prefix! })),
        }));
    });
  }

  async getGeCategories(termCode: string): Promise<GeCategory[]> {
    assertTermCode(termCode);
    return this.cache.getOrLoad(`ge:${termCode}`, this.catalogTtl, async () => {
      const raw = await this.getJson<RawGeResponse>("/api/Ge/TermCode", { termCode });
      const out: GeCategory[] = [];
      for (const g of raw?.geGroups ?? []) {
        for (const r of g.requirements ?? []) {
          for (const c of r.categories ?? []) {
            if (!c.prefix || !r.prefix) continue;
            out.push({
              prefix: c.prefix.toUpperCase(),
              name: c.name?.trim() ?? c.prefix,
              requirementPrefix: r.prefix,
              requirementName: r.name?.trim() ?? r.prefix,
              groupType: g.groupType ?? "unknown",
            });
          }
        }
      }
      return out;
    });
  }

  async searchCourses(termCode: string, query: string): Promise<CourseListResult> {
    assertTermCode(termCode);
    const q = query.trim();
    if (q.length < 2) throw new SeatwiseInputError("Search text must be at least 2 characters.");
    return this.cache.getOrLoad(`search:${termCode}:${q.toLowerCase()}`, this.listTtl, async () => {
      const raw = await this.getJson<RawSearchResponse>("/api/Search/Basic", { termCode, searchTerm: q });
      return this.listResult(termCode, raw);
    });
  }

  async getDepartmentCourses(termCode: string, prefix: string): Promise<CourseListResult> {
    assertTermCode(termCode);
    const p = prefix.trim().toUpperCase();
    const schools = await this.getSchools(termCode);
    const school = schools.find((s) => s.programs.some((pr) => pr.prefix === p));
    if (!school) {
      const all = schools.flatMap((s) => s.programs.map((pr) => pr.prefix));
      const near = all.filter((x) => x.startsWith(p.slice(0, 2))).slice(0, 8);
      throw new SeatwiseInputError(
        `Department prefix "${p}" is not listed for term ${termCode}.${near.length ? ` Similar prefixes: ${near.join(", ")}.` : ""} Use list_departments to see valid prefixes.`,
      );
    }
    return this.cache.getOrLoad(`dept:${termCode}:${p}`, this.listTtl, async () => {
      const raw = await this.getJson<RawCourseList>("/api/Courses/CoursesByTermSchoolProgram", {
        termCode,
        school: school.code,
        program: p,
      });
      return this.listResult(termCode, raw);
    });
  }

  async getGeCourses(termCode: string, categoryPrefix: string): Promise<CourseListResult> {
    assertTermCode(termCode);
    const c = categoryPrefix.trim().toUpperCase();
    const cats = await this.getGeCategories(termCode);
    const cat = cats.find((x) => x.prefix === c);
    if (!cat) {
      throw new SeatwiseInputError(
        `GE category "${c}" is not defined for term ${termCode}. Valid categories: ${cats.map((x) => `${x.prefix} (${x.name})`).join(", ")}.`,
      );
    }
    return this.cache.getOrLoad(`gec:${termCode}:${c}`, this.listTtl, async () => {
      const raw = await this.getJson<RawCourseList>("/api/Courses/GeCoursesByTerm", {
        termCode,
        geRequirementPrefix: cat.requirementPrefix,
        categoryPrefix: cat.prefix,
      });
      return this.listResult(termCode, raw, cat.prefix);
    });
  }

  async getCourse(termCode: string, code: string | CourseCode): Promise<Course | null> {
    assertTermCode(termCode);
    const parsed = typeof code === "string" ? requireCourseCode(code) : code;
    return this.cache.getOrLoad(`course:${termCode}:${parsed.key}`, this.seatTtl, async () => {
      let raw = await this.getJson<RawCourse>("/api/Courses/Course", { termCode, courseCode: toApiCode(parsed) });
      // Trailing letters are ambiguous (sequence vs suffix); retry without the letter.
      if (!raw && parsed.sequence) {
        raw = await this.getJson<RawCourse>("/api/Courses/Course", {
          termCode,
          courseCode: toApiCode(parsed, false),
        });
      }
      if (!raw || !raw.fullCourseName) return null;
      const course = normalizeCourse(raw, termCode);
      course.fetchedAt = this.stamp();
      return course;
    });
  }

  async getCourses(termCode: string, codes: readonly string[]): Promise<GetCoursesResult> {
    const found = new Map<string, Course>();
    const missing: string[] = [];
    const unique: { input: string; code: CourseCode }[] = [];
    const seen = new Set<string>();
    for (const input of codes) {
      const c = parseCourseCode(input);
      if (!c) {
        missing.push(input);
        continue;
      }
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      unique.push({ input, code: c });
    }
    let next = 0;
    const worker = async () => {
      while (next < unique.length) {
        const item = unique[next++]!;
        const course = await this.getCourse(termCode, item.code);
        if (course) found.set(item.code.key, course);
        else missing.push(item.input);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, unique.length) }, worker));
    return { found, missing };
  }

  private listResult(termCode: string, raw: RawCourseList | null, geCategory?: string): CourseListResult {
    const opts = geCategory ? { geCategory } : {};
    const courses = (raw?.courses ?? []).map((c) => normalizeCourse(c, termCode, opts));
    const fetchedAt = this.stamp();
    for (const c of courses) {
      c.fetchedAt = fetchedAt;
      // Listings carry full section data: prime the single-course cache (short seat TTL) so a
      // follow-up eligibility/schedule call does not refetch every course it just listed.
      const key = `course:${termCode}:${c.code.key}`;
      if (this.cache.get(key) === undefined) this.cache.set(key, c, this.seatTtl);
    }
    return { termCode, courses, fetchedAt };
  }
}

function seasonFromCode(code: string): string {
  return code.endsWith("1") ? "Spring" : code.endsWith("2") ? "Summer" : code.endsWith("3") ? "Fall" : "Unknown";
}
