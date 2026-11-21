/**
 * Raw shapes returned by the undocumented classes.usc.edu JSON API (observed Nov 2026).
 * Every field is treated as optional/nullable because the API is not a supported contract.
 */

export interface RawCourseCode {
  prefix?: string | null;
  number?: string | null;
  suffix?: string | null;
  theRest?: string | null;
  courseHyphen?: string | null;
  courseSpace?: string | null;
  courseSmashed?: string | null;
  ands?: RawCourseCode[] | null;
}

export interface RawRequisiteGroup {
  order?: number | null;
  requiredCourses?: number | null;
  courseOptions?: RawCourseCode[] | null;
}

export interface RawRestriction {
  groupCode?: string | null;
  groupDescription?: string | null;
  restrictionCode?: string | null;
  restriction?: "Inclusive" | "Exclusive" | string | null;
}

export interface RawMeeting {
  dayCode?: string | null;
  days?: string[] | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface RawSection {
  sisSectionId?: string | null;
  linkCode?: string | null;
  hasDClearance?: boolean | null;
  name?: string | null;
  notes?: string | null;
  description?: string | null;
  schedule?: RawMeeting[] | null;
  totalSeats?: number | null;
  registeredSeats?: number | null;
  waitlistedSeats?: number | null;
  rnrMode?: string | null;
  rnrModeCode?: string | null;
  session?: { rnrSessionCode?: string | null } | null;
  units?: string[] | null;
  instructors?: { firstName?: string | null; lastName?: string | null }[] | null;
  syllabus?: string | null;
  isCancelled?: boolean | null;
  isFull?: boolean | null;
}

export interface RawCourse {
  courseId?: number | null;
  classNumber?: string | null;
  sequence?: string | null;
  suffix?: string | null;
  description?: string | null;
  fullCourseName?: string | null;
  isCrossListed?: boolean | null;
  maxUnits?: string | null;
  courseNotes?: string | null;
  termNotes?: string | null;
  duplicateCredit?: string | null;
  recommendedPrep?: string | null;
  geCode?: string | null;
  scheduledCourseCode?: RawCourseCode | null;
  publishedCourseCode?: RawCourseCode | null;
  matchedCourseCode?: RawCourseCode | null;
  courseUnits?: number[] | null;
  sections?: RawSection[] | null;
  prerequisiteCourseCodes?: RawRequisiteGroup[] | null;
  corequisiteCourseCodes?: RawRequisiteGroup[] | null;
  courseRestrictions?: RawRestriction[] | null;
  majorRestrictions?: RawRestriction[] | null;
  schoolRestrictions?: RawRestriction[] | null;
  concurrentCourses?: unknown[] | null;
  remainingSectionSeats?: number | null;
  sectionSeatCount?: number | null;
  termCode?: number | string | null;
  prefix?: string | null;
  name?: string | null;
}

export interface RawCourseList {
  termCode?: number | null;
  courses?: RawCourse[] | null;
}

export interface RawSearchResponse extends RawCourseList {
  courseCount?: number | null;
  searchQuery?: string | null;
}

export interface RawTerm {
  termCode?: number | null;
  season?: string | null;
  year?: number | null;
  status?: string | null;
}

export interface RawSchool {
  prefix?: string | null;
  name?: string | null;
  programs?: { prefix?: string | null; name?: string | null }[] | null;
}

export interface RawGeResponse {
  termCode?: number | null;
  geGroups?: {
    groupType?: string | null;
    requirements?: {
      name?: string | null;
      prefix?: string | null;
      categories?: { prefix?: string | null; name?: string | null }[] | null;
    }[] | null;
  }[] | null;
}
