# Data model

The records below are the domain types in `lib/domain/types.ts`. The preview keeps them in memory. When `DYNAMODB_TABLE_NAME` is set, the same records are stored with the keys below.

One table, `GoldenHourHub`. Two indexes. Money is integer cents. Dates are `YYYY-MM-DD` in `America/Los_Angeles`. Times are local `HH:mm`. An end time of `24:00` is midnight at the end of that date. Instants are ISO-8601 UTC.

A customer is the person. A property is one house that person owns. A recurring series is not a job. Each cleaning date is its own job at one property. Each cleaner on that job has their own assignment. Accepting one date does not accept the series. A job repeats only when `seriesId` is set. `serviceType` is a label: `RECURRING`, `DEEP_CLEAN`, `MOVE_OUT`, `POST_CONSTRUCTION`, or `OTHER`.

## Keys


|                      |                    |
| -------------------- | ------------------ |
| Table                | `pk`, `sk`         |
| GSI1 `ScheduleIndex` | `gsi1pk`, `gsi1sk` |
| GSI2 `RelationIndex` | `gsi2pk`, `gsi2sk` |


GSI1 answers “what is on this date / in this status.” GSI2 answers “what belongs to this customer or cleaner.” A customer’s properties live in the customer partition, so the profile and the property list are one query.

## Items



### Cleaner profile

```
pk    CLEANER#claudia
sk    PROFILE
gsi1pk CLEANER_STATUS#ACTIVE
gsi1sk ramos#claudia
```

Fields: `cleanerId`, `firstName`, `lastName`, `email`, `mobilePhone`, `status` (`ACTIVE` or `INACTIVE`), `typicalHelperCount`, `maxHelperCount`, plus `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

Helper authorization is `maxHelperCount`. It is not a stored boolean. `maxHelperCount = 0` means no helpers. `maxHelperCount >= 1` means helpers are approved up to that number. The screen may show “Helpers approved? Yes / No”; that choice only writes the counts. Yes requires `maxHelperCount >= 1`. No writes `typicalHelperCount = 0` and `maxHelperCount = 0`.

`typicalHelperCount` and `maxHelperCount` are integers, both `>= 0`, and `typicalHelperCount <= maxHelperCount`. Crew sizes are derived and are not stored:

- `typicalCrewSize = 1 + typicalHelperCount`
- `maxCrewSize = 1 + maxHelperCount`
- helpers approved when `maxHelperCount > 0`

Claudia stores `typicalHelperCount = 1` and `maxHelperCount = 2`, so her usual crew is 2 and her maximum crew is 3. Maria stores both counts as 0, so she is always a crew of 1 and the crew stepper is not shown.

Acceptance, direct assignment, and any move into `PENDING_AVAILABILITY` or `CONFIRMED` reload this profile and use the current `maxHelperCount`. An older invitation does not keep a higher crew. A confirmed assignment is not rewritten when the maximum later changes.

### Availability window

```
pk     CLEANER#claudia
sk     AVAIL#2026-09-28#08:00#w1
gsi1pk AVAIL#2026-09-28
gsi1sk claudia#08:00#w1
```

Fields: `availabilityId`, `cleanerId`, `date`, `start`, `end`. These rows are the submitted availability. Bookings never rewrite them.

Windows that touch on the same day are one block. `08:00–11:00` and `11:00–17:00` are stored as `08:00–17:00`. A gap stays two windows. An overlap is rejected. The end must be after the start. A blank start or end is not saved.

### Availability submission

```
pk     CLEANER#claudia
sk     SUBMISSION#2026-09-28
gsi1pk SUBMISSION#2026-09-28
gsi1sk claudia
```

Fields: `submissionId`, `cleanerId`, `weekStart`, `submittedAt`, `updatedAt`. `weekStart` is the Monday of that week.

A row means the week was submitted, even when that week has zero `AVAIL` rows. Missing cleaners are active profiles minus this query.

### Customer

```
pk CUSTOMER#cust-jeff
sk PROFILE
```

Fields: `customerId`, `firstName`, `lastName`, `phone` (10 digits), optional `email`, optional `notes`, `status` (`ACTIVE` or `INACTIVE`), and the audit fields.

The person does not store an address. A customer with two houses has two property items. A customer needs at least one property.

### Property

```
pk         CUSTOMER#cust-jeff
sk         PROPERTY#prop-main
customerId cust-jeff
```

`customerId` is stored on the item as well as in the key. The customer profile loads with one query: `pk = CUSTOMER#id`, which returns `PROFILE` and every `PROPERTY#` row.

Fields: `propertyId`, optional `label` (for example “Hawthorne”), `streetAddress`, `city`, `state` (two letters), `zip` (5 digits), `bedrooms` (integer 0–20), `bathrooms` (0–20, halves allowed), `squareFeet` (integer, at least 1), `preferences`, `status` (`ACTIVE` or `INACTIVE`), and the audit fields.

House preferences live here: side gate, fragrance-free products, the cat. Visit-only notes stay on the job as special instructions.

### Customer search

The preview searches active customers in memory. An empty query returns every active customer. Text is lowercased and punctuation is collapsed to spaces.

- Name matches when the query is contained in `last first` or `first last`. “Bach” matches Jeff Bachrach. “achrach” matches too.
- Phone matches when the query has at least 3 digits and those digits are contained in the 10-digit number or its last 7.
- Address matches when the query is contained in the street, the city, or the property label.

Email is not searched. Inactive customers are left out.

The proposed table uses small prefix items for the same fields. Name and phone keys point at the customer. The address key points at the property and also stores `customerId`.

```
pk SEARCH#NAME   sk bachrach jeff#cust-jeff
pk SEARCH#NAME   sk jeff bachrach#cust-jeff
pk SEARCH#PHONE  sk 5035551234#cust-jeff
pk SEARCH#PHONE7 sk 5551234#cust-jeff
pk SEARCH#ADDR   sk 123 main st#prop-main
```

A `begins_with` query matches a prefix, not the middle of a word. The preview’s `includes` match is wider than that index. Renames and address edits delete the old search items and write the new ones in the same transaction as the profile or property update. Historical jobs are not part of that transaction.

### Recurring series

```
pk     SERIES#series-jeff
sk     PROFILE
gsi1pk SERIES#ACTIVE
gsi1sk 2026-10-20#series-jeff
gsi2pk CUSTOMER#cust-jeff
gsi2sk SERIES#series-jeff
```

`gsi1sk` starts with `generatedThroughDate` so the daily generator can find active series that are behind. The field is optional until the first run.

The recurrence object is:

```
frequency     WEEK or MONTH
interval      1, 2, or 4 for WEEK. 1 for MONTH
daysOfWeek    optional, e.g. ["SATURDAY"]
weekOrdinals  optional, e.g. [1, 3] or ["LAST"]
dayOfMonth    optional, e.g. 15
```

Weekly rules use `daysOfWeek`. Monthly rules use either `dayOfMonth` or `weekOrdinals` plus `daysOfWeek`, not both. The screen shows a sentence such as “Every 1st and 3rd Saturday of the month.” It does not show a recurrence-rule string. The start date has to fall on that pattern.

Also stored: `customerId`, `propertyId`, `startDate`, `endMode` (`UNTIL_CANCELED` or `END_ON_DATE`), optional `endDate`, `defaultHeadcountNeeded`, default arrival window, `defaultExpectedDurationMinutes`, `defaultServiceType`, optional `defaultSpecialInstructions`, `staffingTemplateMode` (`INVITE`, `DIRECT`, or `BLANK`), `staffingTemplate`, `status` (`ACTIVE` or `INACTIVE`), optional `generatedThroughDate`, and audit fields.

A series belongs to one property. New occurrences copy that property.

A template entry is not a booking. It holds `cleanerId`, `proposedCrewSize`, arrival window, duration, `payType`, and `payPerPersonCents`.

### Occurrence lock

```
pk    SERIES#series-jeff
sk    OCCUR#2026-10-20
jobId job-johnson
```

This item is the table’s copy of “this series already has this date.” The domain skips a date that is already in that set. Written with `attribute_not_exists(pk)`. A second generator run for that series and date fails the condition and skips the job.

Query `pk = SERIES#id` and `sk begins_with OCCUR#` to list occurrence dates, then batch-get the jobs.

### Job

```
pk     JOB#job-johnson
sk     PROFILE
gsi1pk JOBDATE#2026-10-20
gsi1sk job-johnson
gsi2pk CUSTOMER#cust-jeff
gsi2sk JOB#2026-10-20#job-johnson
```

Fields: `jobId`, `customerId`, `propertyId`, optional `seriesId`, `serviceType`, `date`, `headcountNeeded`, `snapshot`, `specialInstructions`, `status` (`SCHEDULED` or `CANCELED`), and audit fields.

Confirmed headcount is not stored. It is the sum of `confirmedCrewSize` on `CONFIRMED` assignments for that job.

### Snapshot on the job

Copied when the job is created. Later edits to the customer or the property do not change it.

- `customerDisplayName`, `phone`, optional `email`
- `propertyId`, optional `propertyLabel`
- `streetAddress`, `city`, `state`, `zip`
- `bedrooms`, `bathrooms`, `squareFeet`
- `preferences`

The live property is the current house. The snapshot is what applied to that cleaning. Special instructions stay on the job, separate from house preferences.

### Assignment

```
pk     JOB#job-johnson
sk     ASSIGN#as-claudia-johnson
gsi1pk CLEANER#claudia
gsi1sk 2026-10-20#as-claudia-johnson
```

Fields: `assignmentId`, `jobId`, `cleanerId`, `serviceDate`, `status`, `proposedCrewSize`, optional `pendingCrewSize`, optional `confirmedCrewSize`, optional `attentionReason`, `arrivalWindowStart`, `arrivalWindowEnd`, `expectedDurationMinutes`, `payType` (`FLAT` or `HOURLY`), `payPerPersonCents`, `proposedTotalPayCents`, optional `confirmedTotalPayCents`, optional `invitedAt`, optional `respondedAt`, `createdAt`, `updatedAt`.

Statuses: `INVITED`, `PENDING_AVAILABILITY`, `CONFIRMED`, `NEEDS_ATTENTION`, `DECLINED`, `CANCELED`, `EXPIRED_JOB_FILLED`.

`pendingCrewSize` is the crew the cleaner or admin committed before that week’s availability could be checked. `confirmedCrewSize` is set only when the status is `CONFIRMED`. `attentionReason` is set when the status is `NEEDS_ATTENTION`. Confirmed headcount ignores every status except `CONFIRMED`.

There is no recurring-assignment record. A series template is copied into a new assignment per job. `serviceDate` is the job date, stored here so a cleaner’s week can be loaded from GSI1 without reading every job first.

`payPerPersonCents` is cents per person for a flat job, or cents per person per hour. `proposedTotalPayCents` and `confirmedTotalPayCents` multiply that rate by the crew size. For `HOURLY` the total is the crew rate per hour, not a finished invoice.

The blocked range is not stored. It starts at `arrivalWindowStart`. It ends at `arrivalWindowEnd` plus `expectedDurationMinutes`. If the arrival window ends at or before it starts, the window end is the next calendar day. A job’s displayed cleaning span is the earliest of those starts through the latest of those ends, counting only `INVITED` and `CONFIRMED` assignments.

## Access patterns


| Need                               | How                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Cleaner by id                      | Get `CLEANER#id` / `PROFILE`                                                |
| Active cleaners                    | Query GSI1 `CLEANER_STATUS#ACTIVE`                                          |
| One cleaner’s week of availability | Query `CLEANER#id`, `sk` between `AVAIL#weekStart` and `AVAIL#weekEnd`      |
| Everyone’s availability on a date  | Query GSI1 `AVAIL#date`                                                     |
| Submission for a week              | Get `SUBMISSION#weekStart`, or query GSI1 `SUBMISSION#weekStart`            |
| Customer by id, with properties    | Query `CUSTOMER#id`                                                         |
| One property                       | Get `CUSTOMER#id` / `PROPERTY#id`                                           |
| Customer search                    | Match name, phone, street, city, and property label as above                |
| Jobs for a customer                | Query GSI2 `CUSTOMER#id`, `sk begins_with JOB#`, then group by `propertyId` |
| Series for a customer              | Query GSI2 `CUSTOMER#id`, `sk begins_with SERIES#`                          |
| Series by id                       | Get `SERIES#id` / `PROFILE`                                                 |
| Active series to generate          | Query GSI1 `SERIES#ACTIVE`                                                  |
| Jobs on a date                     | Query GSI1 `JOBDATE#date`                                                   |
| Assignments on a job               | Query `JOB#id`, `sk begins_with ASSIGN#`                                    |
| One cleaner’s assignments          | Query GSI1 `CLEANER#id`, `sk begins_with` the date                          |
| Confirmed conflicts                | That cleaner query, keep `CONFIRMED`, compare blocked ranges                |




## Assignment states

These are separate steps: create the job occurrence, create the invitation or intended assignment, record the cleaner’s intent, validate the schedule, then confirm.


| From                                                                                       | When                                                                                                            | To                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `INVITED`                                                                                  | Cleaner accepts, that week is already submitted, and crew, headcount, availability, conflicts, and pay all pass | `CONFIRMED`                                  |
| `INVITED`                                                                                  | Cleaner accepts, that week is not submitted yet, and the current crew ceiling and remaining headcount pass      | `PENDING_AVAILABILITY`                       |
| `INVITED`                                                                                  | Cleaner accepts, that week is submitted, and a check fails                                                      | stays `INVITED`; the cleaner sees the reason |
| `INVITED`                                                                                  | Cleaner declines                                                                                                | `DECLINED`                                   |
| `PENDING_AVAILABILITY`                                                                     | That week is submitted and every check passes                                                                   | `CONFIRMED`                                  |
| `PENDING_AVAILABILITY`                                                                     | That week is submitted and a check fails                                                                        | `NEEDS_ATTENTION`                            |
| `INVITED` or `PENDING_AVAILABILITY`                                                        | Confirmed people reach `headcountNeeded`                                                                        | `EXPIRED_JOB_FILLED`                         |
| Direct template, week already submitted and valid                                          | Generation                                                                                                      | `CONFIRMED`                                  |
| Direct template, week not submitted                                                        | Generation                                                                                                      | `PENDING_AVAILABILITY`                       |
| Direct or invite template, cleaner inactive or crew above the current maximum              | Generation                                                                                                      | `NEEDS_ATTENTION`                            |
| Direct template, week submitted but headcount, availability, or a confirmed conflict fails | Generation                                                                                                      | `NEEDS_ATTENTION`                            |


`NEEDS_ATTENTION` is the flag for admin and cleaner. The app does not confirm it, does not change the cleaner’s availability, and does not double-book. A confirmed row stays confirmed when `maxHelperCount` later changes.

## Accepting an invitation

Read the job, the invitation, the cleaner’s current profile, that cleaner’s confirmed assignments, and whether the week containing the job date has a submission.

Crew is checked before availability:

- the assignment is `INVITED` and belongs to this cleaner and this job
- the job is `SCHEDULED` and the cleaner is `ACTIVE`
- `1 <= requestedCrewSize <= 1 + current maxHelperCount`
- the requested crew fits the headcount still open

If that week has no submission and those checks pass, the assignment becomes `PENDING_AVAILABILITY` with `pendingCrewSize`. It is not schedule-confirmed.

If that week is submitted, the blocked range must sit inside the submitted windows and must not overlap another confirmed job. Then the assignment becomes `CONFIRMED`, with `confirmedCrewSize`, `confirmedTotalPayCents`, and `respondedAt`. Pay is computed from `payPerPersonCents` on the assignment, not from a total sent by the phone. A solo cleaner sending `2` is rejected before that write.

If the confirmed people now meet `headcountNeeded`, the other `INVITED` and `PENDING_AVAILABILITY` assignments on that job become `EXPIRED_JOB_FILLED` in the same update.

After a cleaner submits a week, each of that cleaner’s `PENDING_AVAILABILITY` rows in that Monday–Sunday week is checked again with the current profile. A row that fits becomes `CONFIRMED`. A row that does not fit becomes `NEEDS_ATTENTION` with `attentionReason`. Confirmed history is not rewritten.

The preview does this in one memory update. A database write has to apply the same headcount check atomically, so two cleaners cannot both take the last open spots. The second one sees “This job was just filled.”

## Generation

Once a day, and again whenever the app loads, each `ACTIVE` series is filled through today + 56 days (`today + 8 weeks`), stopping earlier at `endDate` when there is one. Dates before today are not backfilled. An `INACTIVE` series gets no new jobs. Existing jobs and assignments stay.

For each date the recurrence rule produces inside that window, skip it when that series already has the date. Otherwise one transaction:

1. Put `OCCUR#date` with `attribute_not_exists(pk)`.
2. Put the job, including a fresh snapshot of the customer and that series’ property. The job id is `job-{seriesId}-{date}`.
3. Put the assignment rows from the staffing template.

The 8-week horizon limits how far ahead job rows exist. It does not limit which of those jobs may be invited. There is no 14-day invitation cutoff, and an invitation does not require that week’s availability to exist.

`INVITE` creates an `INVITED` assignment when the cleaner is active and `proposedCrewSize <= 1 + current maxHelperCount`, even if that week has no submission. `BLANK` creates the job with no assignments. `DIRECT` creates `CONFIRMED` only when the cleaner is active, the crew size is legal for the current maximum, the crew still fits `headcountNeeded`, that week’s availability was submitted, the block sits inside it, and it does not overlap another confirmed job. If that week is not submitted, `DIRECT` creates `PENDING_AVAILABILITY` with `pendingCrewSize` and does not confirm it. Any other failure creates `NEEDS_ATTENTION` with `attentionReason`, so the intended cleaner stays visible.

A staffing template is checked against the current `maxHelperCount` when it is applied. It is not permanent authorization. The same current maximum is read again when the assignment becomes `PENDING_AVAILABILITY` or `CONFIRMED`.

If the lock exists, the whole transaction is skipped. Running the generator twice does not create a second job for that series and date.

## What a series edit is allowed to change

`THIS_ONLY` updates that date. The series row stays as it was.

`THIS_AND_FUTURE` updates the series and every occurrence date on or after the chosen date. Earlier dates stay as they were.

Stopping future generation sets the series to `INACTIVE`. It does not delete history.