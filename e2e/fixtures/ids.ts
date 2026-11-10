/** Stable ids written by scripts/seed-e2e.ts — keep in sync with Playwright specs. */
export const E2E = {
  cleanerPortland: "e2e-pdx-cleaner",
  cleanerPhoenix: "e2e-phx-cleaner",
  customerPortland: "e2e-pdx-customer",
  customerPhoenix: "e2e-phx-customer",
  propertyPortland: "e2e-pdx-property",
  propertyPhoenix: "e2e-phx-property",
  jobPortland: "e2e-pdx-job",
  jobPhoenix: "e2e-phx-job",
  /** Phoenix draft without cleaners — assign-cleaner specs mutate this job only. */
  jobPhoenixAssign: "e2e-phx-assign",
  labels: {
    portlandCustomer: "E2E Portland",
    phoenixCustomer: "E2E Phoenix",
    portlandCleaner: "Ada E2E",
    phoenixCleaner: "Rio E2E",
  },
} as const;
