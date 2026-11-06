import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AvailabilityWindow, CleanerProfile, Job, JobAssignment } from "../domain/types.ts";
import { emptyHub } from "../mock/seed.ts";
import {
  hubAvailabilityWeekPatch,
  hubMutationPatch,
  mergeAvailabilityWeekIntoHub,
  mergeHubPatchIntoHub,
} from "./merge-hub-patch.ts";

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

  it("replaces one cleaner's week without dropping other availability", () => {
    const current = {
      ...emptyHub("2026-11-05"),
      availability: [
        { availabilityId: "ada-old", cleanerId: "ada", date: "2026-11-02", start: "09:00", end: "12:00" },
        { availabilityId: "bob-keep", cleanerId: "bob", date: "2026-11-03", start: "09:00", end: "17:00" },
      ] as AvailabilityWindow[],
      submissions: [{ submissionId: "sub-ada", cleanerId: "ada", weekStart: "2026-11-02", submittedAt: "old", updatedAt: "old" }],
    };
    const patch = {
      ...emptyHub("2026-11-05"),
      availability: [
        { availabilityId: "ada-new", cleanerId: "ada", date: "2026-11-04", start: "13:00", end: "16:00" },
      ] as AvailabilityWindow[],
      submissions: [{ submissionId: "sub-ada", cleanerId: "ada", weekStart: "2026-11-02", submittedAt: "new", updatedAt: "new" }],
    };

    const merged = mergeAvailabilityWeekIntoHub(current, patch, "ada", "2026-11-02", "2026-11-08");
    assert.equal(merged.availability.length, 2);
    assert.ok(merged.availability.some((window) => window.availabilityId === "ada-new"));
    assert.ok(!merged.availability.some((window) => window.availabilityId === "ada-old"));
    assert.equal(merged.availability.find((window) => window.cleanerId === "bob")?.availabilityId, "bob-keep");
    assert.equal(merged.submissions.find((row) => row.cleanerId === "ada")?.submittedAt, "new");
  });

  it("keeps unchanged days and drops duplicate all-day rows when replacing a saved week", () => {
    const monday = {
      availabilityId: "mon-1",
      cleanerId: "ada",
      date: "2026-11-02",
      start: "07:00",
      end: "24:00",
    } as AvailabilityWindow;
    const tuesdaySaved = {
      availabilityId: "tue-saved",
      cleanerId: "ada",
      date: "2026-11-03",
      start: "07:00",
      end: "24:00",
    } as AvailabilityWindow;
    const current = {
      ...emptyHub("2026-11-05"),
      availability: [
        monday,
        {
          availabilityId: "tue-old-a",
          cleanerId: "ada",
          date: "2026-11-03",
          start: "07:00",
          end: "24:00",
        },
        {
          availabilityId: "tue-old-b",
          cleanerId: "ada",
          date: "2026-11-03",
          start: "07:00",
          end: "24:00",
        },
        tuesdaySaved,
        {
          availabilityId: "bob-keep",
          cleanerId: "bob",
          date: "2026-11-03",
          start: "09:00",
          end: "17:00",
        },
      ] as AvailabilityWindow[],
    };
    const after = {
      ...emptyHub("2026-11-05"),
      availability: [monday, tuesdaySaved],
    };
    const { patch, remove } = hubAvailabilityWeekPatch(current, after, "ada", "2026-11-02", "2026-11-08");
    const merged = mergeAvailabilityWeekIntoHub(current, patch, "ada", "2026-11-02", "2026-11-08", remove);
    assert.deepEqual(
      merged.availability
        .filter((window) => window.cleanerId === "ada")
        .map((window) => window.availabilityId)
        .sort(),
      ["mon-1", "tue-saved"],
    );
    assert.equal(merged.availability.filter((window) => window.date === "2026-11-03" && window.cleanerId === "ada").length, 1);
    assert.equal(merged.availability.find((window) => window.cleanerId === "bob")?.availabilityId, "bob-keep");
  });

  it("keeps two cleaners' windows that share a draft availabilityId", () => {
    const current = {
      ...emptyHub("2026-11-05"),
      availability: [
        { availabilityId: "draft-2026-11-02-0", cleanerId: "jasmin", date: "2026-11-02", start: "07:00", end: "24:00" },
      ] as AvailabilityWindow[],
    };
    const patch = {
      ...emptyHub("2026-11-05"),
      availability: [
        { availabilityId: "draft-2026-11-02-0", cleanerId: "ada", date: "2026-11-02", start: "07:00", end: "24:00" },
      ] as AvailabilityWindow[],
    };
    const merged = mergeHubPatchIntoHub(current, patch);
    assert.equal(merged.availability.length, 2);
    assert.ok(merged.availability.some((window) => window.cleanerId === "jasmin"));
    assert.ok(merged.availability.some((window) => window.cleanerId === "ada"));
  });

  it("replaces a cleaner's availability from a partition sync instead of stacking ids", () => {
    const current = {
      ...emptyHub("2026-11-05"),
      availability: [
        { availabilityId: "ada-old", cleanerId: "ada", date: "2026-11-03", start: "07:00", end: "24:00" },
        { availabilityId: "ada-new", cleanerId: "ada", date: "2026-11-03", start: "07:00", end: "24:00" },
        { availabilityId: "bob-keep", cleanerId: "bob", date: "2026-11-03", start: "09:00", end: "17:00" },
      ] as AvailabilityWindow[],
    };
    const patch = {
      ...emptyHub("2026-11-05"),
      availability: [
        { availabilityId: "ada-new", cleanerId: "ada", date: "2026-11-03", start: "07:00", end: "24:00" },
      ] as AvailabilityWindow[],
    };
    const merged = mergeHubPatchIntoHub(current, patch, { replaceAvailabilityForPatchCleaners: true });
    assert.deepEqual(
      merged.availability.map((window) => window.availabilityId).sort(),
      ["ada-new", "bob-keep"],
    );
  });

  it("keeps other days when a partition patch only includes some dates", () => {
    const current = {
      ...emptyHub("2026-11-05"),
      availability: [
        { availabilityId: "ada-mon", cleanerId: "ada", date: "2026-11-02", start: "07:00", end: "24:00" },
        { availabilityId: "ada-tue-old", cleanerId: "ada", date: "2026-11-03", start: "07:00", end: "24:00" },
      ] as AvailabilityWindow[],
    };
    const patch = {
      ...emptyHub("2026-11-05"),
      availability: [
        { availabilityId: "ada-tue-new", cleanerId: "ada", date: "2026-11-03", start: "07:00", end: "24:00" },
      ] as AvailabilityWindow[],
    };
    const merged = mergeHubPatchIntoHub(current, patch, { replaceAvailabilityForPatchCleaners: true });
    assert.deepEqual(
      merged.availability.map((window) => window.availabilityId).sort(),
      ["ada-mon", "ada-tue-new"],
    );
  });

  it("applies deletes without replacing the rest of the hub", () => {
    const current = {
      ...emptyHub("2026-11-05"),
      jobs: [asJob({ jobId: "job-1" }), asJob({ jobId: "job-2" })],
      assignments: [
        asAssignment({ assignmentId: "a-1", jobId: "job-1", cleanerId: "ada", status: "INVITED" }),
        asAssignment({ assignmentId: "a-2", jobId: "job-2", cleanerId: "bob", status: "INVITED" }),
      ],
      availability: [
        { availabilityId: "ada-1", cleanerId: "ada", date: "2026-11-04", start: "09:00", end: "12:00" },
      ] as AvailabilityWindow[],
    };
    const patch = {
      ...emptyHub("2026-11-05"),
      jobs: [asJob({ jobId: "job-2", headcountNeeded: 3 })],
    };

    const merged = mergeHubPatchIntoHub(current, patch, {
      remove: { jobIds: ["job-1"], assignmentIds: ["a-1"] },
    });
    assert.equal(merged.jobs.length, 1);
    assert.equal(merged.jobs[0]?.jobId, "job-2");
    assert.equal(merged.jobs[0]?.headcountNeeded, 3);
    assert.equal(merged.assignments.length, 1);
    assert.equal(merged.assignments[0]?.assignmentId, "a-2");
    assert.equal(merged.availability[0]?.availabilityId, "ada-1");
  });

  it("builds a mutation patch of only changed and removed rows", () => {
    const before = {
      ...emptyHub("2026-11-05"),
      jobs: [asJob({ jobId: "job-1", headcountNeeded: 1 }), asJob({ jobId: "job-2", headcountNeeded: 2 })],
      customers: [{ customerId: "c-1" }] as never,
    };
    const after = {
      ...emptyHub("2026-11-05"),
      jobs: [asJob({ jobId: "job-2", headcountNeeded: 4 })],
      customers: [{ customerId: "c-1" }] as never,
    };
    const { patch, remove } = hubMutationPatch(before, after);
    assert.deepEqual(patch.jobs.map((job) => job.jobId), ["job-2"]);
    assert.equal(patch.jobs[0]?.headcountNeeded, 4);
    assert.equal(patch.customers.length, 0);
    assert.deepEqual(remove?.jobIds, ["job-1"]);
  });
});
