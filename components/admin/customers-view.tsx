"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CustomerForm, type CustomerFormHandle } from "@/components/admin/customer-form";
import { SeriesForm } from "@/components/admin/series-form";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, Screen, fieldClass } from "@/components/ui";
import { searchCustomers } from "@/lib/domain/customers";
import { seriesSummary } from "@/lib/mock/seed";
import { formatLongDate, formatPhone, serviceLabel } from "@/lib/format";

function useUnsavedNavigation(active: boolean, blocked: () => boolean, onBlock: (href: string) => void) {
  const activeRef = useRef(active);
  const blockedRef = useRef(blocked);
  const onBlockRef = useRef(onBlock);
  activeRef.current = active;
  blockedRef.current = blocked;
  onBlockRef.current = onBlock;

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!activeRef.current || !blockedRef.current()) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("#")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const next = `${url.pathname}${url.search}`;
      if (next === `${window.location.pathname}${window.location.search}`) return;
      event.preventDefault();
      event.stopPropagation();
      onBlockRef.current(next);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

function Pencil() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="absolute top-4 right-4 h-4 w-4 text-ink/45"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function CustomersView() {
  const hub = useHub();
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchCustomers(hub.customers, hub.properties, query),
    [hub.customers, hub.properties, query],
  );
  return (
    <Screen>
      <PageHeader title="Customers" subtitle="Find a household" />
      <div className="space-y-3 px-5 pt-4">
        <input
          className={fieldClass}
          placeholder="Search customers..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search customers"
        />
        <Link href="/admin/customers/new" className="flex min-h-12 items-center justify-center rounded-2xl bg-gold text-base font-semibold text-ink">
          + Add New Customer
        </Link>
        {results.map((customer) => {
          const homes = hub.properties.filter((property) => property.customerId === customer.customerId);
          return (
            <Link key={customer.customerId} href={`/admin/customers/${customer.customerId}`} className="block">
              <Card>
                <p className="text-lg font-semibold">
                  {customer.firstName} {customer.lastName}
                </p>
                {homes.map((home) => (
                  <p key={home.propertyId} className="text-sm text-ink/70">
                    {home.label ? `${home.label} · ` : ""}
                    {home.streetAddress}, {home.city}
                  </p>
                ))}
                <p className="text-sm text-ink/70">{formatPhone(customer.phone)}</p>
              </Card>
            </Link>
          );
        })}
        {results.length === 0 ? <p className="text-sm text-ink/60">No matching customers.</p> : null}
      </div>
    </Screen>
  );
}

export function NewCustomerView() {
  return (
    <Screen>
      <PageHeader title="New customer" subtitle="Save them, then keep going" />
      <div className="px-5 pt-4">
        <CustomerForm />
      </div>
    </Screen>
  );
}

export function CustomerDetail({ customerId }: { customerId: string }) {
  const hub = useHub();
  const router = useRouter();
  const formRef = useRef<CustomerFormHandle>(null);
  const seriesFormRef = useRef<CustomerFormHandle>(null);
  const customer = hub.customers.find((item) => item.customerId === customerId);
  const [editing, setEditing] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [focusPropertyId, setFocusPropertyId] = useState<string | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<{ href?: string } | null>(null);
  const editingRecord = editing || Boolean(editingSeriesId);

  useUnsavedNavigation(
    Boolean(customer) && editingRecord,
    () => Boolean((editingSeriesId ? seriesFormRef.current : formRef.current)?.isDirty()),
    (href) => setLeaveTarget({ href }),
  );

  function activeForm() {
    return editingSeriesId ? seriesFormRef.current : formRef.current;
  }

  function finishLeave(href?: string) {
    setLeaveTarget(null);
    setEditing(false);
    setEditingSeriesId(null);
    if (href) router.push(href);
  }

  function requestLeave(href?: string) {
    if (activeForm()?.isDirty()) {
      setLeaveTarget({ href });
      return;
    }
    finishLeave(href);
  }

  function saveAndLeave() {
    const href = leaveTarget?.href;
    if (!activeForm()?.save()) {
      setLeaveTarget(null);
      return;
    }
    hub.flash("changes saved");
    finishLeave(href);
  }
  if (!customer) {
    return (
      <Screen>
        <PageHeader title="Customer" crumb={{ href: "/admin/customers", label: "Customers" }} />
        <p className="px-5 pt-4">That customer could not be found.</p>
      </Screen>
    );
  }
  const jobs = hub.jobs
    .filter((job) => job.customerId === customer.customerId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = jobs.filter((job) => job.date >= hub.today && job.status === "SCHEDULED");
  const history = jobs.filter((job) => job.date < hub.today || job.status === "CANCELED");
  const series = hub.series.filter((item) => item.customerId === customer.customerId);

  const editingSeries = editingSeriesId ? series.find((item) => item.seriesId === editingSeriesId) : undefined;
  const name = `${customer.firstName} ${customer.lastName}`;
  const homes = hub.properties.filter((property) => property.customerId === customer.customerId);
  const place =
    homes.length === 1
      ? `${homes[0].streetAddress}, ${homes[0].city}`
      : homes.length > 1
        ? `${homes.length} properties`
        : "No properties";

  return (
    <Screen>
      <PageHeader
        title={editingRecord ? "Edit" : name}
        subtitle={editing ? name : editingSeries ? "Recurring service" : place}
        crumbs={
          editingRecord
            ? [
                { label: "Customers", onClick: () => requestLeave("/admin/customers") },
                { label: name, onClick: () => requestLeave() },
              ]
            : [{ href: "/admin/customers", label: "Customers" }]
        }
      />
      <div className="space-y-3 px-5 pt-4">
        {editing ? (
          <CustomerForm
            ref={formRef}
            customer={customer}
            scrollToPropertyId={focusPropertyId}
            onCancel={() => requestLeave()}
            onSaved={() => setEditing(false)}
          />
        ) : editingSeries ? (
          <SeriesForm
            ref={seriesFormRef}
            series={editingSeries}
            homes={homes}
            onCancel={() => requestLeave()}
            onSaved={() => setEditingSeriesId(null)}
          />
        ) : (
          <>
          <Card
            className="relative"
            onClick={() => {
              setFocusPropertyId(null);
              setEditing(true);
            }}
          >
            <Pencil />
            <p className="pr-6">{formatPhone(customer.phone)}</p>
            {customer.email ? <p className="pr-6 text-sm text-ink/70">{customer.email}</p> : null}
            {customer.notes ? <p className="mt-3 text-sm">Notes: {customer.notes}</p> : null}
          </Card>
          <h2 className="pt-2 text-lg font-semibold">Properties</h2>
          {homes.length === 0 ? <p className="text-sm text-ink/60">No properties yet.</p> : null}
          {homes.map((home) => (
            <Card
              key={home.propertyId}
              className="relative"
              onClick={() => {
                setFocusPropertyId(home.propertyId);
                setEditing(true);
              }}
            >
              <Pencil />
              <p className="pr-6 font-semibold">{home.label ?? home.streetAddress}</p>
              <p className="text-sm text-ink/70">
                {home.streetAddress}, {home.city} {home.state} {home.zip}
              </p>
              <p className="mt-2 text-sm">
                {home.bedrooms} bed · {home.bathrooms} bath · {home.squareFeet.toLocaleString()} sq ft
              </p>
              {home.preferences ? <p className="mt-2 text-sm">Preferences: {home.preferences}</p> : null}
            </Card>
          ))}
        {series.length > 0 ? <h2 className="pt-2 text-lg font-semibold">Recurring service</h2> : null}
        {series.map((item) => {
          const home = homes.find((property) => property.propertyId === item.propertyId);
          const place = home ? (home.label ? `${home.label} · ${home.streetAddress}` : home.streetAddress) : null;
          return (
            <Card
              key={item.seriesId}
              className="relative"
              onClick={() => {
                setEditing(false);
                setEditingSeriesId(item.seriesId);
              }}
            >
              <Pencil />
              <p className="pr-6 text-lg font-semibold">{seriesSummary(item)}</p>
              {place ? <p className="text-sm text-ink/70">{place}</p> : null}
              <p className="text-sm text-ink/70">{item.status === "ACTIVE" ? "Active" : "Paused"} · Headcount {item.defaultHeadcountNeeded}</p>
            </Card>
          );
        })}
        <h2 className="pt-2 text-lg font-semibold">Upcoming</h2>
        {upcoming.length === 0 ? <p className="text-sm text-ink/60">No upcoming cleanings.</p> : null}
        {upcoming.map((job) => (
          <Link key={job.jobId} href={`/admin/jobs/${job.jobId}`} className="block">
            <Card>
              <p className="font-semibold">{formatLongDate(job.date)}</p>
              <p className="text-sm text-ink/70">{serviceLabel(job.serviceType)}</p>
              <p className="text-sm text-ink/70">{job.snapshot.streetAddress}</p>
            </Card>
          </Link>
        ))}
        <h2 className="pt-2 text-lg font-semibold">History</h2>
        {history.length === 0 ? <p className="text-sm text-ink/60">No past cleanings yet.</p> : null}
        {history.map((job) => (
          <Link key={job.jobId} href={`/admin/jobs/${job.jobId}`} className="block">
            <Card>
              <p className="font-semibold">{formatLongDate(job.date)}</p>
              <p className="text-sm text-ink/70">{serviceLabel(job.serviceType)}</p>
              <p className="text-sm text-ink/70">{job.snapshot.streetAddress}</p>
            </Card>
          </Link>
        ))}
          </>
        )}
      </div>
      {leaveTarget ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-5 pb-28"
          onClick={() => setLeaveTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="unsaved-title" className="text-lg font-semibold">
              Unsaved changes
            </h2>
            <p className="mt-1 text-sm leading-5 text-ink/70">Save this customer before leaving, or discard the edits.</p>
            <div className="mt-4 space-y-2">
              <button type="button" onClick={saveAndLeave} className="min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream">
                Save
              </button>
              <button type="button" onClick={() => finishLeave(leaveTarget.href)} className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink">
                Discard changes
              </button>
              <button type="button" onClick={() => setLeaveTarget(null)} className="min-h-12 w-full text-base font-semibold text-ink/70">
                Keep editing
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Screen>
  );
}
