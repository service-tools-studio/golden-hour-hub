import { hubToItems, type DynamoItem } from "../data/items.ts";
import type { HubData } from "../mock/seed.ts";

export type HubDiffPersistPlan = {
  puts: DynamoItem[];
  deletes: Array<{ pk: string; sk: string }>;
};

function itemKey(item: { pk: string; sk: string }): string {
  return `${item.pk}|${item.sk}`;
}

function itemEqual(before: DynamoItem, after: DynamoItem): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}

/** Diff hub snapshots into Dynamo puts/deletes (search rows included via hubToItems). */
export function buildHubDiffPersistPlan(before: HubData, after: HubData): HubDiffPersistPlan {
  const beforeItems = hubToItems(before);
  const afterItems = hubToItems(after);
  const beforeByKey = new Map(beforeItems.map((item) => [itemKey(item), item]));
  const afterByKey = new Map(afterItems.map((item) => [itemKey(item), item]));

  const puts: DynamoItem[] = [];
  for (const [key, item] of afterByKey) {
    const previous = beforeByKey.get(key);
    if (!previous || !itemEqual(previous, item)) {
      puts.push(item);
    }
  }

  const deletes: Array<{ pk: string; sk: string }> = [];
  for (const [key, item] of beforeByKey) {
    if (!afterByKey.has(key)) {
      deletes.push({ pk: item.pk, sk: item.sk });
    }
  }

  const putsByKey = new Map(puts.map((item) => [itemKey(item), item]));
  const putKeys = new Set(putsByKey.keys());
  return {
    puts: [...putsByKey.values()],
    deletes: deletes.filter((key) => !putKeys.has(itemKey(key))),
  };
}
