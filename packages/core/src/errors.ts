export type UscApiErrorKind = "http" | "timeout" | "network" | "parse";

/** Raised when classes.usc.edu cannot be reached or answers with something unusable. */
export class UscApiError extends Error {
  constructor(
    public readonly kind: UscApiErrorKind,
    message: string,
    public readonly url: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UscApiError";
  }
}

/** Raised for bad user input that the caller can fix (unknown department, bad term, ...). */
export class SeatwiseInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeatwiseInputError";
  }
}

export function isValidTermCode(term: string): boolean {
  return /^\d{4}[123]$/.test(term);
}

export function assertTermCode(term: string): void {
  if (!isValidTermCode(term)) {
    throw new SeatwiseInputError(
      `"${term}" is not a valid USC term code. Use YYYYS where S is 1 (spring), 2 (summer) or 3 (fall), e.g. "20271" for Spring 2027.`,
    );
  }
}
