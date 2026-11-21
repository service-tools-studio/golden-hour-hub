import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Job, JobAssignment } from "./types.ts";
import {
  cleanerNeedsScheduleReinvite,
  jobHasCleanerScheduleReinvite,
} from "./schedule-reinvite.ts";

describe("schedule re-invite helpers", () => {
  const job: Pick<Job, "jobId" | "date" | "arrivalWindowStart"> = {
    jobId: "job-1",
    date: "2026-11-25",
    arrivalWindowStart: "10:00",
  };

  it("flags invited cleaners when job date changed vs notified date", () => {
    const assignment = {
      assignmentId: "a-1",
      jobId: "job-1",
      cleanerId: "c-1",
      status: "INVITED",
      serviceDate: "2026-11-25",
      notifiedServiceDate: "2026-11-20",
      arrivalWindowStart: "10:00",
      arrivalWindowEnd: "10:00",
    } as JobAssignment;
    assert.equal(cleanerNeedsScheduleReinvite(assignment, job), true);
    assert.equal(jobHasCleanerScheduleReinvite(job, [assignment]), true);
  });

  it("ignores stale needsDateReinvite when notified date and arrival match the job", () => {
    const assignment = {
      assignmentId: "a-1",
      jobId: "job-1",
      cleanerId: "c-1",
      status: "CONFIRMED",
      serviceDate: "2026-11-25",
      notifiedServiceDate: "2026-11-25",
      needsDateReinvite: true,
      arrivalWindowStart: "10:00",
      arrivalWindowEnd: "10:00",
      lastNotified: { arrivalWindowStart: "10:00", arrivalWindowEnd: "10:00" },
    } as JobAssignment;
    assert.equal(cleanerNeedsScheduleReinvite(assignment, job), false);
  });

  it("flags confirmed cleaners when arrival time changed", () => {
    const assignment = {
      assignmentId: "a-1",
      jobId: "job-1",
      cleanerId: "c-1",
      status: "CONFIRMED",
      serviceDate: "2026-11-25",
      notifiedServiceDate: "2026-11-25",
      arrivalWindowStart: "09:00",
      arrivalWindowEnd: "09:00",
      lastNotified: { arrivalWindowStart: "09:00", arrivalWindowEnd: "09:00" },
    } as JobAssignment;
    assert.equal(cleanerNeedsScheduleReinvite(assignment, job), true);
  });

  it("does not flag a late cleaner when their start still matches the last text", () => {
    const lateJob = { ...job, arrivalWindowStart: "09:00" as const };
    const assignment = {
      assignmentId: "a-1",
      jobId: "job-1",
      cleanerId: "c-1",
      status: "CONFIRMED",
      serviceDate: "2026-11-25",
      notifiedServiceDate: "2026-11-25",
      arrivalWindowStart: "12:00",
      arrivalWindowEnd: "12:00",
      lastNotified: { arrivalWindowStart: "12:00", arrivalWindowEnd: "12:00" },
    } as JobAssignment;
    assert.equal(cleanerNeedsScheduleReinvite(assignment, lateJob), false);
  });

  it("flags a late cleaner when their start changed since the last text", () => {
    const lateJob = { ...job, arrivalWindowStart: "09:00" as const };
    const assignment = {
      assignmentId: "a-1",
      jobId: "job-1",
      cleanerId: "c-1",
      status: "INVITED",
      serviceDate: "2026-11-25",
      notifiedServiceDate: "2026-11-25",
      arrivalWindowStart: "13:00",
      arrivalWindowEnd: "13:00",
      lastNotified: { arrivalWindowStart: "12:00", arrivalWindowEnd: "12:00" },
    } as JobAssignment;
    assert.equal(cleanerNeedsScheduleReinvite(assignment, lateJob), true);
  });
});