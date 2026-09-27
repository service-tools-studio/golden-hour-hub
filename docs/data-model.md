# Data model

This is the proposed DynamoDB design. It is not implemented yet.

One table, `GoldenHourHub`. Two indexes. A handful of item types. Money is integer cents. Dates are `YYYY-MM-DD` in `America/Los_Angeles`. Instants are ISO-8601 UTC.

A customer is the person. A property is one house that person owns. A recurring series is not a job. Each cleaning date is its own job at one property. Each cleaner on that job has their own assignment. Accepting one date does not accept the series.

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

Fields: `firstName`, `lastName`, `email`, `mobilePhone`, `status`, `helpersApproved`, `typicalHelperCount`, `typicalCrewSize`, plus `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

`helpersApproved` lives only here. Assignments do not copy it. Acceptance reads the profile immediately before the write.

If `helpersApproved` is false, `typicalHelperCount` is 0 and `typicalCrewSize` is 1. If true, `typicalCrewSize` is `1 + typicalHelperCount`.

### Availability window

```
pk     CLEANER#claudia
sk     AVAIL#2026-09-28#08:00#w1
gsi1pk AVAIL#2026-09-28
gsi1sk claudia#08:00#w1
```

`start` and `end` are local `HH:mm`. These rows are the submitted availability. Bookings never rewrite them.

### Availability submission

```
pk     CLEANER#claudia
sk     SUBMISSION#2026-09-28
gsi1pk SUBMISSION#2026-09-28
gsi1sk claudia
```

A row means the week was submitted, even when that week has zero `AVAIL` rows. Missing cleaners are active profiles minus this query.

### Customer

```
pk CUSTOMER#cust-jeff
sk PROFILE
```

Fields: `firstName`, `lastName`, `phone` (10 digits), `email`, `status`, and the audit fields.

The person does not store an address. A customer with two houses has two property items.

### Property

```
pk         CUSTOMER#cust-jeff
sk         PROPERTY#prop-main
customerId cust-jeff
```

`customerId` is stored on the item as well as in the key. The customer profile loads with one query: `pk = CUSTOMER#id`, which returns `PROFILE` and every `PROPERTY#` row.

Fields: optional `label` (for example “Hawthorne”), `streetAddress`, `city`, `state`, `zip`, `bedrooms`, `bathrooms`, `squareFeet`, `preferences`, `status` (`ACTIVE` or `INACTIVE`), and the audit fields.

House preferences live here: side gate, fragrance-free products, the cat. Visit-only notes stay on the job as special instructions.

### Customer search items

Golden Hour will have hundreds of customers, not hundreds of thousands. Search is prefix matching on small items. No OpenSearch.

```
pk SEARCH#NAME   sk bachrach jeff#cust-jeff
pk SEARCH#NAME   sk jeff bachrach#cust-jeff
pk SEARCH#PHONE  sk 5035551234#cust-jeff
pk SEARCH#PHONE7 sk 5551234#cust-jeff
pk SEARCH#ADDR   sk 123 main st#prop-main
```

Name and phone keys point at the customer. The address key points at the property and also stores `customerId`, so a street search opens that person’s profile on the matching house.

The app lowercases text, collapses punctuation, and queries `begins_with`. “Bach” matches the last-name key. “5551234” matches the last-seven phone key. A middle-of-the-word query such as “achrach” will not match. That is acceptable at this size.

Renames, and address edits, delete the old search items and write the new ones in the same transaction as the profile or property update. Historical jobs are not part of that transaction.

### Recurring series

```
pk     SERIES#series-jeff
sk     PROFILE
gsi1pk SERIES#ACTIVE
gsi1sk 2026-10-20#series-jeff
gsi2pk CUSTOMER#cust-jeff
gsi2sk SERIES#series-jeff
```

`gsi1sk` starts with `generatedThroughDate` so the daily generator can find active series that are behind.

The recurrence object is:

```
frequency     WEEK or MONTH
interval      1, 2, or 4 for WEEK. 1 for MONTH
daysOfWeek    optional, e.g. ["SATURDAY"]
weekOrdinals  optional, e.g. [1, 3] or ["LAST"]
dayOfMonth    optional, e.g. 15
```

Weekly rules use `daysOfWeek`. Monthly rules use either `dayOfMonth` or `weekOrdinals` plus `daysOfWeek`, not both. The screen shows a sentence such as “Every 1st and 3rd Saturday of the month.” It does not show a recurrence-rule string.

Also stored: `customerId`, `propertyId`, `startDate`, `endMode` (`UNTIL_CANCELED` or `END_ON_DATE`), optional `endDate`, default headcount, default arrival window, default duration, default service type, default instructions, `staffingTemplateMode` (`INVITE`, `DIRECT`, or `BLANK`), `staffingTemplate`, `status`, and audit fields.

A series belongs to one property. New occurrences copy that property.

A template entry is not a booking. It holds `cleanerId`, `proposedCrewSize`, arrival window, duration, `payType`, and `payPerPersonCents`.

### Occurrence lock

```
pk    SERIES#series-jeff
sk    OCCUR#2026-10-20
jobId job_01H...
```

Written with `attribute_not_exists(pk)`. A second generator run for that series and date fails the condition and skips the job. That is the duplicate protection.

Query `pk = SERIES#id` and `sk begins_with OCCUR#` to list occurrence dates, then batch-get the jobs.

### Job

```
pk     JOB#job_01H
sk     PROFILE
gsi1pk JOBDATE#2026-10-20
gsi1sk job_01H
gsi2pk CUSTOMER#cust-jeff
gsi2sk JOB#2026-10-20#job_01H
```

Fields: `customerId`, `propertyId`, optional `seriesId`, `serviceType`, `date`, `headcountNeeded`, `confirmedHeadcount`, `snapshot`, `specialInstructions`, `status` (`SCHEDULED` or `CANCELED`), optional `staffingAttention` and `staffingAttentionReason`, and audit fields.

`confirmedHeadcount` is the running sum of `confirmedCrewSize` for `CONFIRMED` assignments. The screen can also recompute it from assignments. The stored number exists so the accept transaction can enforce the cap.

`serviceType` is a label. A job repeats only when `seriesId` is set.

### Snapshot on the job

Copied when the job is created. Later edits to the customer or the property do not change it.

- `customerDisplayName`, `phone`, `email`
- `propertyId`, optional `propertyLabel`
- `streetAddress`, `city`, `state`, `zip`
- `bedrooms`, `bathrooms`, `squareFeet`
- `preferences`

The live property is the current house. The snapshot is what applied to that cleaning. Special instructions stay on the job, separate from house preferences.

### Assignment

```
pk     JOB#job_01H
sk     ASSIGN#as_01H
gsi1pk CLEANER#claudia
gsi1sk 2026-10-20#as_01H
```

Fields: `cleanerId`, `serviceDate`, `status`, `proposedCrewSize`, `confirmedCrewSize`, `arrivalWindowStart`, `arrivalWindowEnd`, `expectedDurationMinutes`, `payType`, `payPerPersonCents`, `proposedTotalPayCents`, `confirmedTotalPayCents`, `invitedAt`, `respondedAt`, `createdAt`, `updatedAt`.

Statuses: `INVITED`, `CONFIRMED`, `DECLINED`, `CANCELED`, `EXPIRED_JOB_FILLED`.

There is no recurring-assignment record. A series template is copied into a new assignment per job. `serviceDate` is the job date, stored here so a cleaner’s week can be loaded from GSI1 without reading every job first.

`confirmedTotalPayCents` for `FLAT` is the crew total. For `HOURLY` it is the crew rate per hour, not a finished invoice.

## Access patterns

| Need | How |
| --- | --- |
| Cleaner by id | Get `CLEANER#id` / `PROFILE` |
| Active cleaners | Query GSI1 `CLEANER_STATUS#ACTIVE` |
| One cleaner’s week of availability | Query `CLEANER#id`, `sk` between `AVAIL#start` and `AVAIL#end` |
| Everyone’s availability on a date | Query GSI1 `AVAIL#date` |
| Submission for a week | Get `SUBMISSION#weekStart`, or query GSI1 `SUBMISSION#weekStart` |
| Customer by id, with properties | Query `CUSTOMER#id` |
| One property | Get `CUSTOMER#id` / `PROPERTY#id` |
| Customer search | Query the `SEARCH#` prefixes |
| Jobs for a customer | Query GSI2 `CUSTOMER#id`, `sk begins_with JOB#`, then group by `propertyId` |
| Series for a customer | Query GSI2 `CUSTOMER#id`, `sk begins_with SERIES#` |
| Series by id | Get `SERIES#id` / `PROFILE` |
| Active series to generate | Query GSI1 `SERIES#ACTIVE` |
| Jobs on a date | Query GSI1 `JOBDATE#date` |
| Assignments on a job | Query `JOB#id`, `sk begins_with ASSIGN#` |
| One cleaner’s assignments | Query GSI1 `CLEANER#id`, `sk begins_with` the date |
| Confirmed conflicts | That cleaner query, keep `CONFIRMED`, compare blocked ranges |

## Atomic accept

Read the job, the invitation, the cleaner profile, that cleaner’s confirmed assignments, and their availability.

Then one `TransactWriteItems`:

1. Update the assignment to `CONFIRMED`, set `confirmedCrewSize`, `confirmedTotalPayCents`, and `respondedAt`. Condition: `status = INVITED`.
2. Update the job: `confirmedHeadcount = confirmedHeadcount + :crew`. Condition: `status = SCHEDULED` and `confirmedHeadcount <= headcountNeeded - :crew`.

If two cleaners take the last spot, one condition fails and that transaction rolls back. The cleaner sees “This job was just filled.”

The server sets crew size to the request only after checking `helpersApproved`. A solo cleaner sending `2` is rejected before the transaction. Pay is computed from `payPerPersonCents` on the assignment, not from a total sent by the phone.

After a successful accept, if the job is full, a follow-up transaction sets the other `INVITED` rows to `EXPIRED_JOB_FILLED`, each conditioned on `status = INVITED`. If that follow-up fails, the next read of a full job repairs them.

## Generation idempotency

For each missing date in the horizon, one transaction:

1. Put `OCCUR#date` with `attribute_not_exists(pk)`.
2. Put the job, including a fresh snapshot of the customer and that series’ property.
3. Put any new assignment rows.

If the lock exists, the whole transaction is skipped. Running the generator twice does not create a second job for that series and date.

Direct assignments that are unsafe (no availability submitted yet, outside availability, conflict, or crew rules) do not get a `CONFIRMED` row. The job is still created, with `staffingAttention` set, so it shows up for Kelsey. The conflict is not hidden.

## What a series edit is allowed to change

`THIS_ONLY` updates that job and its not-yet-confirmed assignments. The series row stays as it was.

`THIS_AND_FUTURE` updates the series and scheduled jobs on or after the chosen date. It does not rewrite earlier jobs, confirmed pay, or confirmed crew size.

Stopping future generation sets the series to `INACTIVE`. It does not delete history. Canceling this and future cleanings also cancels those scheduled jobs and their assignments, and sets the series inactive.
