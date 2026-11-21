import type { CourseDataSource } from "./client.js";
import { parseCourseCode } from "./codes.js";
import type { Course, SeatStatus } from "./types.js";

export interface SeatQuery {
  /** Course code, e.g. "CSCI 270". */
  course: string;
  /** Section IDs to report; omit for every section of the course. */
  sectionIds?: string[];
}

export interface SectionSeatReport extends SeatStatus {
  type: string;
  linkCode: string | null;
  requiresDClearance: boolean;
}

export interface SeatReport {
  courseKey: string;
  title: string | null;
  found: boolean;
  fetchedAt: string | null;
  sections: SectionSeatReport[];
  /** Requested section IDs that do not belong to this course in this term. */
  missingSectionIds: string[];
  counts: { open: number; full: number; cancelled: number };
}

/** Seat report for one course (pure; no network). */
export function seatReport(course: Course, sectionIds?: readonly string[]): SeatReport {
  const wanted = sectionIds?.length ? new Set(sectionIds.map((s) => s.trim())) : null;
  const sections = course.sections
    .filter((s) => !wanted || wanted.has(s.id))
    .map((s) => ({ ...s.seats, type: s.type, linkCode: s.linkCode, requiresDClearance: s.requiresDClearance }));
  const present = new Set(course.sections.map((s) => s.id));
  return {
    courseKey: course.code.key,
    title: course.title,
    found: true,
    fetchedAt: course.fetchedAt ?? null,
    sections,
    missingSectionIds: wanted ? [...wanted].filter((id) => !present.has(id)) : [],
    counts: {
      open: sections.filter((s) => s.state === "open").length,
      full: sections.filter((s) => s.state === "full").length,
      cancelled: sections.filter((s) => s.state === "cancelled").length,
    },
  };
}

/** Fetch current seat counts (short cache TTL) for the requested courses/sections. */
export async function checkSeats(
  source: CourseDataSource,
  termCode: string,
  queries: readonly SeatQuery[],
): Promise<SeatReport[]> {
  const { found } = await source.getCourses(
    termCode,
    queries.map((q) => q.course),
  );
  return queries.map((q) => {
    const key = parseCourseCode(q.course)?.key ?? q.course;
    const course = found.get(key);
    if (!course) {
      return {
        courseKey: key,
        title: null,
        found: false,
        fetchedAt: null,
        sections: [],
        missingSectionIds: q.sectionIds ?? [],
        counts: { open: 0, full: 0, cancelled: 0 },
      };
    }
    return seatReport(course, q.sectionIds);
  });
}
