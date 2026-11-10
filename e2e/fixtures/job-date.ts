import { addDays, todayInBusinessZone } from "../../lib/domain/time.ts";

/** Matches scripts/seed-e2e.ts job + availability dates. */
export const e2eJobDate = addDays(todayInBusinessZone(), 1);
