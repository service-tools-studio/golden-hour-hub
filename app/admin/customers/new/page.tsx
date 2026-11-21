import { Suspense } from "react";
import { NewCustomerView } from "@/components/admin/customers-view";
import {
  calendarImportCustomerPrefillFromRow,
  calendarImportIdFromReturnTo,
} from "@/lib/domain/calendar-import";
import { loadAdminHubCalendarImportSlice } from "@/lib/data/load-admin-hub";
import { dynamoConfigured } from "@/lib/data/dynamo-config";

function param(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string | string[];
    calendarImportId?: string | string[];
    firstName?: string | string[];
    lastName?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const returnTo = param(params.returnTo);
  const calendarImportId =
    param(params.calendarImportId) ?? calendarImportIdFromReturnTo(returnTo);

  const urlFirstName = param(params.firstName)?.trim();
  const urlLastName = param(params.lastName)?.trim();

  let prefill = {
    firstName: urlFirstName,
    lastName: urlLastName,
    phone: undefined as string | undefined,
    email: undefined as string | undefined,
    streetAddress: undefined as string | undefined,
    city: undefined as string | undefined,
    state: undefined as string | undefined,
    zip: undefined as string | undefined,
    marketId: undefined as string | undefined,
    bedrooms: undefined as number | undefined,
    bathrooms: undefined as number | undefined,
    squareFeet: undefined as number | undefined,
  };

  if (calendarImportId && dynamoConfigured()) {
    const slice = await loadAdminHubCalendarImportSlice(calendarImportId);
    const row = slice.calendarImports[0];
    if (row) {
      const hints = calendarImportCustomerPrefillFromRow(row);
      prefill = {
        firstName: urlFirstName || hints.suggestedFirstName,
        lastName: urlLastName || hints.suggestedLastName,
        phone: hints.suggestedPhone,
        email: hints.suggestedEmail,
        streetAddress: hints.streetAddress,
        city: hints.city,
        state: hints.state,
        zip: hints.zip,
        marketId: hints.marketId,
        bedrooms: hints.bedrooms,
        bathrooms: hints.bathrooms,
        squareFeet: hints.squareFeet,
      };
    }
  }

  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <NewCustomerView
        calendarImportId={calendarImportId}
        returnTo={returnTo}
        {...prefill}
      />
    </Suspense>
  );
}