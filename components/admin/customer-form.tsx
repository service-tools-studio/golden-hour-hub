"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { Field, fieldClass } from "@/components/ui";
import { validateCustomerInput } from "@/lib/domain/customers";
import type { Customer, Property } from "@/lib/domain/types";
import { formatPhone } from "@/lib/format";

function inputClass(invalid: boolean) {
  return invalid
    ? "min-h-12 w-full rounded-2xl border border-red-600 bg-white px-3 text-base text-ink outline-none focus:border-red-600"
    : fieldClass;
}

function StepGlyph({ direction }: { direction: "up" | "down" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
      {direction === "up" ? <path d="M12 5v14M5 12h14" /> : <path d="M5 12h14" />}
    </svg>
  );
}

function NumberStepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  error,
  id,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  onChange: (value: number) => void;
  error?: string;
  id?: string;
}) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  function change(direction: -1 | 1) {
    const next = Math.round((value + direction * step) * 10) / 10;
    if (next < min || (max !== undefined && next > max)) return;
    onChange(next);
  }
  const stepButton =
    "flex size-11 items-center justify-center rounded-full bg-mint text-ink shadow-[0_4px_12px_rgba(51,51,51,0.08)] transition active:scale-95 disabled:bg-ink/8 disabled:text-ink/25 disabled:shadow-none";
  return (
    <div id={id}>
      <p className={`mb-1.5 text-center text-sm font-medium ${error ? "text-red-700" : "text-ink/80"}`}>{label}</p>
      <div className={`flex flex-col items-center gap-1 rounded-3xl px-1 py-2 ${error ? "bg-red-50 ring-1 ring-red-600" : "bg-white"}`}>
        <button type="button" aria-label={`Increase ${label}`} disabled={atMax} onClick={() => change(1)} className={stepButton}>
          <StepGlyph direction="up" />
        </button>
        <p className="min-h-8 text-center text-base font-semibold tabular-nums leading-8">{value}</p>
        <button type="button" aria-label={`Decrease ${label}`} disabled={atMin} onClick={() => change(-1)} className={stepButton}>
          <StepGlyph direction="down" />
        </button>
      </div>
      {error ? (
        <span role="alert" className="mt-1.5 block text-sm font-semibold text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}

type PropertyDraft = {
  key: string;
  propertyId?: string;
  label: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  preferences: string;
};

function blankProperty(): PropertyDraft {
  return {
    key: `new-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    streetAddress: "",
    city: "Portland",
    state: "OR",
    zip: "",
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 1000,
    preferences: "",
  };
}

function draftsFor(customer: Customer | undefined, properties: Property[]): PropertyDraft[] {
  if (!customer) return [blankProperty()];
  const owned = properties.filter((item) => item.customerId === customer.customerId);
  if (owned.length === 0) return [blankProperty()];
  return owned.map((item) => ({
    key: item.propertyId,
    propertyId: item.propertyId,
    label: item.label ?? "",
    streetAddress: item.streetAddress,
    city: item.city,
    state: item.state,
    zip: item.zip,
    bedrooms: item.bedrooms,
    bathrooms: item.bathrooms,
    squareFeet: item.squareFeet,
    preferences: item.preferences,
  }));
}

export type CustomerFormHandle = {
  save: () => boolean;
  isDirty: () => boolean;
};

export function CustomerForm({
  customer,
  scrollToPropertyId,
  onCancel,
  onSaved,
  ref,
}: {
  customer?: Customer;
  scrollToPropertyId?: string | null;
  onCancel?: () => void;
  onSaved?: () => void;
  ref?: React.Ref<CustomerFormHandle>;
}) {
  const hub = useHub();
  const router = useRouter();
  const [error, setError] = useState<{ field: string; message: string; at: number } | null>(null);
  const [form, setForm] = useState({
    firstName: customer?.firstName ?? "",
    lastName: customer?.lastName ?? "",
    phone: customer ? formatPhone(customer.phone) : "",
    email: customer?.email ?? "",
    notes: customer?.notes ?? "",
  });
  const [properties, setProperties] = useState(() => draftsFor(customer, hub.properties));

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const initial = useRef({ form, properties });
  const latest = useRef({ form, properties });
  latest.current = { form, properties };

  function liveForm() {
    const notes = notesRef.current?.value;
    if (notes === undefined) return latest.current.form;
    return { ...latest.current.form, notes };
  }

  function clearError(field: string) {
    setError((current) => (current?.field === field ? null : current));
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    clearError(key);
  }

  function updateProperty(key: string, patch: Partial<PropertyDraft>) {
    setProperties((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    const index = latest.current.properties.findIndex((item) => item.key === key);
    const name = Object.keys(patch)[0];
    if (index >= 0 && name) clearError(`properties.${index}.${name}`);
  }

  function fieldMessage(field: string) {
    return error?.field === field ? error.message : undefined;
  }

  function propertyInUse(propertyId?: string) {
    if (!propertyId) return false;
    return (
      hub.jobs.some((job) => job.propertyId === propertyId) ||
      hub.series.some((series) => series.propertyId === propertyId)
    );
  }

  function persist(): string | null {
    const current = latest.current;
    const input = {
      ...liveForm(),
      properties: current.properties.map((item) => ({
        propertyId: item.propertyId,
        label: item.label,
        streetAddress: item.streetAddress,
        city: item.city,
        state: item.state,
        zip: item.zip,
        bedrooms: Number(item.bedrooms),
        bathrooms: Number(item.bathrooms),
        squareFeet: Number(item.squareFeet),
        preferences: item.preferences,
      })),
    };
    const decision = validateCustomerInput(input);
    if (!decision.ok) {
      setError({ field: decision.field ?? "form", message: decision.message, at: Date.now() });
      return null;
    }
    const result = hub.saveCustomer(decision.value, customer?.customerId);
    if (!result.ok || !result.customerId) {
      setError({
        field: "form",
        message: result.ok ? "That customer could not be saved." : result.message,
        at: Date.now(),
      });
      return null;
    }
    setError(null);
    return result.customerId;
  }

  useEffect(() => {
    if (!scrollToPropertyId) return;
    document.getElementById(`property-${scrollToPropertyId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollToPropertyId]);

  useEffect(() => {
    if (!error) return;
    const match = /^properties\.(\d+)\.(\w+)$/.exec(error.field);
    let id = `customer-${error.field}`;
    if (match) {
      const draft = latest.current.properties[Number(match[1])];
      if (draft) id = `property-${draft.key}-${match[2]}`;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  function isDirty(): boolean {
    return JSON.stringify({ form: liveForm(), properties: latest.current.properties }) !== JSON.stringify(initial.current);
  }

  useImperativeHandle(ref, () => ({
    save: () => persist() !== null,
    isDirty,
  }));

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const customerId = persist();
        if (!customerId) return;
        hub.flash("changes saved");
        if (onSaved) onSaved();
        else router.push(`/admin/customers/${customerId}`);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field id="customer-firstName" label="First name" error={fieldMessage("firstName")}>
          <input className={inputClass(Boolean(fieldMessage("firstName")))} value={form.firstName} onChange={(event) => set("firstName", event.target.value)} aria-invalid={Boolean(fieldMessage("firstName"))} />
        </Field>
        <Field id="customer-lastName" label="Last name" error={fieldMessage("lastName")}>
          <input className={inputClass(Boolean(fieldMessage("lastName")))} value={form.lastName} onChange={(event) => set("lastName", event.target.value)} aria-invalid={Boolean(fieldMessage("lastName"))} />
        </Field>
      </div>
      <Field id="customer-phone" label="Phone" error={fieldMessage("phone")}>
        <input className={inputClass(Boolean(fieldMessage("phone")))} type="tel" inputMode="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} aria-invalid={Boolean(fieldMessage("phone"))} />
      </Field>
      <Field id="customer-email" label="Email" error={fieldMessage("email")}>
        <input className={inputClass(Boolean(fieldMessage("email")))} type="email" value={form.email} onChange={(event) => set("email", event.target.value)} aria-invalid={Boolean(fieldMessage("email"))} />
      </Field>
      <Field id="customer-notes" label="Notes">
        <textarea
          ref={notesRef}
          className={`${inputClass(false)} min-h-24 py-3`}
          value={form.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
      </Field>
      <div className="space-y-3 pt-2">
        <h2 className="text-lg font-semibold">Properties</h2>
        {properties.map((property, index) => {
          const locked = propertyInUse(property.propertyId);
          const streetError = fieldMessage(`properties.${index}.streetAddress`);
          const cityError = fieldMessage(`properties.${index}.city`);
          const stateError = fieldMessage(`properties.${index}.state`);
          const zipError = fieldMessage(`properties.${index}.zip`);
          const bedroomsError = fieldMessage(`properties.${index}.bedrooms`);
          const bathroomsError = fieldMessage(`properties.${index}.bathrooms`);
          const squareFeetError = fieldMessage(`properties.${index}.squareFeet`);
          return (
            <div id={`property-${property.key}`} key={property.key} className="scroll-mt-20 space-y-3 rounded-3xl border border-ink/10 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink/70">Property {index + 1}</p>
                {properties.length > 1 && !locked ? (
                  <button
                    type="button"
                    onClick={() => setProperties((current) => current.filter((item) => item.key !== property.key))}
                    className="text-sm font-semibold text-ink/70"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {locked ? <p className="text-sm text-ink/60">Scheduled cleanings use this property.</p> : null}
              <Field label="Property nickname (optional)">
                <input
                  className={fieldClass}
                  placeholder="Optional, like Main house"
                  value={property.label}
                  onChange={(event) => updateProperty(property.key, { label: event.target.value })}
                />
              </Field>
              <Field id={`property-${property.key}-streetAddress`} label="Street" error={streetError}>
                <input
                  className={inputClass(Boolean(streetError))}
                  value={property.streetAddress}
                  onChange={(event) => updateProperty(property.key, { streetAddress: event.target.value })}
                  aria-invalid={Boolean(streetError)}
                />
              </Field>
              <Field id={`property-${property.key}-city`} label="City" error={cityError}>
                <input
                  className={inputClass(Boolean(cityError))}
                  value={property.city}
                  onChange={(event) => updateProperty(property.key, { city: event.target.value })}
                  aria-invalid={Boolean(cityError)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field id={`property-${property.key}-state`} label="State" error={stateError}>
                  <input
                    className={inputClass(Boolean(stateError))}
                    value={property.state}
                    onChange={(event) => updateProperty(property.key, { state: event.target.value })}
                    maxLength={2}
                    aria-invalid={Boolean(stateError)}
                  />
                </Field>
                <Field id={`property-${property.key}-zip`} label="ZIP" error={zipError}>
                  <input
                    className={inputClass(Boolean(zipError))}
                    inputMode="numeric"
                    value={property.zip}
                    onChange={(event) => updateProperty(property.key, { zip: event.target.value })}
                    aria-invalid={Boolean(zipError)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberStepper
                  id={`property-${property.key}-bedrooms`}
                  label="Beds"
                  value={property.bedrooms}
                  min={0}
                  max={20}
                  step={1}
                  error={bedroomsError}
                  onChange={(value) => updateProperty(property.key, { bedrooms: value })}
                />
                <NumberStepper
                  id={`property-${property.key}-bathrooms`}
                  label="Baths"
                  value={property.bathrooms}
                  min={0}
                  max={20}
                  step={0.5}
                  error={bathroomsError}
                  onChange={(value) => updateProperty(property.key, { bathrooms: value })}
                />
                <NumberStepper
                  id={`property-${property.key}-squareFeet`}
                  label="Sq ft"
                  value={property.squareFeet}
                  min={1}
                  step={50}
                  error={squareFeetError}
                  onChange={(value) => updateProperty(property.key, { squareFeet: value })}
                />
              </div>
              <Field label="Preferences">
                <textarea
                  className={`${fieldClass} min-h-24 py-3`}
                  value={property.preferences}
                  onChange={(event) => updateProperty(property.key, { preferences: event.target.value })}
                />
              </Field>
            </div>
          );
        })}
        <div id="customer-properties">
          <button
            type="button"
            onClick={() => {
              setProperties((current) => [...current, blankProperty()]);
              clearError("properties");
            }}
            className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink"
          >
            Add property
          </button>
          {fieldMessage("properties") ? (
            <span role="alert" className="mt-1.5 block text-sm font-semibold text-red-700">
              {fieldMessage("properties")}
            </span>
          ) : null}
        </div>
      </div>
      {fieldMessage("form") ? (
        <p id="customer-form" role="alert" className="text-sm font-semibold text-red-700">
          {fieldMessage("form")}
        </p>
      ) : null}
      <button type="submit" className="min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream">
        Save customer
      </button>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink">
          Cancel edit
        </button>
      ) : null}
    </form>
  );
}
