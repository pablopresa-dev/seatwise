import type { CourseCode } from "./types.js";

const CODE_RE = /^\s*([A-Za-z]{2,5})[\s\-_]*(\d{3})\s*([A-Za-z]*)\s*$/;

/** Letters that USC uses as sequence identifiers (part of the course identity, e.g. 491B). */
const SEQUENCE_LETTERS = new Set(["A", "B", "C", "D", "E", "F", "Z"]);

/**
 * Parse a course code such as "CSCI 102", "csci-102L", "CSCI102", "MATH 505B", "AHIS 121gp".
 *
 * Trailing letters are ambiguous in USC codes: some are sequence letters that are part of the
 * identity ("491B"), others are descriptive suffixes ("L" lab, "g" GE, "w" writing, "x"). The
 * heuristic: a first trailing letter in A-F/Z is a sequence letter, anything else is a suffix
 * and is dropped. Returns null when the input does not look like a course code.
 */
export function parseCourseCode(input: string): CourseCode | null {
  const m = CODE_RE.exec(input);
  if (!m) return null;
  const prefix = m[1]!.toUpperCase();
  const number = m[2]!;
  const letters = m[3] ?? "";
  const first = letters.charAt(0).toUpperCase();
  const sequence = first && SEQUENCE_LETTERS.has(first) ? first : null;
  return makeCode(prefix, number, sequence);
}

export function makeCode(prefix: string, number: string, sequence: string | null): CourseCode {
  const seq = sequence ? sequence.toUpperCase() : null;
  return { prefix, number, sequence: seq, key: `${prefix} ${number}${seq ?? ""}` };
}

/** Same as parseCourseCode but throws a descriptive error. */
export function requireCourseCode(input: string): CourseCode {
  const code = parseCourseCode(input);
  if (!code) {
    throw new InvalidCourseCodeError(input);
  }
  return code;
}

export class InvalidCourseCodeError extends Error {
  constructor(public readonly input: string) {
    super(
      `"${input}" is not a valid USC course code. Use PREFIX NUMBER, e.g. "CSCI 270", "WRIT 150", "MATH 226".`,
    );
    this.name = "InvalidCourseCodeError";
  }
}

/** Hyphenated form used by the API, e.g. "CSCI-270", "CSCI-491B". */
export function toApiCode(code: CourseCode, withSequence = true): string {
  return `${code.prefix}-${code.number}${withSequence && code.sequence ? code.sequence : ""}`;
}

/**
 * Does `have` count as `need`? Same prefix and number; when `need` has a sequence letter,
 * `have` must carry the same one. A completed "CSCI 102L" satisfies a requirement of "CSCI 102".
 */
export function codeSatisfies(have: CourseCode, need: CourseCode): boolean {
  if (have.prefix !== need.prefix || have.number !== need.number) return false;
  if (need.sequence) return have.sequence === need.sequence;
  return true;
}

/** Parse a list of user-supplied codes, separating out anything unparseable. */
export function parseCodeList(inputs: readonly string[]): { codes: CourseCode[]; invalid: string[] } {
  const codes: CourseCode[] = [];
  const invalid: string[] = [];
  for (const raw of inputs) {
    const c = parseCourseCode(raw);
    if (c) codes.push(c);
    else invalid.push(raw);
  }
  return { codes, invalid };
}
