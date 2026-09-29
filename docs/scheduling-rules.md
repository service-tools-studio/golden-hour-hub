# Scheduling rules

Business timezone: `America/Los_Angeles`. Recurrence uses calendar dates, not “add 24 hours,” so daylight saving does not slide a Monday onto Sunday.

## Availability

Submitted availability is what the cleaner said. Confirming a job does not change those rows.

Effective availability is submitted availability minus confirmed assignments only. Invited, pending, needs-attention, declined, canceled, expired, and filled assignments do not block time.

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

Confirmed headcount is the sum of `confirmedCrewSize` on `CONFIRMED` assignments. `PENDING_AVAILABILITY` does not use a spot.

Only an admin changes `typicalHelperCount` and `maxHelperCount`. Helper approval is derived: `maxHelperCount > 0`. Crew sizes are derived: typical crew is `1 + typicalHelperCount`, and the maximum crew is `1 + maxHelperCount`. `typicalHelperCount` cannot exceed `maxHelperCount`.

A cleaner with `maxHelperCount = 0` is always one person. They do not see helper wording or a crew stepper. The server rejects a crew size other than 1, including a request that the screen did not offer.

A cleaner with `maxHelperCount > 0` may choose fewer people than their typical crew, or more, up to `min(1 + maxHelperCount, remaining headcount)`. They cannot pass the current maximum. The server reloads the profile at acceptance and at every later confirmation. An invitation that proposed a crew of 3 does not still allow 3 after the maximum is lowered to 1. A confirmed assignment keeps the crew it already has.

Admins use the same ceiling for direct assignment and for a recurring staffing template. They cannot set a crew above `1 + current maxHelperCount` or above the spots still open.

Helpers do not get accounts, availability, acceptance actions, or their own pay rows. The primary cleaner is paid for the crew. Changing the crew inside the allowed range recalculates that pay from the stored per-person rate.

Admins may invite more people than the job needs. The first valid confirmations fill the job. When it is full, remaining `INVITED` and `PENDING_AVAILABILITY` rows become `EXPIRED_JOB_FILLED`.

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

Once a day, and whenever the schedule is loaded, for each active series:

- Build occurrence dates from the series start through today + 8 weeks (56 days), and stop at `endDate` when there is one.
- Skip dates before today. Do not backfill a missed past date.
- Skip any date that already has a job for that series, which the table stores as an `OCCUR#date` lock.
- Create a job for each missing date, with a snapshot of the customer and the series property as they are at generation time.
- Apply the staffing template using the cleaner’s current `maxHelperCount`.

The horizon is how far ahead job occurrences exist. It is not a limit on invitations. Admins may invite any generated occurrence inside those 8 weeks. Creating or sending that invitation does not require the cleaner’s availability for that week. The generator does not create years of future jobs. It stops when the series is stopped or canceled. Historical jobs and assignments stay. Running it again does not create a second job for the same series and date.

### Future staffing

**Copy cleaners and send invitations.** Each new occurrence gets a new `INVITED` assignment when the cleaner is active and the template crew fits the current maximum. The cleaner can accept a later week before submitting availability. That acceptance becomes `PENDING_AVAILABILITY`: they intend to take the cleaning, and it is not schedule-confirmed yet. Accepting one date does not confirm the next. If the week is already submitted, acceptance runs the normal availability, conflict, crew, headcount, and pay checks and becomes `CONFIRMED` only when they pass.

**Copy cleaners and assign directly.** Used when the cleaner already agreed to the standing schedule. The new assignment is `CONFIRMED` only when all of these are true:

- the cleaner is active
- the crew size is legal for the current `maxHelperCount`
- the confirmed people on that job would not pass `headcountNeeded`
- that week’s availability has been submitted
- the blocked time sits inside that availability
- it does not overlap another confirmed job

If that week is not submitted yet, the assignment is `PENDING_AVAILABILITY` with the intended crew. The admin can see who the standing cleaner is. It is not treated as schedule-confirmed. If the week is submitted and a check fails, the assignment is `NEEDS_ATTENTION` with the reason, for example: “This recurring cleaning could not be assigned to Claudia because it conflicts with another confirmed job.” The job still exists. The app does not confirm it and does not change the cleaner’s availability.

When the cleaner later submits that week, pending rows in the week are checked again. A fit becomes `CONFIRMED`. A conflict becomes `NEEDS_ATTENTION`.

**Leave future cleanings unassigned.** Jobs are created with no assignments and show as needing staffing.

## Edits and cancellation

Editing or canceling one occurrence does not change the series and does not change other dates.

“This and future cleanings” updates the series and scheduled jobs on or after the chosen date. Dates before that stay as they were, including crew size and pay. Confirmed assignment pay on a future job is also left alone. Invitation rows that are still `INVITED` may take the new template. Confirmed future assignments that no longer match the template are listed for the admin instead of being silently rewritten.

Canceling one cleaning sets that job and its assignments to canceled. The series keeps generating.

Pause / stop future cleanings sets the series inactive so generation stops. It does not delete old jobs or old assignments.

Cancel this and future cleanings cancels the chosen job and later scheduled jobs, cancels their assignments, and sets the series inactive.

An inactive series does not get new jobs. History stays.
