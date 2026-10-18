import type { Customer, JobCustomerSnapshot, Property, Result } from "./types.ts";

export type PropertyInput = {
  propertyId?: string;
  label?: string;
  streetAddress: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  preferences: string;
};

export type CustomerInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  notes?: string;
  properties: PropertyInput[];
};

export type CustomerSearchKeys = {
  nameKeys: string[];
  phoneKey: string;
  phoneLast7: string;
};

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  return national;
}

export function formatPhone(phone: string): string {
  const digits = normalizePhone(phone) ?? phone;
  if (digits.length !== 10) return phone;
  return formatPhoneInput(digits);
}

export function formatPhoneInput(input: string, previous = ""): string {
  let digits = input.replace(/\D/g, "");
  const previousDigits = previous.replace(/\D/g, "");
  if (input.length < previous.length && digits === previousDigits && digits.length > 0) {
    digits = digits.slice(0, -1);
  }
  const national = digits.length > 10 && digits.startsWith("1") ? digits.slice(1) : digits;
  const trimmed = national.slice(0, 10);
  if (trimmed.length === 0) return "";
  if (trimmed.length < 4) return `(${trimmed}`;
  if (trimmed.length < 7) return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3)}`;
  return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6)}`;
}

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a typed display name into first / last (last token is last name). */
export function parseTypedCustomerName(query: string): { firstName: string; lastName: string } {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Append firstName and lastName query params to a new-customer URL (returnTo preserved on base). */
export function newCustomerHrefWithName(baseHref: string, query: string): string | null {
  const { firstName, lastName } = parseTypedCustomerName(query);
  if (!firstName) return null;
  const url = new URL(baseHref, "https://local.invalid");
  url.searchParams.set("firstName", firstName);
  if (lastName) url.searchParams.set("lastName", lastName);
  return `${url.pathname}${url.search}`;
}

/** Active customer with the same first and last name (case- and spacing-insensitive). */
export function findCustomerByExactName(
  customers: Customer[],
  firstName: string,
  lastName: string,
  excludeCustomerId?: string,
): Customer | undefined {
  const first = normalizeSearchText(firstName);
  const last = normalizeSearchText(lastName);
  if (!first || !last) return undefined;
  return customers.find(
    (customer) =>
      customer.status === "ACTIVE" &&
      customer.customerId !== excludeCustomerId &&
      normalizeSearchText(customer.firstName) === first &&
      normalizeSearchText(customer.lastName) === last,
  );
}

export function buildCustomerSearchKeys(input: {
  firstName: string;
  lastName: string;
  phone: string;
}): CustomerSearchKeys {
  const first = normalizeSearchText(input.firstName);
  const last = normalizeSearchText(input.lastName);
  const nameKeys = [`${last} ${first}`, `${first} ${last}`].filter(
    (key, index, all) => key.trim().length > 0 && all.indexOf(key) === index,
  );
  const phoneKey = normalizePhone(input.phone) ?? "";
  return {
    nameKeys,
    phoneKey,
    phoneLast7: phoneKey.slice(-7),
  };
}

function propertyField(index: number, name: string) {
  return `properties.${index}.${name}`;
}

function validateProperty(input: PropertyInput, index: number): Result<{ value: PropertyInput }> & { field?: string } {
  const label = input.label?.trim() ?? "";
  const unit = input.unit?.trim() ?? "";
  const streetAddress = input.streetAddress.trim();
  const city = input.city.trim();
  const state = input.state.trim().toUpperCase();
  const zip = input.zip.trim();
  const preferences = input.preferences.trim();
  if (streetAddress.length < 3) {
    return { ok: false, field: propertyField(index, "streetAddress"), message: "Enter the street address." };
  }
  if (city.length < 2) {
    return { ok: false, field: propertyField(index, "city"), message: "Enter the city." };
  }
  if (!/^[A-Z]{2}$/.test(state)) {
    return { ok: false, field: propertyField(index, "state"), message: "Enter a two-letter state." };
  }
  if (zip !== "" && !/^\d{5}$/.test(zip)) {
    return { ok: false, field: propertyField(index, "zip"), message: "Enter a 5-digit ZIP code." };
  }
  if (!Number.isInteger(input.bedrooms) || input.bedrooms < 0 || input.bedrooms > 20) {
    return { ok: false, field: propertyField(index, "bedrooms"), message: "Enter the number of bedrooms." };
  }
  if (typeof input.bathrooms !== "number" || input.bathrooms < 0 || input.bathrooms > 20) {
    return { ok: false, field: propertyField(index, "bathrooms"), message: "Enter the number of bathrooms." };
  }
  if (!Number.isInteger(input.squareFeet) || input.squareFeet < 0) {
    return { ok: false, field: propertyField(index, "squareFeet"), message: "Enter the square footage." };
  }
  return {
    ok: true,
    value: {
      propertyId: input.propertyId,
      label: label || undefined,
      streetAddress,
      unit: unit || undefined,
      city,
      state,
      zip,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      squareFeet: input.squareFeet,
      preferences,
    },
  };
}

export function validateCustomerInput(
  input: CustomerInput,
): Result<{ value: CustomerInput & { phone: string; email?: string } }> & { field?: string } {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phoneDigits = input.phone.replace(/\D/g, "");
  const phone = phoneDigits === "" ? "" : normalizePhone(input.phone);
  const email = input.email?.trim() ?? "";
  const notes = input.notes?.trim() ?? "";

  if (firstName.length < 1) {
    return { ok: false, field: "firstName", message: "Enter a first name." };
  }
  if (lastName.length < 1) {
    return { ok: false, field: "lastName", message: "Enter a last name." };
  }
  if (phone === null) {
    return { ok: false, field: "phone", message: "Enter a 10-digit mobile or home phone number, or leave it blank." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, field: "email", message: "Enter a valid email, or leave it blank." };
  }
  if (input.properties.length < 1) {
    return { ok: false, field: "properties", message: "Add at least one property." };
  }
  const properties: PropertyInput[] = [];
  for (let index = 0; index < input.properties.length; index += 1) {
    const property = validateProperty(input.properties[index], index);
    if (!property.ok) return property;
    properties.push(property.value);
  }

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      phone,
      email: email || undefined,
      notes: notes || undefined,
      properties,
    },
  };
}

export function snapshotVisit(customer: Customer, property: Property): JobCustomerSnapshot {
  return {
    customerDisplayName: `${customer.firstName} ${customer.lastName}`,
    customerFirstName: customer.firstName,
    phone: customer.phone,
    email: customer.email,
    propertyId: property.propertyId,
    propertyLabel: property.label,
    streetAddress: property.streetAddress,
    unit: property.unit,
    city: property.city,
    state: property.state,
    zip: property.zip,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    squareFeet: property.squareFeet,
    preferences: property.preferences,
  };
}

export function searchCustomers(customers: Customer[], properties: Property[], query: string): Customer[] {
  const trimmed = query.trim().toLowerCase();
  const active = customers.filter((customer) => customer.status === "ACTIVE");
  if (!trimmed) return active;
  const digits = trimmed.replace(/\D/g, "");
  const text = normalizeSearchText(trimmed);
  return active.filter((customer) => {
    const keys = buildCustomerSearchKeys(customer);
    const homes = properties.filter((property) => property.customerId === customer.customerId);
    const nameMatch = keys.nameKeys.some((key) => key.includes(text));
    const addressMatch = homes.some(
      (property) =>
        normalizeSearchText(property.streetAddress).includes(text) ||
        normalizeSearchText(property.city).includes(text) ||
        normalizeSearchText(property.label ?? "").includes(text),
    );
    const phoneMatch =
      digits.length >= 3 &&
      (keys.phoneKey.includes(digits) || keys.phoneLast7.includes(digits));
    return nameMatch || addressMatch || phoneMatch;
  });
}
