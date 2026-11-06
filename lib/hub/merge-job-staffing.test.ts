import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeJobStaffingIntoHub } from "./merge-job-staffing.ts";
import { emptyHub } from "../mock/seed.ts";

describe("mergeJobStaffingIntoHub", () => {
  it("replaces one job and its assignments without dropping the rest of the hub", () => {
    const current = {
      ...emptyHub("2026-11-05"),
      jobs: [
        { jobId: "job-1", draftCleanerIds: [] } as (typeof emptyHub)["jobs"][number],
        { jobId: "job-2", draftCleanerIds: ["ada"] } as (typeof emptyHub)["jobs"][number],
      ],
      assignments: [
        { assignmentId: "a-1", jobId: "job-1", cleanerId: "bob", status: "INVITED" } as (typeof emptyHub)["assignments"][number],
        { assignmentId: "a-2", jobId: "job-2", cleanerId: "ada", status: "INVITED" } as (typeof emptyHub)["assignments"][number],
      ],
      cleaners: [{ cleanerId: "ada" } as (typeof emptyHub)["cleaners"][number]],
    };
    const patch = {
      ...emptyHub("2026-11-05"),
      jobs: [{ jobId: "job-2", draftCleanerIds: ["ada", "bob"] } as (typeof emptyHub)["jobs"][number]],
      assignments: [
        { assignmentId: "a-2", jobId: "job-2", cleanerId: "ada", status: "CANCELED" } as (typeof emptyHub)["assignments"][number],
      ],
      cleaners: [{ cleanerId: "bob", firstName: "Bob" } as (typeof emptyHub)["cleaners"][number]],
    };

    const merged = mergeJobStaffingIntoHub(current, patch);
    assert.equal(merged.jobs.length, 2);
    assert.deepEqual(merged.jobs.find((job) => job.jobId === "job-2")?.draftCleanerIds, ["ada", "bob"]);
    assert.equal(merged.assignments.length, 2);
    assert.equal(merged.assignments.find((item) => item.assignmentId === "a-2")?.status, "CANCELED");
    assert.equal(merged.assignments.find((item) => item.assignmentId === "a-1")?.status, "INVITED");
    assert.equal(merged.cleaners.find((cleaner) => cleaner.cleanerId === "bob")?.firstName, "Bob");
  });
});
