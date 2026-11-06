import { assignmentToItem, availabilityToItem, submissionToItem, type DynamoItem } from "../data/items.ts";
import type { HubData } from "../mock/seed.ts";

export type AvailabilityWeekPersistPlan = {
  puts: DynamoItem[];
  deletes: Array<{ pk: string; sk: string }>;
};

function weekAvailability(hub: HubData, cleanerId: string, weekStart: string, weekEnd: string) {
  return hub.availability.filter(
    (window) => window.cleanerId === cleanerId && window.date >= weekStart && window.date <= weekEnd,
  );
}

function assignmentRecordEqual(before: HubData["assignments"][number], after: HubData["assignments"][number]): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}

function itemKey(item: { pk: string; sk: string }): string {
  return `${item.pk}|${item.sk}`;
}

export function dedupeAvailabilityWeekBatchPlan(plan: AvailabilityWeekPersistPlan): AvailabilityWeekPersistPlan {
  const putsByKey = new Map<string, DynamoItem>();
  for (const item of plan.puts) {
    putsByKey.set(itemKey(item), item);
  }
  const putKeys = new Set(putsByKey.keys());
  const deletesByKey = new Map<string, { pk: string; sk: string }>();
  for (const key of plan.deletes) {
    const id = itemKey(key);
    if (putKeys.has(id)) continue;
    deletesByKey.set(id, key);
  }
  return {
    puts: [...putsByKey.values()],
    deletes: [...deletesByKey.values()],
  };
}

/** Dynamo puts/deletes for one cleaner's availability week submit (includes changed assignments). */
export function buildAvailabilityWeekPersistPlan(input: {
  before: HubData;
  after: HubData;
  cleanerId: string;
  weekStart: string;
  weekEnd: string;
}): AvailabilityWeekPersistPlan {
  const { before, after, cleanerId, weekStart, weekEnd } = input;
  const puts: DynamoItem[] = [];

  const deletes = weekAvailability(before, cleanerId, weekStart, weekEnd).map((window) => {
    const item = availabilityToItem(window);
    return { pk: item.pk, sk: item.sk };
  });

  for (const window of weekAvailability(after, cleanerId, weekStart, weekEnd)) {
    puts.push(availabilityToItem(window));
  }

  const submission = after.submissions.find(
    (row) => row.cleanerId === cleanerId && row.weekStart === weekStart,
  );
  if (submission) {
    puts.push(submissionToItem(submission));
  }

  const beforeById = new Map(before.assignments.map((assignment) => [assignment.assignmentId, assignment]));
  for (const assignment of after.assignments) {
    const previous = beforeById.get(assignment.assignmentId);
    if (!previous || !assignmentRecordEqual(previous, assignment)) {
      puts.push(assignmentToItem(assignment));
    }
  }

  return dedupeAvailabilityWeekBatchPlan({ puts, deletes });
}
