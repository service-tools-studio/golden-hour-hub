import "server-only";

import { RECURRING_HORIZON_DAYS } from "../domain/recurrence.ts";
import { addDays, eachDate, editableAvailabilityHorizonEnd, mondayOf, todayInBusinessZone } from "../domain/time.ts";
import { emptyHub, type HubData } from "../mock/seed.ts";
import type { DynamoItem } from "./items.ts";
import { itemsToHub } from "./items.ts";
import {
  dedupeItemsByKey,
  mapWithConcurrency,
  queryAllCustomerPartitionItems,
  queryJobProfilesInDateRange,
  queryItemsByPk,
  queryRelationIndex,
  queryScheduleIndex,
} from "./dynamo-queries.ts";
import { finalizeLoadedHub, type FinalizeHubOptions } from "./hub-reconcile.ts";

export type LoadHubSliceOptions = FinalizeHubOptions & {
  /**
   * Availability, weekly submissions, and BQ from each cleaner partition.
   * Default on. Fast admin bootstrap can keep this on without loading the 56-day job horizon.
   */
  loadTeamSchedulingExtras?: boolean;
  loadSeries?: boolean;
  jobHorizonEnd?: string;
};

function readJobId(item: DynamoItem): string | null {
  if (typeof item.jobId === "string" && item.jobId.length > 0) return item.jobId;
  if (typeof item.pk === "string" && item.pk.startsWith("JOB#")) return item.pk.slice("JOB#".length);
  if (typeof item.gsi1sk === "string" && item.gsi1sk.length > 0) return item.gsi1sk;
  return null;
}

async function loadCustomerSeriesItems(customerIds: string[]): Promise<DynamoItem[]> {
  if (customerIds.length === 0) return [];
  const chunks = await mapWithConcurrency(customerIds, 32, (customerId) =>
    queryRelationIndex(`CUSTOMER#${customerId}`, "SERIES#"),
  );
  return chunks.flat();
}

function cleanerIdsFromProfileItems(cleanerProfileItems: DynamoItem[]): string[] {
  return [
    ...new Set(
      cleanerProfileItems
        .filter((item) => item.entity === "cleaner")
        .map((item) => item.cleanerId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ];
}

async function loadTeamSchedulingExtraItems(
  availabilityStart: string,
  horizonEnd: string,
  cleanerProfileItems: DynamoItem[],
): Promise<DynamoItem[]> {
  const cleanerIds = cleanerIdsFromProfileItems(cleanerProfileItems);
  if (cleanerIds.length === 0) return [];
  const submissionWeekStart = mondayOf(availabilityStart);
  const partitions = await mapWithConcurrency(cleanerIds, 32, (cleanerId) => queryItemsByPk(`CLEANER#${cleanerId}`));
  return dedupeItemsByKey(partitions.flat()).filter((item) => {
    if (item.entity === "availability") {
      const date = typeof item.date === "string" ? item.date : "";
      return date >= availabilityStart && date <= horizonEnd;
    }
    if (item.entity === "submission") {
      const weekStart = typeof item.weekStart === "string" ? item.weekStart : "";
      return weekStart >= submissionWeekStart && weekStart <= horizonEnd;
    }
    return item.entity === "contractor_questionnaire_submission";
  });
}

async function fetchAdminHubItems(options: {
  loadTeamSchedulingExtras: boolean;
  loadSeries: boolean;
  jobHorizonEnd: string;
}): Promise<DynamoItem[]> {
  const today = todayInBusinessZone();
  const horizonEnd = addDays(today, RECURRING_HORIZON_DAYS);
  const availabilityStart = mondayOf(today);

  const [cleanersActive, cleanersInactive, listedCustomers, jobProfilesInHorizon] = await Promise.all([
    queryScheduleIndex("CLEANER_STATUS#ACTIVE"),
    queryScheduleIndex("CLEANER_STATUS#INACTIVE"),
    options.loadSeries
      ? queryAllCustomerPartitionItems()
      : queryScheduleIndex("CUSTOMER#ALL"),
    queryJobProfilesInDateRange(today, options.jobHorizonEnd),
  ]);
  const customerPropertyRows =
    options.loadSeries || listedCustomers.length > 0
      ? listedCustomers
      : await queryAllCustomerPartitionItems();

  const customerIds = [
    ...new Set(
      [
        ...customerPropertyRows
          .filter((item) => item.entity === "customer")
          .map((item) => {
            if (typeof item.customerId === "string") return item.customerId;
            if (item.pk.startsWith("CUSTOMER#")) return item.pk.slice("CUSTOMER#".length);
            return null;
          }),
        ...jobProfilesInHorizon
          .map((item) => (typeof item.customerId === "string" ? item.customerId : null))
          .filter((value): value is string => Boolean(value)),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];

  const loadedCustomerIds = new Set(
    customerPropertyRows
      .filter((item) => item.entity === "customer")
      .map((item) => String(item.customerId ?? (item.pk.startsWith("CUSTOMER#") ? item.pk.slice(9) : "")))
      .filter(Boolean),
  );
  const missingCustomerIds = customerIds.filter((id) => !loadedCustomerIds.has(id));
  const extraCustomerRows =
    missingCustomerIds.length > 0
      ? dedupeItemsByKey(
          (await mapWithConcurrency(missingCustomerIds, 32, (customerId) => queryItemsByPk(`CUSTOMER#${customerId}`))).flat(),
        )
      : [];

  const allCustomerPropertyRows = dedupeItemsByKey([...customerPropertyRows, ...extraCustomerRows]);

  const jobIds = [
    ...new Set(jobProfilesInHorizon.map(readJobId).filter((value): value is string => Boolean(value))),
  ];

  const [customerSeries, jobPartitions, teamExtras] = await Promise.all([
    options.loadSeries ? loadCustomerSeriesItems(customerIds) : Promise.resolve([] as DynamoItem[]),
    loadJobPartitions(jobIds),
    options.loadTeamSchedulingExtras
      ? loadTeamSchedulingExtraItems(availabilityStart, horizonEnd, [...cleanersActive, ...cleanersInactive])
      : Promise.resolve([] as DynamoItem[]),
  ]);

  return dedupeItemsByKey([
    ...cleanersActive,
    ...cleanersInactive,
    ...allCustomerPropertyRows,
    ...customerSeries,
    ...jobPartitions,
    ...teamExtras,
  ]);
}

async function loadJobPartitions(jobIds: string[]): Promise<DynamoItem[]> {
  if (jobIds.length === 0) return [];
  const partitions = await mapWithConcurrency(jobIds, 32, (jobId) => queryItemsByPk(`JOB#${jobId}`));
  return partitions.flat();
}

/** Dynamo rows for team/scheduling screens (background hydrate after fast bootstrap). */
export async function loadAdminHubTeamExtraItems(): Promise<DynamoItem[]> {
  const today = todayInBusinessZone();
  const horizonEnd = addDays(today, RECURRING_HORIZON_DAYS);
  const availabilityStart = mondayOf(today);
  const [cleanersActive, cleanersInactive] = await Promise.all([
    queryScheduleIndex("CLEANER_STATUS#ACTIVE"),
    queryScheduleIndex("CLEANER_STATUS#INACTIVE"),
  ]);
  return loadTeamSchedulingExtraItems(availabilityStart, horizonEnd, [...cleanersActive, ...cleanersInactive]);
}

/** Load admin hub via GSI/partition queries (no full-table scan of hub entities). */
export async function loadAdminHubSlices(options: LoadHubSliceOptions = {}): Promise<HubData> {
  const today = todayInBusinessZone();
  const loadTeamSchedulingExtras = options.loadTeamSchedulingExtras !== false;
  const items = await fetchAdminHubItems({
    loadTeamSchedulingExtras,
    loadSeries: options.loadSeries ?? loadTeamSchedulingExtras,
    jobHorizonEnd:
      options.jobHorizonEnd ??
      (loadTeamSchedulingExtras ? addDays(today, RECURRING_HORIZON_DAYS) : editableAvailabilityHorizonEnd(today)),
  });
  if (items.length === 0) {
    return emptyHub(today);
  }
  const data = itemsToHub(items, today);
  const { loadTeamSchedulingExtras: _extras, ...finalizeOptions } = options;
  return finalizeLoadedHub(data, finalizeOptions);
}

export async function loadAdminHubTeamExtraSlice(): Promise<HubData> {
  const today = todayInBusinessZone();
  const items = await loadAdminHubTeamExtraItems();
  if (items.length === 0) return emptyHub(today);
  return itemsToHub(items, today);
}

/** Jobs and assignments for a closed date range (schedule lookback). No horizon merge. */
export async function loadAdminHubJobsInDateRange(startDate: string, endDate: string): Promise<HubData> {
  const today = todayInBusinessZone();
  if (startDate > endDate) return emptyHub(today);
  const jobProfiles = await queryJobProfilesInDateRange(startDate, endDate);
  const jobIds = [...new Set(jobProfiles.map(readJobId).filter((value): value is string => Boolean(value)))];
  const jobPartitions = await loadJobPartitions(jobIds);
  if (jobPartitions.length === 0) return emptyHub(today);
  return itemsToHub(dedupeItemsByKey(jobPartitions), today);
}

/** Remaining jobs, series, availability, and BQ after a fast admin bootstrap. */
export async function loadAdminHubRemainderSlice(): Promise<HubData> {
  const today = todayInBusinessZone();
  const horizonEnd = addDays(today, RECURRING_HORIZON_DAYS);
  const remainderStart = addDays(editableAvailabilityHorizonEnd(today), 1);
  const [jobProfiles, customerPartitions, extras] = await Promise.all([
    remainderStart <= horizonEnd ? queryJobProfilesInDateRange(remainderStart, horizonEnd) : Promise.resolve([] as DynamoItem[]),
    queryAllCustomerPartitionItems(),
    loadAdminHubTeamExtraItems(),
  ]);
  const customerIds = [
    ...new Set(
      customerPartitions
        .filter((item) => item.entity === "customer")
        .map((item) => (typeof item.customerId === "string" ? item.customerId : null))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const jobIds = [...new Set(jobProfiles.map(readJobId).filter((value): value is string => Boolean(value)))];
  const [jobPartitions, series] = await Promise.all([
    loadJobPartitions(jobIds),
    loadCustomerSeriesItems(customerIds),
  ]);
  const items = dedupeItemsByKey([...customerPartitions, ...jobPartitions, ...series, ...extras]);
  if (items.length === 0) return emptyHub(today);
  return itemsToHub(items, today);
}

/** Load specific partition roots (pk) for incremental sync. */
export async function loadHubPartitions(partitionKeys: string[]): Promise<HubData> {
  const today = todayInBusinessZone();
  const unique = [...new Set(partitionKeys.filter(Boolean))];
  if (unique.length === 0) return emptyHub(today);
  const partitions = await mapWithConcurrency(unique, 16, (pk) => queryItemsByPk(pk));
  const data = itemsToHub(dedupeItemsByKey(partitions.flat()), today);
  return finalizeLoadedHub(data, { persistReconciliation: false });
}

/** Cleaner session bootstrap without loading the full admin hub. */
export async function loadCleanerHubSlices(cleanerId: string, options: LoadHubSliceOptions = {}): Promise<HubData> {
  const today = todayInBusinessZone();
  const horizonEnd = addDays(today, RECURRING_HORIZON_DAYS);
  const availabilityStart = mondayOf(today);

  const [cleanerPartition, assignmentRows] = await Promise.all([
    queryItemsByPk(`CLEANER#${cleanerId}`),
    queryScheduleIndex(`CLEANER#${cleanerId}`),
  ]);

  const jobIds = [...new Set(assignmentRows.map(readJobId).filter((value): value is string => Boolean(value)))];
  const jobPartitions = await loadJobPartitions(jobIds);

  const propertyIds = new Set(
    jobPartitions
      .filter((item) => item.entity === "job")
      .map((item) => item.propertyId)
      .filter((value): value is string => typeof value === "string"),
  );
  const customerIds = new Set(
    jobPartitions
      .filter((item) => item.entity === "job")
      .map((item) => item.customerId)
      .filter((value): value is string => typeof value === "string"),
  );

  const customerRows = await mapWithConcurrency([...customerIds], 8, async (customerId) => {
    const partition = await queryItemsByPk(`CUSTOMER#${customerId}`);
    return partition.filter(
      (item) =>
        item.entity === "customer" ||
        (item.entity === "property" && propertyIds.has(String(item.propertyId ?? ""))),
    );
  });

  const availabilityDates = eachDate(availabilityStart, horizonEnd);
  const availabilityRows = cleanerPartition.filter((item) => item.entity === "availability");
  const submissionRows = cleanerPartition.filter((item) => item.entity === "submission");

  const items = dedupeItemsByKey([
    ...cleanerPartition.filter((item) => item.entity === "cleaner"),
    ...availabilityRows,
    ...submissionRows,
    ...assignmentRows,
    ...jobPartitions,
    ...customerRows.flat(),
  ]);

  if (items.length === 0) return emptyHub(today);
  const data = itemsToHub(items, today);
  return finalizeLoadedHub(data, options);
}

/** Minimal hub for one cleaner availability week mutation. */
export async function loadHubForAvailabilityWeek(cleanerId: string, _weekStart: string): Promise<HubData> {
  const today = todayInBusinessZone();
  const cleanerPartition = await queryItemsByPk(`CLEANER#${cleanerId}`, true);
  const assignmentRows = await queryScheduleIndex(`CLEANER#${cleanerId}`);
  const jobIds = [...new Set(assignmentRows.map(readJobId).filter((value): value is string => Boolean(value)))];
  const jobPartitions = jobIds.length > 0 ? await loadJobPartitions(jobIds) : [];
  const items = dedupeItemsByKey([...cleanerPartition, ...assignmentRows, ...jobPartitions]);
  return itemsToHub(items, today);
}
