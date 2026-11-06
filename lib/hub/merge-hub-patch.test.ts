import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CleanerProfile, Job, JobAssignment } from "../domain/types.ts";
import { emptyHub } from "../mock/seed.ts";
import { mergeHubPatchIntoHub } from "./merge-hub-patch.ts";

function asJob(job: Pick<Job, "jobId"> & Partial<Job>): Job {
  return job as unknown as Job;
}

function asAssignment(assignment: Pick<JobAssignment, "assignmentId" | "jobId" | "cleanerId" | "status">): JobAssignment {
  return assignment as unknown as JobAssignment;
}

function asCleaner(cleaner: Pick<CleanerProfile, "cleanerId"> & Partial<CleanerProfile>): CleanerProfile {
  return cleaner as unknown as CleanerProfile;
}

describe("mergeHubPatchIntoHub", () => {
  it("replaces one job roster without dropping the rest of the hub", () => {
    const current = {
      ...emptyHub("2026-11-05"),
      jobs: [asJob({ jobId: "job-1", draftCleanerIds: [] }), asJob({ jobId: "job-2", draftCleanerIds: ["ada"] })],
      assignments: [
        asAssignment({ assignmentId: "a-1", jobId: "job-1", cleanerId: "bob", status: "INVITED" }),
        asAssignment({ assignmentId: "a-2", jobId: "job-2", cleanerId: "ada", status: "INVITED" }),
      ],
      cleaners: [asCleaner({ cleanerId: "ada" })],
    };
    const patch = {
      ...emptyHub("2026-11-05"),
      jobs: [asJob({ jobId: "job-2", draftCleanerIds: ["ada", "bob"] })],
      assignments: [asAssignment({ assignmentId: "a-2", jobId: "job-2", cleanerId: "ada", status: "CANCELED" })],
      cleaners: [asCleaner({ cleanerId: "bob", firstName: "Bob" })],
    };

    const merged = mergeHubPatchIntoHub(current, patch, { replaceAssignmentsForPatchJobs: true });
    assert.equal(merged.jobs.length, 2);
    assert.deepEqual(merged.jobs.find((job) => job.jobId === "job-2")?.draftCleanerIds, ["ada", "bob"]);
    assert.equal(merged.assignments.length, 2);
    assert.equal(merged.assignments.find((item) => item.assignmentId === "a-2")?.status, "CANCELED");
    assert.equal(merged.assignments.find((item) => item.assignmentId === "a-1")?.status, "INVITED");
    assert.equal(merged.cleaners.find((cleaner) => cleaner.cleanerId === "bob")?.firstName, "Bob");
  });
});
