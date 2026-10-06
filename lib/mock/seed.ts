import { snapshotVisit } from "../domain/customers.ts";
import { mergeRecurringHorizon, recurrenceSummary } from "../domain/recurrence.ts";
import {
  addDays,
  dayOfWeek,
  eachDate,
  mondayOf,
  nextAvailabilityWeek,
} from "../domain/time.ts";
import type {
  AvailabilitySubmission,
  AvailabilityWindow,
  CleanerProfile,
  Customer,
  DayOfWeek,
  Property,
  Job,
  JobAssignment,
  RecurringSeries,
} from "../domain/types.ts";

export type HubData = {
  today: string;
  cleaners: CleanerProfile[];
  customers: Customer[];
  properties: Property[];
  series: RecurringSeries[];
  jobs: Job[];
  assignments: JobAssignment[];
  availability: AvailabilityWindow[];
  submissions: AvailabilitySubmission[];
};

const STAMP = "2026-09-20T16:00:00.000Z";

function nextWeekdayOnOrAfter(date: string): string {
  let cursor = date;
  const weekend = new Set<DayOfWeek>(["SATURDAY", "SUNDAY"]);
  while (weekend.has(dayOfWeek(cursor))) cursor = addDays(cursor, 1);
  return cursor;
}

function cover(cleanerId: string, date: string): AvailabilityWindow {
  return {
    availabilityId: `${cleanerId}-cover-${date}`,
    cleanerId,
    date,
    start: "08:00",
    end: "17:00",
  };
}

function weekdayWindows(
  cleanerId: string,
  start: string,
  dayCount: number,
  from: string,
  to: string,
): AvailabilityWindow[] {
  const windows: AvailabilityWindow[] = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(start, offset);
    if (dayOfWeek(date) === "SATURDAY" || dayOfWeek(date) === "SUNDAY") continue;
    windows.push({
      availabilityId: `${cleanerId}-${date}`,
      cleanerId,
      date,
      start: from,
      end: to,
    });
  }
  return windows;
}

export function buildSeed(today: string): HubData {
  const week = nextAvailabilityWeek(today);
  const johnsonDate = nextWeekdayOnOrAfter(addDays(today, 1));
  const priyaDate = nextWeekdayOnOrAfter(addDays(johnsonDate, 2));
  const luisDate = nextWeekdayOnOrAfter(addDays(priyaDate, 2));
  const openDate = nextWeekdayOnOrAfter(addDays(luisDate, 3));
  const pastDate = nextWeekdayOnOrAfter(addDays(today, -12));

  const cleaners: CleanerProfile[] = [
    cleaner("claudia", "Claudia", "Ramos", "5035550101", "claudia@example.com", 1, 2),
    cleaner("kat", "Kat", "Reyes", "5035550102", "kat@example.com", 0, 0),
    cleaner("mariana", "Mariana", "Moreno", "5035550103", "mari@example.com", 1, 1),
    cleaner("shariese", "Shariese", "Miles", "5035550104", "shariese@example.com", 0, 0),
    cleaner("ashley", "Ashley", "Smith", "5035550105", "ashley@example.com", 0, 0),
  ];

  const customers: Customer[] = [
    customer("cust-jeff", "Jeff", "Bachrach", "5035551234", "jeff@example.com"),
    customer("cust-amy", "Amy", "Johnson", "5035550199", "amy@example.com"),
    customer("cust-priya", "Priya", "Shah", "9715550144", undefined),
    customer("cust-luis", "Luis", "Ortega", "5035550177", "luis@example.com"),
  ];

  const properties: Property[] = [
    property("prop-jeff-main", "cust-jeff", "123 Main St", "97214", 3, 2, 1800, "Please use the side entrance. Cat may be indoors.", "Main house"),
    property("prop-jeff-downtown", "cust-jeff", "220 NW 10th Ave", "97209", 2, 1, 1100, "", "Downtown"),
    property("prop-amy", "cust-amy", "88 Hawthorne Blvd", "97214", 3, 2, 1650, "Fragrance-free products preferred."),
    property("prop-priya", "cust-priya", "410 Division St", "97202", 2, 1, 980, "Lock the back door when you leave."),
    property("prop-luis", "cust-luis", "15 Knott St", "97217", 4, 2, 2100, ""),
  ];

  const jeff = customers[0];
  const amy = customers[1];
  const priya = customers[2];
  const luis = customers[3];
  const jeffMain = properties[0];
  const amyHome = properties[2];
  const priyaHome = properties[3];
  const luisHome = properties[4];

  const series: RecurringSeries[] = [
    {
      seriesId: "series-jeff",
      customerId: jeff.customerId,
      propertyId: jeffMain.propertyId,
      recurrence: {
        frequency: "WEEK",
        interval: 2,
        daysOfWeek: [dayOfWeek(openDate)],
      },
      startDate: openDate,
      endMode: "UNTIL_CANCELED",
      defaultHeadcountNeeded: 2,
      defaultArrivalWindowStart: "09:00",
      defaultArrivalWindowEnd: "10:00",
      defaultExpectedDurationMinutes: 180,
      defaultServiceType: "RECURRING",
      defaultSpecialInstructions: "Biweekly maintenance clean.",
      staffingTemplateMode: "BLANK",
      staffingTemplate: [],
      status: "ACTIVE",
      generatedThroughDate: openDate,
      createdAt: STAMP,
      createdBy: "kelsey",
      updatedAt: STAMP,
      updatedBy: "kelsey",
    },
  ];

  const jobs: Job[] = [
    job("job-johnson", amy, amyHome, johnsonDate, "DEEP_CLEAN", 3, "Focus on the kitchen and both bathrooms."),
    job("job-priya", priya, priyaHome, priyaDate, "RECURRING", 1, "Regular clean. Please water the ferns."),
    job("job-luis", luis, luisHome, luisDate, "DEEP_CLEAN", 4, "Move-in dust is still on the baseboards."),
    job("job-jeff-open", jeff, jeffMain, openDate, "RECURRING", 2, "Biweekly maintenance clean.", "series-jeff"),
    job("job-jeff-past", jeff, jeffMain, pastDate, "RECURRING", 2, "Biweekly maintenance clean.", "series-jeff"),
  ];

  const assignments: JobAssignment[] = [
    assignment("as-claudia-johnson", "job-johnson", "claudia", johnsonDate, "CONFIRMED", 2, 2, 5_000, 10_000, 10_000),
    assignment("as-mariana-johnson", "job-johnson", "mariana", johnsonDate, "INVITED", 1, undefined, 5_000, 5_000),
    assignment("as-shariese-johnson", "job-johnson", "shariese", johnsonDate, "DECLINED", 1, undefined, 5_000, 5_000),
    assignment("as-mariana-priya", "job-priya", "mariana", priyaDate, "CONFIRMED", 1, 1, 5_000, 5_000, 5_000, "13:00", "13:30", 180),
    assignment("as-claudia-luis", "job-luis", "claudia", luisDate, "INVITED", 2, undefined, 5_000, 10_000),
    assignment("as-claudia-past", "job-jeff-past", "claudia", pastDate, "CONFIRMED", 2, 2, 5_000, 10_000, 10_000),
  ];

  const availability = [johnsonDate, priyaDate, luisDate, pastDate].reduce(
    (windows, date) => {
      const claudiaCovered = windows.some((window) => window.cleanerId === "claudia" && window.date === date);
      const marianaCovered = windows.some((window) => window.cleanerId === "mariana" && window.date === date);
      return [
        ...windows,
        ...(claudiaCovered ? [] : [cover("claudia", date)]),
        ...(marianaCovered ? [] : [cover("mariana", date)]),
      ];
    },
    [
      ...weekdayWindows("claudia", addDays(mondayOf(today), -7), 35, "08:00", "17:00"),
      ...weekdayWindows("mariana", addDays(mondayOf(today), -7), 35, "08:00", "17:00"),
      ...eachDate("2026-09-28", "2026-10-11").map((date) => ({
        availabilityId: `ashley-cover-${date}`,
        cleanerId: "ashley",
        date,
        start: "08:00",
        end: "23:55",
      })),
    ],
  );

  const submissions: AvailabilitySubmission[] = [
    {
      submissionId: "sub-claudia",
      cleanerId: "claudia",
      weekStart: week.weekStart,
      submittedAt: STAMP,
      updatedAt: STAMP,
    },
    {
      submissionId: "sub-mariana",
      cleanerId: "mariana",
      weekStart: week.weekStart,
      submittedAt: STAMP,
      updatedAt: STAMP,
    },
    ...["2026-09-28", "2026-10-05"].map((weekStart) => ({
      submissionId: `sub-ashley-${weekStart}`,
      cleanerId: "ashley",
      weekStart,
      submittedAt: STAMP,
      updatedAt: STAMP,
    })),
  ];

  const generated = mergeRecurringHorizon({
    today,
    series,
    jobs,
    customers,
    properties,
    cleaners,
    availability,
    submissions,
    assignments,
    nowIso: STAMP,
  });
  return {
    today,
    cleaners,
    customers,
    properties,
    availability,
    submissions,
    series: generated.series,
    jobs: generated.jobs,
    assignments: generated.assignments,
  };
}

export function seriesSummary(series: RecurringSeries): string {
  return recurrenceSummary(series.recurrence);
}

function cleaner(
  cleanerId: string,
  firstName: string,
  lastName: string,
  mobilePhone: string,
  email: string,
  typicalHelperCount: number,
  maxHelperCount: number,
): CleanerProfile {
  return {
    cleanerId,
    firstName,
    lastName,
    email,
    mobilePhone,
    status: "ACTIVE",
    typicalHelperCount,
    maxHelperCount,
    createdAt: STAMP,
    createdBy: "kelsey",
    updatedAt: STAMP,
    updatedBy: "kelsey",
  };
}

function customer(
  customerId: string,
  firstName: string,
  lastName: string,
  phone: string,
  email: string | undefined,
): Customer {
  return {
    customerId,
    firstName,
    lastName,
    phone,
    email,
    status: "ACTIVE",
    createdAt: STAMP,
    createdBy: "kelsey",
    updatedAt: STAMP,
    updatedBy: "kelsey",
  };
}

function property(
  propertyId: string,
  customerId: string,
  streetAddress: string,
  zip: string,
  bedrooms: number,
  bathrooms: number,
  squareFeet: number,
  preferences: string,
  label?: string,
): Property {
  return {
    propertyId,
    customerId,
    label,
    streetAddress,
    city: "Portland",
    state: "OR",
    zip,
    bedrooms,
    bathrooms,
    squareFeet,
    preferences,
    status: "ACTIVE",
    createdAt: STAMP,
    createdBy: "kelsey",
    updatedAt: STAMP,
    updatedBy: "kelsey",
  };
}

function job(
  jobId: string,
  person: Customer,
  home: Property,
  date: string,
  serviceType: Job["serviceType"],
  headcountNeeded: number,
  specialInstructions: string,
  seriesId?: string,
): Job {
  return {
    jobId,
    customerId: person.customerId,
    propertyId: home.propertyId,
    seriesId,
    serviceType,
    date,
    headcountNeeded,
    snapshot: snapshotVisit(person, home),
    specialInstructions,
    status: "SCHEDULED",
    createdAt: STAMP,
    createdBy: "kelsey",
    updatedAt: STAMP,
    updatedBy: "kelsey",
  };
}

function assignment(
  assignmentId: string,
  jobId: string,
  cleanerId: string,
  serviceDate: string,
  status: JobAssignment["status"],
  proposedCrewSize: number,
  confirmedCrewSize: number | undefined,
  payPerPersonCents: number,
  proposedTotalPayCents: number,
  confirmedTotalPayCents?: number,
  arrivalWindowStart = "09:00",
  arrivalWindowEnd = "10:00",
  expectedDurationMinutes = 240,
): JobAssignment {
  return {
    assignmentId,
    jobId,
    cleanerId,
    serviceDate,
    status,
    proposedCrewSize,
    confirmedCrewSize,
    arrivalWindowStart,
    arrivalWindowEnd,
    expectedDurationMinutes,
    payType: "FLAT",
    payPerPersonCents,
    proposedTotalPayCents,
    confirmedTotalPayCents,
    invitedAt: STAMP,
    respondedAt: status === "INVITED" ? undefined : STAMP,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}
