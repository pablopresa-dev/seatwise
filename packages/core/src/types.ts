/**
 * Normalized Seatwise domain model. These types are deliberately decoupled from the raw
 * classes.usc.edu API shapes (see `raw.ts`), so the API can change without rippling through
 * eligibility, scheduling, and the MCP layer.
 */

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const DAYS: readonly Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface Term {
  /** USC term code `YYYYS` (S: 1 spring, 2 summer, 3 fall), e.g. "20271". */
  code: string;
  year: number;
  season: "Spring" | "Summer" | "Fall" | string;
  /** Human label, e.g. "Spring 2027". */
  label: string;
}

/** A parsed course code. `key` is the canonical comparison key, e.g. "CSCI 491B". */
export interface CourseCode {
  prefix: string;
  /** Numeric part, e.g. "102". */
  number: string;
  /** Sequence letter that is part of the identity (e.g. "B" in CSCI 491B), if any. */
  sequence: string | null;
  /** Canonical key: PREFIX NUMBER[SEQUENCE], e.g. "CSCI 102", "CSCI 491B". */
  key: string;
}

export interface Meeting {
  days: Day[];
  /** Minutes after midnight, or null when TBA. */
  start: number | null;
  end: number | null;
  /** "HH:MM" 24h, or null when TBA. */
  startTime: string | null;
  endTime: string | null;
  tba: boolean;
}

export type SeatState = "open" | "full" | "cancelled";

export interface SeatStatus {
  sectionId: string;
  total: number;
  registered: number;
  /** total - registered, floored at 0. */
  available: number;
  /** The public API currently always returns null here. */
  waitlisted: number | null;
  isFull: boolean;
  isCancelled: boolean;
  state: SeatState;
}

export interface Section {
  id: string;
  courseKey: string;
  /** Section type as published, e.g. "Lecture", "Lab", "Discussion", "Quiz", "Lecture/Lab". */
  type: string;
  typeCode: string | null;
  /**
   * Link group. Sections of one course that share a linkCode form a registration package:
   * one section of each type in the group (see docs/usc-api.md). null = not published.
   */
  linkCode: string | null;
  sessionCode: string | null;
  /** Units carried by this section (lecture usually carries them; labs/quizzes often "0.0"). */
  units: number[];
  meetings: Meeting[];
  instructors: string[];
  seats: SeatStatus;
  requiresDClearance: boolean;
  isCancelled: boolean;
  notes: string | null;
  syllabusUrl: string | null;
}

/** A requisite expression (prerequisite or corequisite). */
export type Requisite =
  | { kind: "course"; code: CourseCode }
  | { kind: "all"; items: Requisite[] }
  /** Satisfied when at least `count` of `items` are satisfied ("1 from (A or B)"). */
  | { kind: "choose"; count: number; items: Requisite[] }
  /** A requisite entry that could not be parsed into a course code (kept for honesty). */
  | { kind: "unparsed"; text: string };

export type RestrictionKind = "class_level" | "major" | "school";

export interface RestrictionGroup {
  code: string;
  description: string | null;
}

export interface Restriction {
  kind: RestrictionKind;
  /** "open_only_to" = Inclusive ("This course is open to..."), "closed_to" = Exclusive. */
  mode: "open_only_to" | "closed_to" | "unknown";
  groups: RestrictionGroup[];
}

export interface SeatSummary {
  /** Course-level counts as published by the API (sum over seat-bearing sections). */
  total: number | null;
  remaining: number | null;
}

export interface Course {
  termCode: string;
  code: CourseCode;
  /** Display code including published suffix letters, e.g. "CSCI 102L". */
  displayCode: string;
  title: string;
  description: string | null;
  /** Possible unit values, e.g. [4] or [1,2,3,4]. */
  units: number[];
  prerequisites: Requisite | null;
  corequisites: Requisite | null;
  /** Human text as published (rendered like classes.usc.edu does). */
  prerequisiteText: string | null;
  corequisiteText: string | null;
  /** Concurrent-enrollment data; the API has only returned empty arrays so far (unverified shape). */
  concurrentRaw: unknown[];
  recommendedPrep: string | null;
  duplicateCredit: string | null;
  restrictions: Restriction[];
  /** GE category prefixes known for this course (only populated from GE listings). */
  geCategories: string[];
  isCrossListed: boolean;
  /** Code under which the sections are actually scheduled when cross-listed, e.g. "TAC 368". */
  scheduledAs: string | null;
  notes: string | null;
  seatSummary: SeatSummary;
  sections: Section[];
  /** ISO timestamp of when this data was fetched from classes.usc.edu (set by the client). */
  fetchedAt?: string;
}

export interface School {
  code: string;
  name: string;
  programs: { prefix: string; name: string }[];
}

export interface GeCategory {
  prefix: string;
  name: string;
  requirementPrefix: string;
  requirementName: string;
  /** e.g. "Fall2015OrLater" or "BeforeFall2015". */
  groupType: string;
}

export type ClassStanding =
  | "freshman"
  | "sophomore"
  | "junior"
  | "senior"
  | "fifth_year_senior"
  | "masters"
  | "doctoral";

export interface StudentProfile {
  /** Majors as USC codes (e.g. "CSCI") or names ("Computer Science"). */
  majors?: string[];
  /** School code (e.g. "ENGV") or name ("Viterbi School of Engineering"). */
  school?: string;
  classStanding?: ClassStanding;
  /** Completed (or transferred/AP) courses as USC codes, e.g. ["CSCI 103", "MATH 125"]. */
  completedCourses: string[];
  /** Courses the student plans to take in the same term (satisfy corequisites). */
  plannedCourses?: string[];
  isVisitingOrExchange?: boolean;
}
