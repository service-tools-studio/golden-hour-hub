# User-facing error messages

Audit of error and warning copy shown in Golden Hour Hub: what it says, where it appears, and how users reach it.

## How messages reach the UI

| Channel | Where | Typical use |
|--------|--------|-------------|
| **Red `Notice` / `role="alert"`** | Inline on the current screen | Form validation, failed saves |
| **`hub.flash()` toast** | Bottom overlay in `hub-provider` | Save outcomes, SMS outcomes, delete/undo failures |
| **Login `error` state** | `/login` | Cognito / API auth |
| **Field errors** | `Field` + `customer-form` | Per-field customer validation |
| **Warnings (still red styling)** | Job detail, edit assignment, schedule, cleaner home | Not always blocking saves |

Many admin/cleaner actions go through **`hub-provider` mutations** → `{ ok: false, message }` → the screen calls `setMessage(...)`, shows `<Notice>`, or `hub.flash(result.message)`.

---

## Sign-in and account setup (`/login`)

| Message | Path |
|--------|------|
| **Email and password are required.** | Submit login with empty fields (API → login form). |
| **Sign-in is not configured.** | Cognito env missing; sign-in API 503. |
| **Incorrect email or password.** | Wrong credentials (`NotAuthorizedException` / `UserNotFoundException`). |
| **That password doesn't meet our security rules yet. Please update it to include:** | Weak new password; often with live requirement list. |
| **Your password needs to be reset. Please contact an admin.** | `PasswordResetRequiredException`. |
| **Too many attempts. Try again in a few minutes.** | Cognito throttling. |
| **Sign-in failed.** | Generic API 401 or network parse failure → form shows **Could not sign in.** |
| **Sign-in did not return tokens.** | Rare Cognito success without tokens. |
| Raw Cognito `message` | Other Cognito errors passed through. |
| **Email, password, and session are required.** | New-password challenge with missing fields. |
| **Password change failed.** | New-password API 401. |
| **Could not set password.** / **Could not save password.** | Client fallback if request fails. |
| **That password doesn't meet our security rules yet.** (login-form fallback) | Client when API omits message on policy failure. |
| **Your account isn't ready in Hub yet… call Jasmin…** (`HubSetupMessage` / `hubSignInSetupMessage`) | Sign-in succeeds in Cognito but Hub has no linked admin/cleaner record (`hubSetup: "sign-in"`). |
| **Your password was updated, but your account isn't ready in Hub yet…** | Same after forced new password (`hubSetup: "password-updated"`). |

---

## Cleaner SMS onboarding (`/cleaner` first visit)

| Message | Path |
|--------|------|
| **Your cleaner profile is not linked in Hub.** | Server action without `cleanerId` on session. |
| **Hub database is not configured.** | Dynamo not configured in production path. |
| **Your cleaner profile could not be found.** | Stale `cleanerId` in session. |
| **Could not save your preference.** | Generic server failure. |
| **Sign in required.** / **You do not have access to this action.** | `AuthError` from guards (same strings as admin actions). |

---

## Cleaner home and invitations

### Invitation card (`InvitationCard` on `/cleaner`)

Accept/decline → `hub.acceptInvitation` / `hub.declineInvitation` → domain `validateInvitationAcceptance` + scheduling:

| Message | Path |
|--------|------|
| **This invitation is no longer available.** | Status not `INVITED`, stale tab, or race after someone else acted. |
| **This cleaning was canceled.** | Job not `SCHEDULED`. |
| **This invitation does not match the cleaning.** | Data inconsistency (should not happen in normal UI). |
| **Your account is not active. Please call Kelsey.** | Cleaner `INACTIVE`. |
| **This invitation belongs to someone else.** | Wrong cleaner session vs assignment (or mock cross-user). |
| **Choose how many people from your crew can attend.** | Crew stepper invalid. |
| **You can only attend on your own for this job.** / **Your approved crew size is N.** | Crew size above helper approval. |
| **This job was just filled.** / **Only N spot(s) still open.** | Invite accept when job headcount is already met (not shown for direct assignments). |
| **You already have a confirmed cleaning during this time.** | Overlapping confirmed job. |

Decline failures use the same “no longer available” / “belongs to someone else” paths. Success toasts may include server `message` (not errors).

### Cleaner home “Needs attention”

| Message | Path |
|--------|------|
| **You are confirmed for this cleaning but the job time falls outside…** (`AVAILABILITY_MISMATCH_MESSAGE`) | Card when `availabilityConflictWeekStart` is set after availability revalidation. |
| **`assignment.attentionReason`** (dynamic, see below) | Other `NEEDS_ATTENTION` rows. |
| **This cleaning needs a schedule change before it can be confirmed.** | Fallback if no `attentionReason`. |

### Availability editor (`/cleaner/availability`)

| Message | Path |
|--------|------|
| **Enter a start and end time for each available window.** | Submit with invalid times (client `validateAvailabilityWindows`). |
| **The end time needs to be after the start time.** | End ≤ start on a block. |
| **Those times overlap…** | Overlapping windows same day. |
| **You're confirmed for {customer} on {date}… follow up with Kelsey.** | Submit when edit would uncover a confirmed job → **alertdialog** (warning; can “Submit anyway”). |
| Same validation messages via **`hub.submitAvailability`** | Dynamo path uses same domain checks; plus **You can only edit your own availability.** |
| **`submitAvailabilityAction` failures** | **Hub is in preview mode.** / **Could not update Hub.** / auth messages from `cleaner-hub` action. |

Live edit validation: `setMessage(check.message)` while editing (same window rules).

---

## Admin — customers

### Customer form (`/admin/customers/new`, customer detail edit)

**Field-level** (`validateCustomerInput` in `lib/domain/customers.ts`):

- **Enter a first/last name.**
- **Enter a 10-digit mobile or home phone number, or leave it blank.**
- **Enter a valid email, or leave it blank.**
- **Add at least one property.**
- Per property: street, city, two-letter state, 5-digit ZIP, bedrooms, bathrooms, square footage.

**Path:** Save with missing/invalid data → red field + form alert.

| Message | Path |
|--------|------|
| **{Name} is already a customer.** | Duplicate first+last (`duplicate` UI block; hub `saveCustomer` returns same text on form save). |
| **That customer could not be saved.** | Hub save returned ok without id. |
| **A property with scheduled cleanings cannot be removed.** | Save after removing a property tied to jobs/series. |
| **Remove or reassign this customer's cleanings before deleting them.** | Delete customer with jobs. |
| **Delete this customer's recurring schedules before deleting them.** | Delete customer with series. |
| **That customer could not be found.** | Delete race / bad id. |
| **That customer could not be restored.** | Undo delete expired or empty. |

---

## Admin — recurring series (customer detail → edit series)

| Message | Path |
|--------|------|
| Recurrence rule messages (`validateRecurrenceRule`) e.g. **Choose every week, every 2 weeks, or every 4 weeks.** | Invalid recurrence (UI is weekly-focused). |
| **Enter a valid price per visit.** | Bad price field (`series-form` or hub). |
| Hub **`saveSeries`**: **That recurring service could not be found.** / **Choose one of this customer's properties.** / **Enter how many cleaners are needed.** | Save series edge cases. |

---

## Admin — new / edit cleaning (`CleaningForm`, `CreateJobView`, `EditJobView`)

### Client-only (before hub)

| Message | Path |
|--------|------|
| **Enter a valid price per visit.** | Bad optional price (`cleaning-form`). |
| **The cleaning could not be saved.** | Fallback if hub ok without message. |
| **The cleaning could not be created.** | `create-job-view` if hub ok but no `jobId`. |
| **That availability window could not be opened.** | `/admin/jobs/new?cleanerId=…&date=…&start=…&end=…` with invalid query (not from schedule click). |

### Hub `createJob` / `updateVisit` (shared validation)

Typical path: **New cleaning** or **Edit cleaning** → **Save cleaning**.

| Message | Path |
|--------|------|
| **Choose a customer.** / **Choose one of this customer's properties.** | Missing customer/property. |
| **Choose a valid date.** / **Choose a date.** | Invalid date. |
| **Enter a valid arrival window.** / **The arrival window must end after it starts.** | Bad job or per-cleaner arrival times. |
| **Enter how many cleaners are needed.** | Headcount invalid. |
| **Enter a duration between 30 minutes and 12 hours.** | Duration out of range. |
| **Choose an active cleaner.** | Draft cleaner inactive. |
| **Enter a valid price per visit.** | Hub price validation. |
| Recurring on create/edit: **Recurring schedule applies only to recurring cleans.** / **Choose headcount before creating a recurring schedule.** / **This cleaning already belongs to a recurring schedule.** / **This schedule already has a cleaning on that date.** | Recurring toggle + save. |
| **The headcount is smaller than a cleaner's crew on this cleaning.** | Headcount below a cleaner's crew size on this visit. |
| **That cleaning could not be edited.** | Canceled or missing job. |

---

## Admin — per-cleaner assignment (`/admin/jobs/[id]/edit` → cleaner assignment)

| Message | Path |
|--------|------|
| **That cleaning could not be edited.** | Missing/canceled job (full-page Notice). |
| **That cleaner is not on this cleaning.** | Bad `assignmentId` in URL. |
| **Enter the crew pay, like 350 or 350.00.** | Invalid pay before `completeAssignment`. |
| Hub **`completeAssignment`** / **`saveAssignmentDraft`**: pay/headcount/arrival/duration messages (same family as above). |
| **Add that cleaner to the cleaning before saving their details.** | Staffing without draft row. |
| **Save this cleaner's details before staffing them.** | Assign without saved draft details. |
| **That cleaner is already assigned on this cleaning.** | Duplicate assign. |
| **That cleaner is not active.** | Inactive cleaner. |
| **Set the headcount on this cleaning first.** | Job headcount 0. |
| **Enter the pay per person.** | Missing pay on invite/direct. |
| **The crew is larger than the headcount for this cleaning.** | Crew > job headcount. |
| **`plan.attention[0].reason`** from `planOccurrenceStaffing` | Invite/direct blocked, e.g. **This cleaner is not active, so the cleaning was left unassigned.** / **{Name} is not approved to bring helpers…** / **`This conflicts with another confirmed job for {Name}.`** |
| **The cleaning could not be assigned.** | Planner produced no assignment. |
| **{Name} has not submitted this week.** / **This schedule is outside {Name}'s submitted availability.** | Direct assign when availability rules fail. |

**Toasts after save (not hard failures):** `deliverSchedulingCleanerSms` / `assignmentSmsToast` — e.g. **{Name} has not opted in to automated texts.**, **Text not sent…**, **SMS was not sent (mock mode…)**, Twilio delivery messages.

### Warnings on assignment screen (red `Notice`, may still save)

| Message | Path |
|--------|------|
| **{Name} has not been notified of this assignment/changes.** (`noticeFlagText`) | Invited/confirmed/pending assignment; assignment or edits not texted yet. |
| **{Name} submitted availability for the week of…** / **conflicts with another confirmed cleaning** (`liveAvailabilityAttentionMessage` / `availabilityFollowUpReason`) | `NEEDS_ATTENTION` + availability conflict; updates as you change times in the form. |
| **{Name} needs to be reinvited for the new date.** (`reinviteFlagText`) | Job date changed vs `notifiedServiceDate`. |

---

## Admin — add cleaner to job (`add-cleaner-view`)

| Message | Path |
|--------|------|
| **That cleaning could not be found.** | Bad `jobId`. |
| **`addJobCleaner` errors** (e.g. **{Name} is already on this cleaning.**) | Flash toast on failed add. |

---

## Admin — job detail (`/admin/jobs/[id]`)

| Message | Path |
|--------|------|
| **`attentionReason`** on assignment rows | Same dynamic reasons as schedule/home. |
| **{Name} has not been notified…** / **reinvite** copy | Per-assignment warning rows. |
| **`arrivalMismatchText`** | Client arrival earlier than earliest cleaner window. |
| **Remove confirmed cleaners from this cleaning before deleting it.** (`CLEANING_DELETE_BLOCKED_MESSAGE`) | Delete cleaning/series dialog with confirmed cleaners. |
| **That cleaning could not be deleted.** / restore failures | Delete/undo toast. |
| Remove cleaner failures | **That cleaning could not be changed.** → flash. |

---

## Admin — team (`/admin/team`, cleaner detail)

| Message | Path |
|--------|------|
| **Enter a valid hourly rate.** | Team detail → Save (client parse or hub). |
| **`deriveCrewSettings`**: typical/max helper validation | Invalid helper counts (hub; UI usually prevents). |
| Hub **`updateCleanerAdmin`** failures | Same rate message. |
| **The reminder could not be sent. Please try again.** / Twilio **`userMessage`** / **Sign in required.** | Team → **Send Reminder** / **Send All** (`sendAvailabilityReminders`). *Note: failures currently use the same green “ok” `Notice` as success — copy still reaches the user.* |

---

## Admin — dashboard (`/admin`)

| Message | Path |
|--------|------|
| **N customer(s) have no phone number** (alert + links) | Any active customer missing phone — not a blocking error. |

---

## Admin — schedule (`schedule-view`)

| Message | Path |
|--------|------|
| **`pendingLabel`**: **Committed, pending availability submission** / **Invitation pending** | Event subtitle for pending assignments. |
| **`assignment.attentionReason`** or **Needs attention** | Tooltip/subtitle for flagged assignments. |

---

## Dynamic `attentionReason` strings (multiple surfaces)

Set by domain logic, shown on **job detail**, **edit assignment**, **schedule**, **cleaner home**:

- **`This conflicts with another confirmed job for {Name}.`** — overlapping confirmed jobs (`applyScheduleConflictWarning`, staffing planner).
- **`{Name} submitted availability for the week of {date}, but this cleaning falls outside those hours. Follow up with {Name}.`** — availability revalidation (`availabilityFollowUpReason`).
- **`{Name}'s submitted availability for the week of {date} conflicts with another confirmed cleaning. Follow up with {Name}.`** — same flow, conflict kind.
- Staffing template failures (invite flow): inactive cleaner, helper/crew size, headcount fit (see `planOccurrenceStaffing` in `lib/domain/recurrence.ts`).
- Older/custom reasons may still display verbatim if stored on the assignment.

---

## SMS / server configuration (toast or reminder Notice)

From `lib/services/sms.ts` / actions:

- **SMS recipient must be a 10-digit US number.**
- **This cleaner has no mobile number on file.**
- **{Name} has not opted in to SMS notifications.**
- **Twilio is not configured on the server…**
- Twilio API / delivery errors (often passed through or **Twilio could not deliver this text…**)
- **The text could not be sent. Please try again.**

---

## Messages that exist but rarely or never show in UI

| Message | Why |
|--------|-----|
| **Could not load Hub data.** / **Hub database is not configured.** / **Your cleaner profile is not linked in Hub.** | Returned from `bootstrapHub`; `hub-provider` currently loads **empty hub** without surfacing the string. |
| **Could not read Hub version.** | Hub version poll API; no dedicated banner. |
| **`validateRecurrenceRule` monthly/calendar paths** | Series UI is weekly-only today. |
| **`validateCleanerSchedule`** messages on admin | Used in domain/tests; admin assign uses slightly different hub copy. |

---

## Source file map

| File | Responsibility |
|------|----------------|
| `lib/domain/customers.ts` | Customer/property field errors |
| `lib/domain/scheduling.ts` | Availability windows, crew/headcount, delete-blocked, conflict reasons |
| `lib/domain/invitations.ts` | Accept/decline + availability follow-up copy |
| `lib/domain/recurrence.ts` | Recurrence validation + staffing `attention` reasons |
| `lib/domain/cleaners.ts` | Helper/crew settings |
| `components/hub-provider.tsx` | Most admin/cleaner mutation errors |
| `lib/auth/cognito.ts` + login API routes | Authentication |
| `app/actions/reminders.ts`, `notifications.ts`, `sms-onboarding.ts`, `cleaner-hub.ts` | Server actions |
| `lib/cleaner/deliver-scheduling-sms.ts`, `lib/sms-notify.ts` | Post-save SMS toasts |
| Screen components | Static Notices, pay parse, duplicate customer UI, availability conflict dialog |
