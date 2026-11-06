import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Job, JobAssignment } from "../domain/types.ts";
import { emptyHub } from "../mock/seed.ts";
import { addJobCleanerOnHub, removeJobCleanerOnHub } from "./admin-hub-appliers.ts";
import { buildJobDraftPersistPlan, buildJobRosterPersistPlan, jobCleanerRemoveIsDraftOnly } from "./job-draft-persist-plan.ts";

const STAMP = "2026-10-01T12:00:00.000Z";

function testJob(jobId: string): Job {
  return {
    jobId,
    date: "2026-11-10",
    customerId: "cust-1",
    propertyId: "prop-1",
    snapshot: {
      customerDisplayName: "Jeff",
      streetAddress: "1 Main",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    serviceType: "RECURRING",
    status: "DRAFT",
    headcountNeeded: 1,
    expectedDurationMinutes: 240,
    draftCleanerIds: [],
    createdAt: STAMP,
    createdBy: "kelsey",
    updatedAt: STAMP,
    updatedBy: "kelsey",
  };
}

describe("job draft persist plan", () => {
  it("buildJobDraftPersistPlan puts one job row", () => {
    const hub = {
      ...emptyHub("2026-11-05"),
      jobs: [testJob("job-1")],
      cleaners: [
        {
          cleanerId: "ada",
          firstName: "Ada",
          lastName: "Cleaner",
          email: "ada@test.com",
          mobilePhone: "5035550100",
          status: "ACTIVE" as const,
          typicalHelperCount: 0,
          maxHelperCount: 0,
          typicalHourlyRateCents: 3000,
          createdAt: STAMP,
          createdBy: "kelsey",
          updatedAt: STAMP,
          updatedBy: "kelsey",
        },
      ],
    };
    const after = addJobCleanerOnHub(hub, "job-1", "ada");
    assert.equal(after.ok, true);
    if (!after.ok) return;
    const plan = buildJobDraftPersistPlan(after.hub, "job-1");
    assert.equal(plan.puts.length, 1);
    assert.equal(plan.puts[0]?.entity, "job");
    assert.equal(plan.puts[0]?.pk, "JOB#job-1");
    assert.equal(plan.deletes.length, 0);
    assert.deepEqual(after.hub.jobs[0]?.draftCleanerIds, ["ada"]);
  });

  it("jobCleanerRemoveIsDraftOnly is false when a live assignment exists", () => {
    const assignment: JobAssignment = {
      assignmentId: "a-1",
      jobId: "job-1",
      cleanerId: "ada",
      status: "INVITED",
      serviceDate: "2026-11-10",
      proposedCrewSize: 1,
      payType: "FLAT",
      payPerPersonCents: 10000,
      createdAt: STAMP,
      updatedAt: STAMP,
    };
    const hub = {
      ...emptyHub("2026-11-05"),
      jobs: [testJob("job-1")],
      assignments: [assignment],
    };
    assert.equal(jobCleanerRemoveIsDraftOnly(hub, "job-1", "ada"), false);
  });

  it("jobCleanerRemoveIsDraftOnly is true for draft-only roster", () => {
    const hub = {
      ...emptyHub("2026-11-05"),
      jobs: [{ ...testJob("job-1"), draftCleanerIds: ["ada"] }],
      assignments: [],
    };
    assert.equal(jobCleanerRemoveIsDraftOnly(hub, "job-1", "ada"), true);
  });

  it("buildJobRosterPersistPlan includes canceled assignment puts on remove", () => {
    const assignment: JobAssignment = {
      assignmentId: "a-1",
      jobId: "job-1",
      cleanerId: "ada",
      status: "INVITED",
      serviceDate: "2026-11-10",
      proposedCrewSize: 1,
      payType: "FLAT",
      payPerPersonCents: 10000,
      createdAt: STAMP,
      updatedAt: STAMP,
    };
    const cleaner = {
      cleanerId: "ada",
      firstName: "Ada",
      lastName: "Cleaner",
      email: "ada@test.com",
      mobilePhone: "5035550100",
      status: "ACTIVE" as const,
      typicalHelperCount: 0,
      maxHelperCount: 0,
      typicalHourlyRateCents: 3000,
      createdAt: STAMP,
      createdBy: "kelsey",
      updatedAt: STAMP,
      updatedBy: "kelsey",
    };
    const before = {
      ...emptyHub("2026-11-05"),
      jobs: [{ ...testJob("job-1"), draftCleanerIds: ["ada"] }],
      cleaners: [cleaner],
      assignments: [assignment],
    };
    const after = removeJobCleanerOnHub(before, "job-1", "ada");
    assert.equal(after.ok, true);
    if (!after.ok) return;
    const plan = buildJobRosterPersistPlan(before, after.hub, "job-1");
    assert.ok(plan.puts.some((item) => item.entity === "job"));
    assert.ok(plan.puts.some((item) => item.entity === "assignment" && item.status === "CANCELED"));
  });
});
