"use client";

import Link from "next/link";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, Screen } from "@/components/ui";
import { formatMoney } from "@/lib/domain/compensation";
import { calculateConfirmedHeadcount } from "@/lib/domain/scheduling";
import { seriesSummary } from "@/lib/mock/seed";
import {
  crewLine,
  formatArrival,
  formatCleaningSpan,
  formatDuration,
  formatLongDate,
  formatScheduleFacts,
  payLine,
  serviceEmoji,
  serviceLabel,
} from "@/lib/format";

export function AdminJobDetail({ jobId }: { jobId: string }) {
  const hub = useHub();
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job) return <Missing label="That cleaning could not be found." href="/admin" />;
  const series = job.seriesId ? hub.series.find((item) => item.seriesId === job.seriesId) : undefined;
  const assignments = hub.assignments.filter((item) => item.jobId === job.jobId);
  const confirmed = calculateConfirmedHeadcount(assignments);
  const cleaningSpan = formatCleaningSpan(assignments);
  return (
    <Screen>
      <PageHeader
        title={formatLongDate(job.date)}
        subtitle={serviceLabel(job.serviceType)}
        crumbs={[
          { href: "/admin/customers", label: "Customers" },
          { href: `/admin/customers/${job.customerId}`, label: job.snapshot.customerDisplayName },
        ]}
      />
      <div className="space-y-3 px-5 pt-4">
        <Card>
          <ServiceLine serviceType={job.serviceType} />
          <p className="mt-2 text-lg font-semibold">
            Headcount: {confirmed} / {job.headcountNeeded} confirmed
          </p>
          {cleaningSpan ? <p className="mt-1 text-lg font-semibold">{cleaningSpan}</p> : null}
          {confirmed >= job.headcountNeeded ? (
            <p className="mt-2 inline-flex rounded-full bg-mint px-3 py-1 text-sm font-semibold">Fully Staffed</p>
          ) : null}
          <p className="mt-3 text-sm text-ink/70">
            {job.snapshot.streetAddress}, {job.snapshot.city} {job.snapshot.state} {job.snapshot.zip}
          </p>
          <p className="mt-1 text-sm text-ink/70">
            {job.snapshot.bedrooms} bed · {job.snapshot.bathrooms} bath · {job.snapshot.squareFeet.toLocaleString()} sq ft
          </p>
          {job.snapshot.preferences ? <p className="mt-3 text-sm">Preferences: {job.snapshot.preferences}</p> : null}
          {job.specialInstructions ? <p className="mt-2 text-sm">Instructions: {job.specialInstructions}</p> : null}
        </Card>
        {series ? (
          <Card>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Recurring</p>
            <p className="mt-1 text-lg font-semibold">{seriesSummary(series)}</p>
            <Link href={`/admin/customers/${job.customerId}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">
              View customer
            </Link>
          </Card>
        ) : null}
        {assignments.map((assignment) => {
          const cleaner = hub.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
          if (!cleaner) return null;
          const declined = assignment.status === "DECLINED";
          return (
            <Card key={assignment.assignmentId} muted={declined}>
              <p className="text-lg font-semibold">
                {cleaner.firstName} {cleaner.lastName}
                <span className={`text-sm font-normal ${declined ? "" : "text-ink/60"}`}>
                  {" · "}
                  {cleaner.helpersApproved ? "Helper-approved" : "Solo cleaner"}
                </span>
              </p>
              <p className="mt-2 text-sm">
                {assignment.status === "CONFIRMED"
                  ? `# of cleaners confirmed: ${assignment.confirmedCrewSize}`
                  : crewLine(cleaner, assignment)}
              </p>
              {assignment.status === "INVITED" && cleaner.helpersApproved ? (
                <p className="mt-1 text-sm"># of cleaners invited: {assignment.proposedCrewSize}</p>
              ) : null}
              <ScheduleFacts
                muted={declined}
                date={assignment.serviceDate}
                arrivalWindowStart={assignment.arrivalWindowStart}
                arrivalWindowEnd={assignment.arrivalWindowEnd}
                expectedDurationMinutes={assignment.expectedDurationMinutes}
              />
              <p className="mt-2 text-sm">
                {assignment.payType === "HOURLY" ? "Hourly" : "Flat"} rate: {formatMoney(assignment.payPerPersonCents)}
                {assignment.payType === "HOURLY" ? "/person/hour" : "/person"}
              </p>
              <p className="text-base font-semibold">Total pay: {payLine(assignment, assignment.status === "CONFIRMED")}</p>
            </Card>
          );
        })}
        {assignments.length === 0 ? (
          <Card>
            <p>No cleaners assigned yet. This cleaning needs staffing.</p>
            <Link
              href={`/admin/schedule?date=${job.date}`}
              className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
            >
              Add cleaners
            </Link>
          </Card>
        ) : null}
      </div>
    </Screen>
  );
}

export function CleanerJobDetail({ jobId }: { jobId: string }) {
  const hub = useHub();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  const job = hub.jobs.find((item) => item.jobId === jobId);
  const assignment = hub.assignments.find(
    (item) => item.jobId === jobId && item.cleanerId === hub.cleanerId && item.status === "CONFIRMED",
  );
  if (!cleaner || !job || !assignment) {
    return <Missing label="That confirmed cleaning could not be found." href="/cleaner" />;
  }
  return (
    <Screen>
      <PageHeader eyebrow="Confirmed job" title={job.snapshot.customerDisplayName} subtitle={formatLongDate(job.date)} />
      <div className="space-y-3 px-5 pt-4">
        <Card>
          <ServiceLine serviceType={job.serviceType} />
          <p className="mt-3 text-sm text-ink/60">Arrival window</p>
          <p className="text-lg font-semibold">{formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}</p>
          <p className="text-sm text-ink/70">{formatDuration(assignment.expectedDurationMinutes)}</p>
          <p className="mt-4 flex items-start gap-2 text-base">
            <span aria-hidden="true">📍</span>
            <span>
              {job.snapshot.streetAddress}
              <br />
              {job.snapshot.city}, {job.snapshot.state} {job.snapshot.zip}
            </span>
          </p>
          <p className="mt-3 text-sm">
            {job.snapshot.bedrooms} bed · {job.snapshot.bathrooms} bath · {job.snapshot.squareFeet.toLocaleString()} sq ft
          </p>
          {job.snapshot.preferences ? <p className="mt-3 text-sm">Preferences: {job.snapshot.preferences}</p> : null}
          {job.specialInstructions ? <p className="mt-2 text-sm">Instructions: {job.specialInstructions}</p> : null}
        </Card>
        <Card>
          {cleaner.helpersApproved ? (
            <>
              <p className="text-base">Confirmed crew size: {assignment.confirmedCrewSize}</p>
              <p className="mt-1 text-sm text-ink/70">
                {formatMoney(assignment.payPerPersonCents)} per person
              </p>
            </>
          ) : null}
          <p className="mt-2 text-xl font-semibold">{payLine(assignment, true)}</p>
          <p className="mt-4 text-sm leading-5 text-ink/70">
            {cleaner.helpersApproved
              ? "Need to change your schedule or crew? Confirmed bookings cannot be changed or canceled through the app. Please call Kelsey."
              : "Need to change your schedule? Confirmed bookings cannot be changed or canceled through the app. Please call Kelsey."}
          </p>
        </Card>
      </div>
    </Screen>
  );
}

function ServiceLine({ serviceType }: { serviceType: Parameters<typeof serviceLabel>[0] }) {
  const emoji = serviceEmoji(serviceType);
  return (
    <p className="flex items-start gap-2 text-base">
      {emoji ? <span aria-hidden="true">{emoji}</span> : null}
      <span>{serviceLabel(serviceType)}</span>
    </p>
  );
}

function ScheduleFacts({
  muted = false,
  ...input
}: {
  muted?: boolean;
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
}) {
  const facts = formatScheduleFacts(input);
  const items = [
    ["Arrive", facts.arrive],
    ["Length", facts.length],
    ["Ends", facts.ends],
  ] as const;
  return (
    <div className={`mt-3 grid grid-cols-3 gap-2 rounded-2xl px-3 py-2.5 ${muted ? "bg-white/50" : "bg-cream"}`}>
      {items.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-ink/50">{label}</p>
          <p className="mt-0.5 text-sm font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}

function Missing({ label, href }: { label: string; href: string }) {
  return (
    <Screen>
      <div className="px-5 pt-10">
        <p className="text-lg">{label}</p>
        <Link href={href} className="mt-4 inline-flex min-h-12 items-center font-semibold underline">
          Go back
        </Link>
      </div>
    </Screen>
  );
}
