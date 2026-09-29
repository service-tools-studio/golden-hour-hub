/**
 * Domain types for Golden Hour Hub.
 * A recurring series is not a job. Each cleaning date is its own job.
 * Each cleaner on that date has their own assignment.
 * Recurrence is determined by seriesId, not by the serviceType label.
 */

export const BUSINESS_TIME_ZONE = "America/Los_Angeles";

export type AppRole = "ADMIN" | "CLEANER";

export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type WeekOrdinal = 1 | 2 | 3 | 4 | "LAST";

export type RecurrenceFrequency = "WEEK" | "MONTH";

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  /** 1, 2, or 4 for weekly patterns. 1 for monthly patterns. */
  interval: number;
  daysOfWeek?: DayOfWeek[];
  weekOrdinals?: WeekOrdinal[];
  dayOfMonth?: number;
};

export type CleanerStatus = "ACTIVE" | "INACTIVE";

export type CleanerProfile = {
  cleanerId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  status: CleanerStatus;
  /** Usual helpers this cleaner brings. Must be <= maxHelperCount. */
  typicalHelperCount: number;
  /**
   * Authorization ceiling. 0 means this cleaner works alone.
   * Helper approval is derived: maxHelperCount > 0.
   */
  maxHelperCount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type AvailabilityWindow = {
  availabilityId: string;
  cleanerId: string;
  /** YYYY-MM-DD in America/Los_Angeles. */
  date: string;
  /** HH:mm */
  start: string;
  /** HH:mm. 24:00 means midnight at the end of the date. */
  end: string;
};

export type AvailabilitySubmission = {
  submissionId: string;
  cleanerId: string;
  /** Monday YYYY-MM-DD of the submitted week. */
  weekStart: string;
  submittedAt: string;
  updatedAt: string;
};

export type CustomerStatus = "ACTIVE" | "INACTIVE";

export type Customer = {
  customerId: string;
  firstName: string;
  lastName: string;
  /** Digits only, 10-digit US number. */
  phone: string;
  email?: string;
  notes?: string;
  status: CustomerStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type Property = {
  propertyId: string;
  customerId: string;
  label?: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  preferences: string;
  status: CustomerStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type ServiceType =
  | "RECURRING"
  | "DEEP_CLEAN"
  | "MOVE_OUT"
  | "POST_CONSTRUCTION"
  | "OTHER";

export type JobStatus = "SCHEDULED" | "CANCELED";

export type JobCustomerSnapshot = {
  customerDisplayName: string;
  phone: string;
  email?: string;
  propertyId: string;
  propertyLabel?: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  preferences: string;
};

export type Job = {
  jobId: string;
  customerId: string;
  propertyId: string;
  /** Present only when this occurrence belongs to a recurring series. */
  seriesId?: string;
  serviceType: ServiceType;
  /** YYYY-MM-DD */
  date: string;
  headcountNeeded: number;
  snapshot: JobCustomerSnapshot;
  specialInstructions: string;
  status: JobStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type AssignmentStatus =
  | "INVITED"
  | "PENDING_AVAILABILITY"
  | "CONFIRMED"
  | "NEEDS_ATTENTION"
  | "DECLINED"
  | "CANCELED"
  | "EXPIRED_JOB_FILLED";

export type PayType = "FLAT" | "HOURLY";

export type JobAssignment = {
  assignmentId: string;
  jobId: string;
  cleanerId: string;
  /** Denormalized job date so schedule checks do not need another lookup. */
  serviceDate: string;
  status: AssignmentStatus;
  proposedCrewSize: number;
  /** Crew size the cleaner or admin committed before availability could be checked. */
  pendingCrewSize?: number;
  confirmedCrewSize?: number;
  /** Why a recurring assignment could not be schedule-confirmed. */
  attentionReason?: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
  payType: PayType;
  /** Cents. Flat: per person for the job. Hourly: per person per hour. */
  payPerPersonCents: number;
  proposedTotalPayCents: number;
  /**
   * Cents. Flat: total for the confirmed crew.
   * Hourly: confirmed crew rate per hour, not a finished job total.
   */
  confirmedTotalPayCents?: number;
  invitedAt?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type StaffingTemplateMode = "INVITE" | "DIRECT" | "BLANK";

export type StaffingTemplateEntry = {
  cleanerId: string;
  proposedCrewSize: number;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
  payType: PayType;
  payPerPersonCents: number;
};

export type SeriesStatus = "ACTIVE" | "INACTIVE";

export type RecurringSeries = {
  seriesId: string;
  customerId: string;
  propertyId: string;
  recurrence: RecurrenceRule;
  startDate: string;
  endMode: "UNTIL_CANCELED" | "END_ON_DATE";
  endDate?: string;
  defaultHeadcountNeeded: number;
  defaultArrivalWindowStart: string;
  defaultArrivalWindowEnd: string;
  defaultExpectedDurationMinutes: number;
  defaultServiceType: ServiceType;
  defaultSpecialInstructions?: string;
  staffingTemplateMode: StaffingTemplateMode;
  staffingTemplate: StaffingTemplateEntry[];
  status: SeriesStatus;
  generatedThroughDate?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type EditScope = "THIS_ONLY" | "THIS_AND_FUTURE";

export type Result<T extends object = { ok: true }> =
  | (T & { ok: true })
  | { ok: false; message: string };
