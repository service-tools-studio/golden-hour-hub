# Scheduling rules

Business timezone: `America/Los_Angeles`. Recurrence uses calendar dates, not “add 24 hours,” so daylight saving does not slide a Monday onto Sunday.

## Availability

Submitted availability is what the cleaner said. Confirming a job does not change those rows.

Effective availability is submitted availability minus confirmed assignments only. Invited, declined, canceled, expired, and filled assignments do not block time.

A cleaner may hold overlapping invitations. They cannot confirm a second job that overlaps a confirmed one.

Each assignment has its own arrival window and duration.

```
blocked start = arrival window start
blocked end   = arrival window end + expected duration
```

Two cleaners on the same job may have different windows. The block is calculated per cleaner.

Weekly submission is its own record. A week with zero available hours still counts as submitted once that record exists.

The week being requested is the next Monday–Sunday week. From Saturday Sep 26, 2026 that is Sep 28–Oct 4. The deadline is the Sunday before that Monday.

Cleaners may edit a submitted week. The save is rejected when any confirmed block would fall outside the new windows:

“You already have a cleaning scheduled during this time. Please call Kelsey if you need to change your availability.”

The app does not cancel or move the confirmed job.

## Helper approval and headcount

`headcountNeeded` is people at the property, not the number of assignment rows.

Confirmed headcount is the sum of `confirmedCrewSize` on `CONFIRMED` assignments.

Only an admin changes `helpersApproved`, `typicalHelperCount`, and `typicalCrewSize`.

A cleaner who is not helper-approved is always one person. They do not see a crew stepper. The server rejects a crew size other than 1, including a request that the screen did not offer.

A helper-approved cleaner may lower or raise the proposed crew before accepting. The minimum is 1. The maximum is the headcount still open. Helpers do not get accounts, availability, or their own pay rows. The primary cleaner is paid for the crew.

Admins may invite more people than the job needs. The first valid confirmations fill the job. When it is full, remaining invitations become `EXPIRED_JOB_FILLED`.

Two confirms of the last spot cannot both succeed. The job update is conditional: `confirmedHeadcount + requested crew <= headcountNeeded`, in the same transaction as the status change.

## Pay

The server multiplies the stored per-person rate by the confirmed crew. It ignores a total typed or hidden in the browser.

Flat example: proposed crew 2 and $100 total stores $50 per person.

- Confirm 1 → $50
- Confirm 2 → $100
- Confirm 3 → $150

Hourly example: $35 per person. A crew of 2 is $70 per hour for that primary cleaner.

Generated assignments copy the rate onto themselves. Editing the series template later does not change a rate already stored on an older assignment.

After confirmation, the cleaner cannot change crew size or cancel in the app. The screen tells them to call Kelsey.

## Recurring generation

Once a day, for each active series:

- Build occurrence dates from the series start through today + 8 weeks, and stop at `endDate` when there is one.
- Skip any date that already has an `OCCUR#date` lock.
- Create a job for each missing date, with a snapshot of the customer and the series property as they are at generation time.
- Apply the staffing template.

Eight weeks is long enough to staff ahead and short enough that the table does not fill with unused years. The generator is safe to run twice.

Invitation text messages go out only when the new occurrence is within the next 14 days. Later invitations still exist in the app, under Action Required, when that week is close. Far-future texts are not sent just because the job row exists.

### Future staffing

**Copy cleaners and send invitations.** Each new occurrence gets new `INVITED` assignments. The cleaner must accept that date. Accepting one date does not confirm the next. This is the default.

**Copy cleaners and assign directly.** Used when the cleaner already agreed to the standing schedule. The new assignment is `CONFIRMED` only when all of these are true:

- the cleaner is active
- the crew size is legal for their helper approval
- the confirmed people on that job would not pass `headcountNeeded`
- that week’s availability has been submitted
- the blocked time sits inside that availability
- it does not overlap another confirmed job

If any check fails, the job is still created and marked as needing attention. The assignment is not confirmed. The reason is kept on the job, for example: “This recurring cleaning could not be assigned to Claudia because it conflicts with another confirmed job.” A missing availability submission is not treated as a yes.

**Leave future cleanings unassigned.** Jobs are created with no assignments and show as needing staffing.

## Edits and cancellation

Editing or canceling one occurrence does not change the series and does not change other dates.

“This and future cleanings” updates the series and scheduled jobs on or after the chosen date. Dates before that stay as they were, including crew size and pay. Confirmed assignment pay on a future job is also left alone. Invitation rows that are still `INVITED` may take the new template. Confirmed future assignments that no longer match the template are listed for the admin instead of being silently rewritten.

Canceling one cleaning sets that job and its assignments to canceled. The series keeps generating.

Pause / stop future cleanings sets the series inactive so generation stops. It does not delete old jobs or old assignments.

Cancel this and future cleanings cancels the chosen job and later scheduled jobs, cancels their assignments, and sets the series inactive.

An inactive series does not get new jobs. History stays.
