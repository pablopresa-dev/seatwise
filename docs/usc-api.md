# USC Schedule of Classes API notes

The public site https://classes.usc.edu is an Angular app backed by an **undocumented** JSON API on the
same origin (`https://classes.usc.edu/api/...`). It is not an official, supported API: it can change
without notice. Cache aggressively, send a descriptive User-Agent, and never poll it in tight loops.

The older documented service (`web-app.usc.edu/web/soc/api/...`) no longer responds (checked 2026-11-20).

Everything below marked **confirmed** was checked against live responses for Spring 2027 (20271) and/or
the site's own rendering code (lazy chunk `612.*.js`, pipes `courseRequisite` and the restriction
renderer) on 2026-11-20. Anything marked **inferred** or **unverified** is our best reading of the data.

## Term codes

`YYYYS`, where S = 1 spring, 2 summer, 3 fall. Spring 2027 = `20271`, Fall 2026 = `20263`.

## Endpoints used by Seatwise (all GET, public, JSON)

| Endpoint | Params | Notes |
| --- | --- | --- |
| `/api/Terms/Active` | none | **Confirmed.** Array of `{ termCode, season, year, status: "Active", ... }`. On 2026-11-20: 20271, 20263, 20262. |
| `/api/Schools/TermCode` | `termCode` | **Confirmed.** 26 schools `{ prefix: "ENGV", name, programs: [{ prefix: "CSCI", name }] }` (~40 KB). This is how a department prefix maps to the `school` param. A prefix can appear under two schools (e.g. ANAT). |
| `/api/Ge/TermCode` | `termCode` | **Confirmed.** `{ geGroups: [{ groupType: "BeforeFall2015" \| "Fall2015OrLater", requirements: [{ prefix: "ACORELIT", name, categories: [{ prefix: "ARTS", name }] }] }] }`. |
| `/api/Courses/CoursesByTermSchoolProgram` | `termCode`, `school`, `program` | **Confirmed.** `school` is required: without it `courses` is `null`. |
| `/api/Courses/GeCoursesByTerm` | `termCode`, `geRequirementPrefix`, `categoryPrefix` | **Confirmed**, e.g. `ACORELIT` + `ARTS` (43 courses), `AGLOPERS` + `GPH` (36). |
| `/api/Search/Basic` | `termCode`, `searchTerm` | **Confirmed.** `{ courseCount, searchQuery, courses, programs }`; courses include full sections. Matches titles ("machine learning" gives 25) and codes ("CSCI 270" gives 1). No-hit search: `courseCount: 0, courses: []`. |
| `/api/Courses/Course` | `termCode`, `courseCode` | **Confirmed.** `courseCode` must be hyphenated without suffix letters: `CSCI-270` works, `CSCI-102L` gives **204 No Content**, `CSCI 102` (space) gives **500**. Sequence letters are kept (`CSCI-491B` works). Unknown course or unknown term: 204 with an empty body. |

Avoid `/api/Pe/SchoolsAll`: it returned about 10 MB of unrelated course descriptions. `/api/Pe/GeCodes` returns only
code values (`"02"`..`"37"`) with no names.

Response headers include `cacheControlHeader: max-age=604600` and Cloudflare (`cf-cache-status: DYNAMIC`).

Other endpoints exist in the bundle (`/api/Search/Autocomplete?termCode`, `/api/Programs/Prefix`,
`/api/Programs/GeCategoryDetails`, `/api/Ge/GeProgramDetails`, `/api/Pe/*`, admin endpoints). Seatwise does not use them.

## Course fields

`courseId, fullCourseName ("CSCI 102"), name (title), description, courseUnits ([4] or [1..12] for variable),
maxUnits, prefix, classNumber, sequence ("B" in CSCI 491B), suffix ("L", "x", "gp", ...),
prerequisiteCourseCodes, corequisiteCourseCodes, concurrentCourses, recommendedPrep (free text),
duplicateCredit (free text, e.g. "former CSCI 303"), majorRestrictions, schoolRestrictions,
courseRestrictions, geCode, courseNotes, termNotes, isCrossListed, scheduledCourseCode,
publishedCourseCode, matchedCourseCode, sectionSeatCount, remainingSectionSeats, sections[]`

- **Cross-listing (confirmed):** `matchedCourseCode` is the code you asked for; `scheduledCourseCode` is the
  code the sections are scheduled under (CSCI 368 is scheduled as TAC 368). Section IDs are shared across
  the cross-listed codes (inferred from identical sections).
- **geCode (confirmed quirk):** it reflects the GE category of the *query*, not the course. AHIS 121 has
  `geCode "30"` in the ARTS listing and `"37"` in the GPH listing; outside GE listings it is `null`.
  So a course's GE categories are only known from the GE listings.
- `sectionSeatCount` / `remainingSectionSeats` are course-level totals over seat-bearing sections
  (CSCI 270: 160 / 41, the same as its lecture).

## Prerequisites and corequisites (confirmed)

Shape: an array of groups `{ order, requiredCourses, courseOptions: [{ prefix, number, theRest, courseSpace, ands: [...] }] }`.

The site's `courseRequisite` pipe renders them as follows, and Seatwise evaluates them the same way:

- Groups are **ANDed** (joined with " and ").
- Inside a group, at least `requiredCourses` of the `courseOptions` are needed: "N from (A or B or C)".
  When `requiredCourses` equals the number of options it is all of them (CSCI 401: `2 of [CSCI 270, CSCI 310]`).
- An option with non-empty `ands` means (option AND each `ands` course):
  CSCI 420 = `CSCI 104 and (MATH 225 or (EE 141 and MATH 126) or (EE 141 and MATH 127) or (EE 141 and MATH 129))`.
- `order` is ignored by the renderer (values 1 and 2 seen). Its meaning is **unverified**.

Examples: CSCI 270 = `(CSCI 104 or CSCI 114) and CSCI 170`; CSCI 104 = `CSCI 103 and CSCI 170`.
Corequisites use the same shape (CSCI 559: `EE 503 and EE 510`; BUAD 311: `1 of BUAD 310/312, EE 364, MATH 407`).
Whether a previously completed course satisfies a corequisite is **unverified** (USC usually allows it).

`concurrentCourses` has been an empty array in every response seen; its shape is **unknown**.
Non-course prerequisites (exams, AP credit) only appear in free-text section notes, e.g.
"Students must complete CSCI 102, or pass its challenge exam, or have AP Computer Science A credit".

## Restrictions (confirmed)

Each of `courseRestrictions` (class level), `majorRestrictions`, `schoolRestrictions` is an array of
`{ groupCode, groupDescription, restrictionCode: "I" | "E", restriction: "Inclusive" | "Exclusive" }`.
The site renders `Exclusive` as "This course is **closed to** the following ..." and `Inclusive` as
"This course is **open to** the following ...".

- Class-level codes seen: `U1` Freshman, `U2` Sophomore, `U3` Junior, `U4` Senior, `U5` Senior (Fifth Year),
  `M` Master Student, `D` Doctoral Student. CSCI 420 is closed to U1/U2; CSCI 445 is open only to U3/U4.
- Major codes are USC internal codes (`CSCI` Computer Science, `CECS`, `CSBA`, `CSGA`, `BUAD`, `ACCT`, ...).
  CSCI 113 is closed to CS majors; BUAD 102 is open only to 18 business majors; BUAD 200 is closed to them.
- No course seen so far had `schoolRestrictions`, so the school `groupCode` format is **unverified**.
- No course mixed Inclusive and Exclusive entries in one list.
- Visiting/exchange-student coding (which major/school code they carry) is **not published**.

## Sections

`sisSectionId ("29908"), linkCode, rnrMode ("Lecture", "Lab", "Discussion", "Quiz", "Lecture/Lab",
"Lecture/Discussion"), rnrModeCode (C, L, D, Q, CL, ...), schedule[] ({ dayCode "MW" | "TH" | "H", days
["Mon","Wed"], startTime "14:00", endTime "14:50" }), totalSeats, registeredSeats, waitlistedSeats (always
null so far), isFull, isCancelled, hasDClearance, instructors[] ({ firstName, lastName }), units (["4.0"] on
the lecture, ["0.0"] on labs/discussions/quizzes), session.rnrSessionCode ("001" regular, "014"/"034"/"048"
Viterbi DEN/online, "060", ...), syllabus URL, name/description/notes (free text)`

- `dayCode` uses USC letters (`T` Tuesday, `H` Thursday, `TH` Tue+Thu); `days` spells them out.
- TBA meetings: `{ dayCode: null, days: [], startTime: "TBA", endTime: "TBA" }`.
- No room/location field is exposed.
- `hasDClearance` marks sections that need departmental clearance. All DEN (`linkCode "D"`, session 014/034)
  sections seen have it; all BUAD 102 sections have it.
- Quiz sections are exam slots (e.g. CSCI 270 Fri 18:00-19:50); their registered count equals the lecture's.
- Cancelled sections are still returned with `isCancelled: true` (THTR 205 section 62617, THTR 229).

### linkCode (inferred, not used by the site's UI)

The frontend never reads `linkCode`; the rule below is inferred from the data plus section notes such as
"Register for lecture & one lab", "Register for 1 lec & 1 disc & quiz".

- Sections sharing a linkCode form a registration package: **one section of each type in that group**
  (CSCI 102 group A: 1 of 2 lectures + 1 of 6 labs + the quiz).
- Different letters are alternative packages (CSCI 570 groups B, C, D each have lecture + discussion + quiz;
  `D` is the DEN/online offering). Packages are never mixed.
- `null` linkCode shows up in three shapes:
  1. A complete package of its own (CSCI 450: null lecture+discussion+quiz beside group D; BUAD 307
     "Lecture/Discussion" sections). Treated as its own group.
  2. An unlinked lecture with linked discussions (COLT 102: lecture `null`, discussions `T`). Seatwise pairs the
     lecture with group T and flags the pairing as inferred.
  3. An orphan discussion (CLAS 101 and HIST 107 each have one `null` discussion beside a lettered group). Seatwise
     offers it as an alternative inside the lettered group and flags it as inferred.
- Finer pairing rules that exist only in notes (BUAD 307: "Register for 1 lec & 1 lab listed immediately following
  that lec") are **not** captured.
