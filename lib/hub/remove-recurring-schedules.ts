import type { Job } from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";

export function isGeneratedSeriesJobId(job: Pick<Job, "jobId" | "seriesId" | "date">): boolean {
  if (!job.seriesId) return false;
  return job.jobId === `job-${job.seriesId}-${job.date}`;
}

/** Drop all series rows, remove future/generated occurrences, detach past jobs from series. */
export function removeAllRecurringSchedulesFromHub(hub: HubData): {
  hub: HubData;
  removedJobIds: string[];
} {
  const today = hub.today;
  const seriesIds = new Set(hub.series.map((item) => item.seriesId));
  const removedJobIds = new Set<string>();
  for (const job of hub.jobs) {
    if (!job.seriesId || !seriesIds.has(job.seriesId)) continue;
    if (isGeneratedSeriesJobId(job) || job.date >= today) {
      removedJobIds.add(job.jobId);
    }
  }
  const jobs = hub.jobs
    .filter((job) => !removedJobIds.has(job.jobId))
    .map((job) => (job.seriesId ? { ...job, seriesId: undefined } : job));
  return {
    hub: {
      ...hub,
      series: [],
      jobs,
      assignments: hub.assignments.filter((assignment) => !removedJobIds.has(assignment.jobId)),
    },
    removedJobIds: [...removedJobIds],
  };
}