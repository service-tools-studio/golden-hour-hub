import type {
  Customer,
  Job,
  JobAssignment,
  PayType,
  Property,
  RecurrenceRule,
  SeriesStatus,
  ServiceType,
} from "../domain/types.ts";

export type CreateJobInput = {
  date: string;
  customerId: string;
  propertyId: string;
  serviceType: ServiceType;
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  headcountNeeded: number;
  expectedDurationMinutes: number;
  cleanerIds: string[];
  specialInstructions: string;
  pricePerVisitCents?: number;
  recurringSchedule?: { interval: 1 | 2 | 4 };
};

export type SaveCleanerDetailsInput = {
  jobId: string;
  cleanerId: string;
  propertyId: string;
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  expectedDurationMinutes: number;
  proposedCrewSize: number;
  payType: PayType;
  payPerPersonCents: number;
  specialInstructions: string;
};

export type StaffCleanerInput = {
  jobId: string;
  cleanerId: string;
  mode: "INVITE" | "DIRECT";
};

export type CompleteAssignmentInput = SaveCleanerDetailsInput & {
  assignmentId?: string;
  mode: "DRAFT" | "INVITE" | "DIRECT";
};

export type UpdateVisitInput = {
  jobId: string;
  date: string;
  customerId: string;
  propertyId: string;
  serviceType: ServiceType;
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  expectedDurationMinutes: number;
  headcountNeeded: number;
  specialInstructions: string;
  cleanerIds: string[];
  cleanerArrivals?: { cleanerId: string; arrivalWindowStart: string; arrivalWindowEnd: string }[];
  pricePerVisitCents?: number;
  recurringSchedule?: { interval: 1 | 2 | 4 };
};

export type UpdateJobInput = {
  jobId: string;
  assignmentId: string;
  propertyId: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
  headcountNeeded: number;
  proposedCrewSize: number;
  payType: PayType;
  payPerPersonCents: number;
  specialInstructions: string;
};

export type SaveSeriesInput = {
  propertyId: string;
  recurrence: RecurrenceRule;
  defaultHeadcountNeeded: number;
  defaultPricePerVisitCents?: number;
  status: SeriesStatus;
};

export type DeletedJobSnapshot = {
  job: Job;
  assignments: JobAssignment[];
  seriesSkippedDatesBefore?: { seriesId: string; skippedDates: string[] };
};

export type DeletedCustomerSnapshot = {
  customer: Customer;
  properties: Property[];
};

export type AdminHubApplierSuccess = {
  ok: true;
  hub: import("../mock/seed.ts").HubData;
  message?: string;
  customerId?: string;
  jobId?: string;
  assignmentId?: string;
};

export type AdminHubApplierResult = AdminHubApplierSuccess | { ok: false; message: string };
