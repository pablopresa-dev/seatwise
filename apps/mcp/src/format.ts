import {
  linkGroups,
  type Course,
  type EligibilityResult,
  type Meeting,
  type Restriction,
  type Schedule,
  type ScheduleResult,
  type SeatReport,
  type Section,
} from "@seatwise/core";

export const CHARACTER_LIMIT = 25_000;

export function meetingText(m: Meeting): string {
  if (m.tba) return "TBA";
  return `${m.days.join("/")} ${m.startTime}-${m.endTime}`;
}

export function meetingsText(ms: readonly Meeting[]): string {
  return ms.length ? ms.map(meetingText).join("; ") : "TBA";
}

export function unitsText(units: readonly number[]): string {
  if (!units.length) return "? units";
  if (units.length === 1) return `${units[0]} units`;
  return `${Math.min(...units)}-${Math.max(...units)} units`;
}

export function restrictionText(r: Restriction): string {
  const noun = r.kind === "class_level" ? "class levels" : r.kind === "major" ? "majors" : "schools";
  const groups = r.groups.map((g) => g.description ?? g.code);
  const shown = groups.length > 6 ? `${groups.slice(0, 6).join(", ")} +${groups.length - 6} more` : groups.join(", ");
  const verb = r.mode === "open_only_to" ? "Open only to" : r.mode === "closed_to" ? "Closed to" : "Restricted (unrecognized) for";
  return `${verb} ${noun}: ${shown}`;
}

function seatText(s: Section): string {
  const st = s.seats;
  if (st.state === "cancelled") return "CANCELLED";
  const base = `${st.registered}/${st.total} registered`;
  return st.state === "full" ? `${base} FULL` : `${base}, ${st.available} open`;
}

/** Compact one-course summary used by search results. */
export function courseSummary(c: Course) {
  const active = c.sections.filter((s) => !s.isCancelled);
  const lectures = active.filter((s) => /lec/i.test(s.type));
  const primary = lectures.length ? lectures : active;
  const dCount = active.filter((s) => s.requiresDClearance).length;
  return {
    code: c.code.key,
    displayCode: c.displayCode,
    title: c.title,
    units: c.units,
    geCategories: c.geCategories,
    prerequisites: c.prerequisiteText,
    corequisites: c.corequisiteText,
    restrictions: c.restrictions.map(restrictionText),
    activeSections: active.length,
    cancelledSections: c.sections.length - active.length,
    dClearanceSections: dCount,
    seatsRemaining: c.seatSummary.remaining,
    seatsTotal: c.seatSummary.total,
    lectureTimes: [...new Set(primary.map((s) => meetingsText(s.meetings)))].slice(0, 6),
    instructors: [...new Set(primary.flatMap((s) => s.instructors))].slice(0, 6),
    description: c.description && c.description.length > 280 ? `${c.description.slice(0, 277)}...` : c.description,
  };
}

export type CourseSummary = ReturnType<typeof courseSummary>;

export function courseSummaryText(s: CourseSummary): string {
  const lines = [`### ${s.displayCode}: ${s.title} (${unitsText(s.units)})`];
  const facts: string[] = [];
  if (s.geCategories.length) facts.push(`GE: ${s.geCategories.join(", ")}`);
  if (s.seatsRemaining !== null && s.seatsTotal !== null) facts.push(`seats: ${s.seatsRemaining} of ${s.seatsTotal} open`);
  facts.push(`${s.activeSections} active sections${s.dClearanceSections ? ` (${s.dClearanceSections} need D-clearance)` : ""}`);
  lines.push(`- ${facts.join(" | ")}`);
  if (s.lectureTimes.length) lines.push(`- Times: ${s.lectureTimes.join(" | ")}${s.instructors.length ? ` (${s.instructors.join(", ")})` : ""}`);
  if (s.prerequisites) lines.push(`- Prerequisites: ${s.prerequisites}`);
  if (s.corequisites) lines.push(`- Corequisites: ${s.corequisites}`);
  for (const r of s.restrictions) lines.push(`- ${r}`);
  if (s.description) lines.push(`- ${s.description}`);
  return lines.join("\n");
}

/** Full detail, grouped into registration packages (link groups) so the rule is explicit. */
export function courseDetail(c: Course) {
  const sectionOut = (s: Section) => ({
    id: s.id,
    type: s.type,
    linkCode: s.linkCode,
    session: s.sessionCode,
    units: s.units,
    meetings: s.meetings.map(meetingText),
    instructors: s.instructors,
    seats: s.seats,
    requiresDClearance: s.requiresDClearance,
    cancelled: s.isCancelled,
    notes: s.notes,
  });
  return {
    code: c.code.key,
    displayCode: c.displayCode,
    termCode: c.termCode,
    title: c.title,
    description: c.description,
    units: c.units,
    prerequisites: c.prerequisiteText,
    corequisites: c.corequisiteText,
    recommendedPrep: c.recommendedPrep,
    duplicateCredit: c.duplicateCredit,
    restrictions: c.restrictions.map(restrictionText),
    geCategories: c.geCategories,
    crossListed: c.isCrossListed ? { scheduledAs: c.scheduledAs } : null,
    notes: c.notes,
    seats: c.seatSummary,
    fetchedAt: c.fetchedAt ?? null,
    linkGroups: linkGroups(c).map((g) => ({
      group: g.key,
      requiredTypes: g.types,
      /** True when unlinked sections were paired into this group by inference. */
      inferredPairing: g.inferredIds.size > 0,
      sections: g.sections.map(sectionOut),
    })),
  };
}

export function courseDetailText(c: Course): string {
  const d = courseDetail(c);
  const out = [`## ${d.displayCode}: ${d.title} (${unitsText(d.units)}), term ${d.termCode}`];
  if (d.description) out.push(d.description);
  if (d.prerequisites) out.push(`**Prerequisites:** ${d.prerequisites}`);
  if (d.corequisites) out.push(`**Corequisites:** ${d.corequisites}`);
  if (d.recommendedPrep) out.push(`**Recommended preparation:** ${d.recommendedPrep}`);
  if (d.duplicateCredit) out.push(`**Duplicates credit with:** ${d.duplicateCredit}`);
  for (const r of d.restrictions) out.push(`**Restriction:** ${r}`);
  if (d.geCategories.length) out.push(`**GE:** ${d.geCategories.join(", ")}`);
  if (d.crossListed?.scheduledAs) out.push(`**Cross-listed;** sections are scheduled as ${d.crossListed.scheduledAs}.`);
  if (d.notes) out.push(`**Notes:** ${d.notes}`);
  out.push(
    `**Registration:** pick ONE group below and register for one section of each listed type in it (${d.linkGroups.length} group${d.linkGroups.length === 1 ? "" : "s"}).`,
  );
  const sectionsBy = new Map(c.sections.map((s) => [s.id, s]));
  for (const g of d.linkGroups) {
    out.push(
      `\n**Group ${g.group}** (one each of: ${g.requiredTypes.join(", ")})${g.inferredPairing ? ": pairing inferred because some sections have no published link code; confirm in WebReg" : ""}`,
    );
    for (const s of g.sections) {
      const sec = sectionsBy.get(s.id)!;
      const flags = [s.requiresDClearance ? "D-clearance" : "", s.session && s.session !== "001" ? `session ${s.session}` : ""].filter(Boolean);
      out.push(
        `- ${s.id} ${s.type}: ${s.meetings.join("; ") || "TBA"} | ${seatText(sec)}${s.instructors.length ? ` | ${s.instructors.join(", ")}` : ""}${flags.length ? ` | ${flags.join(", ")}` : ""}${s.notes ? ` | note: ${s.notes}` : ""}`,
      );
    }
  }
  if (d.fetchedAt) out.push(`\n_Seats as of ${d.fetchedAt} (public Schedule of Classes; WebReg may differ)._`);
  return out.join("\n");
}

export function eligibilityText(r: EligibilityResult): string {
  const lines = [`### ${r.courseKey} (${r.title}): **${r.status}**`, r.summary];
  for (const rule of r.rules) {
    lines.push(`- [${rule.outcome}] ${rule.rule}: ${rule.message}`);
  }
  return lines.join("\n");
}

export function scheduleText(s: Schedule): string {
  const m = s.metrics;
  const lines = [
    `### Option ${s.rank}: ${s.totalUnits} units, score ${s.score}`,
    `Days: ${m.daysOnCampus.join(", ") || "none"} | ${m.earliestStart ?? "?"}-${m.latestEnd ?? "?"} | gaps ${m.gapMinutes} min`,
  ];
  for (const c of s.courses) {
    lines.push(`- **${c.displayCode}** ${c.title} (${c.units}u${c.role !== "must_have" ? `, ${c.role.replace(/_/g, " ")}` : ""})`);
    for (const sec of c.sections) {
      const seat = sec.seats.state === "open" ? `${sec.seats.available} open` : sec.seats.state.toUpperCase();
      lines.push(
        `  - ${sec.id} ${sec.type}: ${meetingsText(sec.meetings)} | ${seat}${sec.instructors.length ? ` | ${sec.instructors.join(", ")}` : ""}${sec.requiresDClearance ? " | D-clearance" : ""}`,
      );
    }
  }
  for (const w of s.warnings) lines.push(`- Warning: ${w}`);
  return lines.join("\n");
}

export function scheduleResultText(r: ScheduleResult): string {
  const out: string[] = [];
  if (r.schedules.length) out.push(`Found ${r.schedules.length} conflict-free schedule option(s), best first.`);
  else out.push("No conflict-free schedule found.");
  for (const n of r.notes) out.push(n);
  for (const d of r.diagnostics) if (d.message) out.push(`- ${d.courseKey}: ${d.message}`);
  for (const s of r.schedules) out.push("", scheduleText(s));
  return out.join("\n");
}

export function seatReportText(r: SeatReport): string {
  if (!r.found) return `### ${r.courseKey}: not offered in this term (or not found)`;
  const lines = [`### ${r.courseKey} (${r.title}): ${r.counts.open} open, ${r.counts.full} full, ${r.counts.cancelled} cancelled`];
  for (const s of r.sections) {
    const tail = s.state === "open" ? `${s.available} open` : s.state.toUpperCase();
    lines.push(`- ${s.sectionId} ${s.type}${s.linkCode ? ` [${s.linkCode}]` : ""}: ${s.registered}/${s.total} registered, ${tail}${s.requiresDClearance ? " | D-clearance" : ""}`);
  }
  if (r.missingSectionIds.length) lines.push(`- Not part of this course this term: ${r.missingSectionIds.join(", ")}`);
  if (r.fetchedAt) lines.push(`_As of ${r.fetchedAt}._`);
  return lines.join("\n");
}

/** Keep text output under the limit, telling the model how to get the rest. */
export function clip(text: string, hint: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return `${text.slice(0, CHARACTER_LIMIT)}\n\n[Truncated at ${CHARACTER_LIMIT} characters. ${hint}]`;
}
