import type { HubData } from "@/lib/mock/seed";

/** Cleaner-facing hub slice: no customer PII beyond job context, no pay rates for other cleaners. */
export function hubDataForCleaner(hub: HubData, cleanerId: string): HubData {
  const assignments = hub.assignments.filter((item) => item.cleanerId === cleanerId);
  const jobIds = new Set(assignments.map((item) => item.jobId));
  const jobs = hub.jobs.filter((job) => jobIds.has(job.jobId));
  const propertyIds = new Set(jobs.map((job) => job.propertyId));
  const properties = hub.properties.filter((property) => propertyIds.has(property.propertyId));
  const customerIds = new Set(properties.map((property) => property.customerId));
  const customers = hub.customers
    .filter((customer) => customerIds.has(customer.customerId))
    .map((customer) => ({
      ...customer,
      phone: "",
      email: "",
      notes: "",
    }));
  const cleaners = hub.cleaners
    .filter((cleaner) => cleaner.cleanerId === cleanerId)
    .map((cleaner) => ({
      ...cleaner,
      typicalHourlyRateCents: 0,
      email: cleaner.email,
    }));

  return {
    ...hub,
    customers,
    properties,
    cleaners,
    series: [],
    jobs,
    assignments,
    availability: hub.availability.filter((window) => window.cleanerId === cleanerId),
    submissions: hub.submissions.filter((submission) => submission.cleanerId === cleanerId),
  };
}
