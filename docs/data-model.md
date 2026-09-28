# Data model

The records below are the domain types in `lib/domain/types.ts`. The preview keeps them in memory. DynamoDB is not connected. The keys are the proposed layout for those same records.

One table, `GoldenHourHub`. Two indexes. Money is integer cents. Dates are `YYYY-MM-DD` in `America/Los_Angeles`. Times are local `HH:mm`. An end time of `24:00` is midnight at the end of that date. Instants are ISO-8601 UTC.

A customer is the person. A property is one house that person owns. A recurring series is not a job. Each cleaning date is its own job at one property. Each cleaner on that job has their own assignment. Accepting one date does not accept the series. A job repeats only when `seriesId` is set. `serviceType` is a label: `RECURRING`, `DEEP_CLEAN`, `MOVE_OUT`, `POST_CONSTRUCTION`, or `OTHER`.

## Keys

| | |
| --- | --- |
| Table | `pk`, `sk` |
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

Fields: `cleanerId`, `firstName`, `lastName`, `email`, `mobilePhone`, `status` (`ACTIVE` or `INACTIVE`), `helpersApproved`, `typicalHelperCount`, `typicalCrewSize`, plus `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

`helpersApproved` lives only here. Assignments do not copy it. Acceptance reads the profile immediately before the write.

If `helpersApproved` is false, `typicalHelperCount` is 0 and `typicalCrewSize` is 1. If true, `typicalHelperCount` is an integer from 0 to 8 and `typicalCrewSize` is `1 + typicalHelperCount`.

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

Fields: `assignmentId`, `jobId`, `cleanerId`, `serviceDate`, `status`, `proposedCrewSize`, optional `confirmedCrewSize`, `arrivalWindowStart`, `arrivalWindowEnd`, `expectedDurationMinutes`, `payType` (`FLAT` or `HOURLY`), `payPerPersonCents`, `proposedTotalPayCents`, optional `confirmedTotalPayCents`, optional `invitedAt`, optional `respondedAt`, `createdAt`, `updatedAt`.

Statuses: `INVITED`, `CONFIRMED`, `DECLINED`, `CANCELED`, `EXPIRED_JOB_FILLED`.

There is no recurring-assignment record. A series template is copied into a new assignment per job. `serviceDate` is the job date, stored here so a cleaner’s week can be loaded from GSI1 without reading every job first.

`payPerPersonCents` is cents per person for a flat job, or cents per person per hour. `proposedTotalPayCents` and `confirmedTotalPayCents` multiply that rate by the crew size. For `HOURLY` the total is the crew rate per hour, not a finished invoice.

The blocked range is not stored. It starts at `arrivalWindowStart`. It ends at `arrivalWindowEnd` plus `expectedDurationMinutes`. If the arrival window ends at or before it starts, the window end is the next calendar day. A job’s displayed cleaning span is the earliest of those starts through the latest of those ends, counting only `INVITED` and `CONFIRMED` assignments.

## Access patterns

| Need | How |
| --- | --- |
| Cleaner by id | Get `CLEANER#id` / `PROFILE` |
| Active cleaners | Query GSI1 `CLEANER_STATUS#ACTIVE` |
| One cleaner’s week of availability | Query `CLEANER#id`, `sk` between `AVAIL#weekStart` and `AVAIL#weekEnd` |
| Everyone’s availability on a date | Query GSI1 `AVAIL#date` |
| Submission for a week | Get `SUBMISSION#weekStart`, or query GSI1 `SUBMISSION#weekStart` |
| Customer by id, with properties | Query `CUSTOMER#id` |
| One property | Get `CUSTOMER#id` / `PROPERTY#id` |
| Customer search | Match name, phone, street, city, and property label as above |
| Jobs for a customer | Query GSI2 `CUSTOMER#id`, `sk begins_with JOB#`, then group by `propertyId` |
| Series for a customer | Query GSI2 `CUSTOMER#id`, `sk begins_with SERIES#` |
| Series by id | Get `SERIES#id` / `PROFILE` |
| Active series to generate | Query GSI1 `SERIES#ACTIVE` |
| Jobs on a date | Query GSI1 `JOBDATE#date` |
| Assignments on a job | Query `JOB#id`, `sk begins_with ASSIGN#` |
| One cleaner’s assignments | Query GSI1 `CLEANER#id`, `sk begins_with` the date |
| Confirmed conflicts | That cleaner query, keep `CONFIRMED`, compare blocked ranges |

## Accepting an invitation

Read the job, the invitation, the cleaner profile, that cleaner’s confirmed assignments, and their availability.

The invitation can be accepted only when all of these are true:

- the assignment is `INVITED` and belongs to this cleaner and this job
- the job is `SCHEDULED` and the cleaner is `ACTIVE`
- the requested crew size is a positive integer, is `1` when the cleaner is not helper-approved, and fits the headcount still open
- the blocked range sits inside submitted availability
- it does not overlap another confirmed job for that cleaner

Then the assignment becomes `CONFIRMED`, with `confirmedCrewSize`, `confirmedTotalPayCents`, and `respondedAt`. Pay is computed from `payPerPersonCents` on the assignment, not from a total sent by the phone. A solo cleaner sending `2` is rejected before that write.

If the confirmed people now meet `headcountNeeded`, the other `INVITED` assignments on that job become `EXPIRED_JOB_FILLED` in the same update.

The preview does this in one memory update. A database write has to apply the same headcount check atomically, so two cleaners cannot both take the last open spots. The second one sees “This job was just filled.”

## Generation

For each date the recurrence rule produces, skip it when that series already has the date. Otherwise one transaction:

1. Put `OCCUR#date` with `attribute_not_exists(pk)`.
2. Put the job, including a fresh snapshot of the customer and that series’ property.
3. Put the assignment rows from the staffing template.

`INVITE` copies each valid template entry as a new `INVITED` assignment. `BLANK` creates the job with no assignments. `DIRECT` confirms an entry only when the cleaner is active, the crew size is legal, the crew still fits `headcountNeeded`, that week’s availability was submitted, the block sits inside it, and it does not overlap another confirmed job. A failed direct entry is left off the job. The reason comes back beside the assignments. It is not a field on the job.

If the lock exists, the whole transaction is skipped. Running the generator twice does not create a second job for that series and date.

## What a series edit is allowed to change

`THIS_ONLY` updates that date. The series row stays as it was.

`THIS_AND_FUTURE` updates the series and every occurrence date on or after the chosen date. Earlier dates stay as they were.

Stopping future generation sets the series to `INACTIVE`. It does not delete history.
