import { buildCustomerSearchKeys } from "../domain/customers.ts";
import type { HubData } from "../mock/seed.ts";
import type {
  AvailabilitySubmission,
  AvailabilityWindow,
  CleanerProfile,
  Customer,
  Job,
  JobAssignment,
  Property,
  RecurringSeries,
} from "../domain/types.ts";

export type DynamoItem = {
  pk: string;
  sk: string;
  entity: string;
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
} & Record<string, unknown>;

function text(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function hubToItems(data: HubData): DynamoItem[] {
  const items: DynamoItem[] = [
    ...data.cleaners.map(cleanerItem),
    ...data.availability.map(availabilityItem),
    ...data.submissions.map(submissionItem),
    ...data.customers.map(customerItem),
    ...data.properties.map(propertyItem),
    ...searchItems(data.customers, data.properties),
    ...data.series.map(seriesItem),
    ...data.jobs.map(jobItem),
    ...data.jobs.filter((job) => job.seriesId).map(occurItem),
    ...data.assignments.map(assignmentItem),
  ];
  return items;
}

export function itemsToHub(items: DynamoItem[], today: string): HubData {
  const data: HubData = {
    today,
    cleaners: [],
    customers: [],
    properties: [],
    series: [],
    jobs: [],
    assignments: [],
    availability: [],
    submissions: [],
  };
  for (const item of items) {
    if (item.entity === "cleaner") data.cleaners.push(readCleaner(item));
    if (item.entity === "customer") data.customers.push(readCustomer(item));
    if (item.entity === "property") data.properties.push(readProperty(item));
    if (item.entity === "series") data.series.push(readSeries(item));
    if (item.entity === "job") data.jobs.push(readJob(item));
    if (item.entity === "assignment") data.assignments.push(readAssignment(item));
    if (item.entity === "availability") data.availability.push(readAvailability(item));
    if (item.entity === "submission") data.submissions.push(readSubmission(item));
  }
  return data;
}

function cleanerItem(cleaner: CleanerProfile): DynamoItem {
  return {
    pk: `CLEANER#${cleaner.cleanerId}`,
    sk: "PROFILE",
    entity: "cleaner",
    gsi1pk: `CLEANER_STATUS#${cleaner.status}`,
    gsi1sk: `${cleaner.lastName.toLowerCase()}#${cleaner.cleanerId}`,
    ...cleaner,
  };
}

function availabilityItem(window: AvailabilityWindow): DynamoItem {
  return {
    pk: `CLEANER#${window.cleanerId}`,
    sk: `AVAIL#${window.date}#${window.start}#${window.availabilityId}`,
    entity: "availability",
    gsi1pk: `AVAIL#${window.date}`,
    gsi1sk: `${window.cleanerId}#${window.start}#${window.availabilityId}`,
    ...window,
  };
}

function submissionItem(submission: AvailabilitySubmission): DynamoItem {
  return {
    pk: `CLEANER#${submission.cleanerId}`,
    sk: `SUBMISSION#${submission.weekStart}`,
    entity: "submission",
    gsi1pk: `SUBMISSION#${submission.weekStart}`,
    gsi1sk: submission.cleanerId,
    ...submission,
  };
}

function customerItem(customer: Customer): DynamoItem {
  return {
    pk: `CUSTOMER#${customer.customerId}`,
    sk: "PROFILE",
    entity: "customer",
    ...customer,
  };
}

function propertyItem(property: Property): DynamoItem {
  return {
    pk: `CUSTOMER#${property.customerId}`,
    sk: `PROPERTY#${property.propertyId}`,
    entity: "property",
    ...property,
  };
}

function searchItems(customers: Customer[], properties: Property[]): DynamoItem[] {
  const items: DynamoItem[] = [];
  for (const customer of customers) {
    const keys = buildCustomerSearchKeys(customer);
    for (const name of keys.nameKeys) {
      items.push({
        pk: "SEARCH#NAME",
        sk: `${name}#${customer.customerId}`,
        entity: "search",
        customerId: customer.customerId,
      });
    }
    if (keys.phoneKey) {
      items.push({
        pk: "SEARCH#PHONE",
        sk: `${keys.phoneKey}#${customer.customerId}`,
        entity: "search",
        customerId: customer.customerId,
      });
    }
    if (keys.phoneLast7) {
      items.push({
        pk: "SEARCH#PHONE7",
        sk: `${keys.phoneLast7}#${customer.customerId}`,
        entity: "search",
        customerId: customer.customerId,
      });
    }
  }
  for (const property of properties) {
    for (const value of [property.streetAddress, property.city, property.label ?? ""]) {
      const key = text(value);
      if (!key) continue;
      items.push({
        pk: "SEARCH#ADDR",
        sk: `${key}#${property.propertyId}`,
        entity: "search",
        customerId: property.customerId,
        propertyId: property.propertyId,
      });
    }
  }
  return items;
}

function seriesItem(series: RecurringSeries): DynamoItem {
  return {
    pk: `SERIES#${series.seriesId}`,
    sk: "PROFILE",
    entity: "series",
    gsi1pk: `SERIES#${series.status}`,
    gsi1sk: `${series.generatedThroughDate ?? series.startDate}#${series.seriesId}`,
    gsi2pk: `CUSTOMER#${series.customerId}`,
    gsi2sk: `SERIES#${series.seriesId}`,
    ...series,
  };
}

function jobItem(job: Job): DynamoItem {
  return {
    pk: `JOB#${job.jobId}`,
    sk: "PROFILE",
    entity: "job",
    gsi1pk: `JOBDATE#${job.date}`,
    gsi1sk: job.jobId,
    gsi2pk: `CUSTOMER#${job.customerId}`,
    gsi2sk: `JOB#${job.date}#${job.jobId}`,
    ...job,
  };
}

function occurItem(job: Job): DynamoItem {
  return {
    pk: `SERIES#${job.seriesId}`,
    sk: `OCCUR#${job.date}`,
    entity: "occur",
    jobId: job.jobId,
    seriesId: job.seriesId,
    date: job.date,
  };
}

function assignmentItem(assignment: JobAssignment): DynamoItem {
  return {
    pk: `JOB#${assignment.jobId}`,
    sk: `ASSIGN#${assignment.assignmentId}`,
    entity: "assignment",
    gsi1pk: `CLEANER#${assignment.cleanerId}`,
    gsi1sk: `${assignment.serviceDate}#${assignment.assignmentId}`,
    ...withoutEmpty(assignment),
  };
}

function withoutEmpty(record: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function readCleaner(item: DynamoItem): CleanerProfile {
  const typicalHelperCount = numberField(item, "typicalHelperCount");
  const storedMax = item.maxHelperCount;
  const maxHelperCount =
    typeof storedMax === "number"
      ? storedMax
      : item.helpersApproved === true
        ? Math.max(typicalHelperCount, 1)
        : 0;
  return {
    cleanerId: stringField(item, "cleanerId"),
    firstName: stringField(item, "firstName"),
    lastName: stringField(item, "lastName"),
    email: stringField(item, "email"),
    mobilePhone: stringField(item, "mobilePhone"),
    status: item.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    typicalHelperCount: maxHelperCount === 0 ? 0 : Math.min(typicalHelperCount, maxHelperCount),
    maxHelperCount,
    createdAt: stringField(item, "createdAt"),
    createdBy: stringField(item, "createdBy"),
    updatedAt: stringField(item, "updatedAt"),
    updatedBy: stringField(item, "updatedBy"),
  };
}

function readCustomer(item: DynamoItem): Customer {
  return {
    customerId: stringField(item, "customerId"),
    firstName: stringField(item, "firstName"),
    lastName: stringField(item, "lastName"),
    phone: stringField(item, "phone"),
    email: optionalString(item, "email"),
    notes: optionalString(item, "notes"),
    status: item.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    createdAt: stringField(item, "createdAt"),
    createdBy: stringField(item, "createdBy"),
    updatedAt: stringField(item, "updatedAt"),
    updatedBy: stringField(item, "updatedBy"),
  };
}

function readProperty(item: DynamoItem): Property {
  return {
    propertyId: stringField(item, "propertyId"),
    customerId: stringField(item, "customerId"),
    label: optionalString(item, "label"),
    streetAddress: stringField(item, "streetAddress"),
    city: stringField(item, "city"),
    state: stringField(item, "state"),
    zip: stringField(item, "zip"),
    bedrooms: numberField(item, "bedrooms"),
    bathrooms: numberField(item, "bathrooms"),
    squareFeet: numberField(item, "squareFeet"),
    preferences: stringField(item, "preferences"),
    status: item.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    createdAt: stringField(item, "createdAt"),
    createdBy: stringField(item, "createdBy"),
    updatedAt: stringField(item, "updatedAt"),
    updatedBy: stringField(item, "updatedBy"),
  };
}

function readSeries(item: DynamoItem): RecurringSeries {
  return {
    seriesId: stringField(item, "seriesId"),
    customerId: stringField(item, "customerId"),
    propertyId: stringField(item, "propertyId"),
    recurrence: item.recurrence as RecurringSeries["recurrence"],
    startDate: stringField(item, "startDate"),
    endMode: item.endMode === "END_ON_DATE" ? "END_ON_DATE" : "UNTIL_CANCELED",
    endDate: optionalString(item, "endDate"),
    defaultHeadcountNeeded: numberField(item, "defaultHeadcountNeeded"),
    defaultArrivalWindowStart: stringField(item, "defaultArrivalWindowStart"),
    defaultArrivalWindowEnd: stringField(item, "defaultArrivalWindowEnd"),
    defaultExpectedDurationMinutes: numberField(item, "defaultExpectedDurationMinutes"),
    defaultServiceType: item.defaultServiceType as RecurringSeries["defaultServiceType"],
    defaultSpecialInstructions: optionalString(item, "defaultSpecialInstructions"),
    staffingTemplateMode: item.staffingTemplateMode as RecurringSeries["staffingTemplateMode"],
    staffingTemplate: (item.staffingTemplate as RecurringSeries["staffingTemplate"]) ?? [],
    status: item.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    generatedThroughDate: optionalString(item, "generatedThroughDate"),
    createdAt: stringField(item, "createdAt"),
    createdBy: stringField(item, "createdBy"),
    updatedAt: stringField(item, "updatedAt"),
    updatedBy: stringField(item, "updatedBy"),
  };
}

function readJob(item: DynamoItem): Job {
  return {
    jobId: stringField(item, "jobId"),
    customerId: stringField(item, "customerId"),
    propertyId: stringField(item, "propertyId"),
    seriesId: optionalString(item, "seriesId"),
    serviceType: item.serviceType as Job["serviceType"],
    date: stringField(item, "date"),
    headcountNeeded: numberField(item, "headcountNeeded"),
    snapshot: item.snapshot as Job["snapshot"],
    specialInstructions: stringField(item, "specialInstructions"),
    status: item.status === "CANCELED" ? "CANCELED" : "SCHEDULED",
    createdAt: stringField(item, "createdAt"),
    createdBy: stringField(item, "createdBy"),
    updatedAt: stringField(item, "updatedAt"),
    updatedBy: stringField(item, "updatedBy"),
  };
}

function readAssignment(item: DynamoItem): JobAssignment {
  return {
    assignmentId: stringField(item, "assignmentId"),
    jobId: stringField(item, "jobId"),
    cleanerId: stringField(item, "cleanerId"),
    serviceDate: stringField(item, "serviceDate"),
    status: item.status as JobAssignment["status"],
    proposedCrewSize: numberField(item, "proposedCrewSize"),
    pendingCrewSize: optionalNumber(item, "pendingCrewSize"),
    confirmedCrewSize: optionalNumber(item, "confirmedCrewSize"),
    attentionReason: optionalString(item, "attentionReason"),
    arrivalWindowStart: stringField(item, "arrivalWindowStart"),
    arrivalWindowEnd: stringField(item, "arrivalWindowEnd"),
    expectedDurationMinutes: numberField(item, "expectedDurationMinutes"),
    payType: item.payType === "HOURLY" ? "HOURLY" : "FLAT",
    payPerPersonCents: numberField(item, "payPerPersonCents"),
    proposedTotalPayCents: numberField(item, "proposedTotalPayCents"),
    confirmedTotalPayCents: optionalNumber(item, "confirmedTotalPayCents"),
    invitedAt: optionalString(item, "invitedAt"),
    respondedAt: optionalString(item, "respondedAt"),
    createdAt: stringField(item, "createdAt"),
    updatedAt: stringField(item, "updatedAt"),
  };
}

function readAvailability(item: DynamoItem): AvailabilityWindow {
  return {
    availabilityId: stringField(item, "availabilityId"),
    cleanerId: stringField(item, "cleanerId"),
    date: stringField(item, "date"),
    start: stringField(item, "start"),
    end: stringField(item, "end"),
  };
}

function readSubmission(item: DynamoItem): AvailabilitySubmission {
  return {
    submissionId: stringField(item, "submissionId"),
    cleanerId: stringField(item, "cleanerId"),
    weekStart: stringField(item, "weekStart"),
    submittedAt: stringField(item, "submittedAt"),
    updatedAt: stringField(item, "updatedAt"),
  };
}

function stringField(item: DynamoItem, key: string): string {
  const value = item[key];
  return typeof value === "string" ? value : "";
}

function optionalString(item: DynamoItem, key: string): string | undefined {
  const value = item[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(item: DynamoItem, key: string): number {
  const value = item[key];
  return typeof value === "number" ? value : 0;
}

function optionalNumber(item: DynamoItem, key: string): number | undefined {
  const value = item[key];
  return typeof value === "number" ? value : undefined;
}
