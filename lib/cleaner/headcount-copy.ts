/** Cleaner-facing copy when a visit needs more than one person on site. */
export function cleanerOtherCleanersNote(headcountNeeded: number): string | null {
  if (!Number.isInteger(headcountNeeded) || headcountNeeded <= 1) return null;
  const others = headcountNeeded - 1;
  const noun = others === 1 ? "cleaner" : "cleaners";
  return `You may be working with ~${others} other ${noun}.`;
}