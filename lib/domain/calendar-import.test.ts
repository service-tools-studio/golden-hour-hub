import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCalendarImportAddPropertyHref,
  buildCalendarImportNewCustomerHref,
  calendarImportPropertyInputFromHints,
  customerHasCalendarImportProperty,
  propertyMatchesCalendarImportAddress,
  calendarImportCustomerPrefillFromRow,
  calendarImportCanceledCardRelevant,
  calendarImportRescheduleStaleImportRow,
  calendarImportScheduleMovedFromGoogle,
  calendarImportShowsOnAdminDashboard,
  findExistingJobForCalendarImport,
  extractFirstEmailFromEventText,
  extractInviteeEmailFromGoogleAttendees,
  formatCalendarImportAddress,
  parseAddressOfServiceFromEventText,
  parseApartmentOrUnitLabel,
  calendarImportApartmentOrUnitFromSources,
  resolvedCalendarImportSpecialInstructions,
  calendarImportAdminInstructions,
  calendarEventIsCalendlyBooking,
  calendarEventIndicatesHubCancel,
  calendarEventIsExcludedFromImport,
  parseCalendlySpecialRequestsFromEventText,
  syncedCalendarImportSpecialInstructions,
  calendarEventTitleHasTbd,
  calendarImportPreservedDurationMinutes,
  calendarImportTtlEpoch,
  parseGoogleCalendarEvent,
  parseLocationHint,
  parsePropertySizeFromEventText,
  parseServiceTypeFromEventText,
  calendarImportDefaultServiceType,
  calendarImportLinkedJobId,
  calendarImportRawEventDetailsText,
  suggestCustomerForCalendarImport,
  visibleRecentlyDismissedCalendarImports,
  visibleRecentlySyncRemovedCalendarImports,
} from "./calendar-import.ts";
import type { CalendarImport, Customer, Job } from "./types.ts";

describe("calendar import parser", () => {
  it("treats Calendly-style Canceled: titles as hub cancels", () => {
    assert.equal(
      calendarEventIndicatesHubCancel({ summary: "Canceled: Jasmin Test Again and Golden Hour Cleaning Co" }),
      true,
    );
    assert.equal(calendarEventIndicatesHubCancel({ status: "confirmed", summary: "Rebecca Smith" }), false);
  });

  it("parses apartment and unit labels from event locations", () => {
    assert.equal(parseApartmentOrUnitLabel("7646 SW Millerglen Dr, Unit 1, Portland, OR"), "Unit 1");
    assert.equal(parseApartmentOrUnitLabel("1948 SE 52nd Ave Apt B"), "Apt B");
    assert.equal(parseApartmentOrUnitLabel("628 NE Roselawn St, Apt 129, Portland"), "Apt 129");
    assert.equal(parseApartmentOrUnitLabel("555 Oak Ave #236"), "#236");
    assert.equal(parseApartmentOrUnitLabel("1948 SE 52nd Ave Portland, OR, United States"), undefined);
    assert.equal(
      calendarImportApartmentOrUnitFromSources("", "Address of Service: 10 Main St #12", ""),
      "#12",
    );
    assert.equal(
      calendarImportApartmentOrUnitFromSources(
        undefined,
        "4 bed 2 bath\nApt 2",
        undefined,
        "628 NE Roselawn St, Portland, OR, United States",
      ),
      "Apt 2",
    );
  });

  it("drops the bogus Unit ed label from United States addresses", () => {
    assert.equal(
      resolvedCalendarImportSpecialInstructions({
        specialInstructions: "Unit ed",
        raw: {
          title: "Alex",
          description: "Apt 2",
          location: "628 NE Roselawn St, Portland, OR, United States",
        },
      }),
      "Apt 2",
    );
  });

  it("fills special instructions with unit when present on the event", () => {
    assert.equal(
      resolvedCalendarImportSpecialInstructions({
        specialInstructions: "",
        raw: {
          title: "Meredith Wendell",
          description: "",
          location: "7646 SW Millerglen Dr, Unit 1, Portland, OR",
        },
      }),
      "Unit 1",
    );
    assert.equal(
      resolvedCalendarImportSpecialInstructions({
        specialInstructions: "Use side gate",
        raw: { title: "Job", description: "", location: "10 Main St, Apt 129" },
      }),
      "Use side gate\nApt 129",
    );
  });

  it("formats raw event details for review", () => {
    const text = calendarImportRawEventDetailsText({
      title: "Alex - Move out",
      description: "Event Type: Move-out clean",
      location: "628 NE Roselawn St, Portland, OR",
      inviteeEmail: "alex@example.com",
    });
    assert.equal(text, "Event Type: Move-out clean");
    assert.equal(
      calendarImportRawEventDetailsText({
        title: "Test",
        description: "",
        descriptionHtml: "<p>Line one</p><p>Line two</p>",
        location: "",
      }),
      "Line one\n Line two",
    );
  });

  it("picks service type from customer history on import", () => {
    const customers = [{ customerId: "c-1", status: "ACTIVE" as const }];
    const priorJob = [{ customerId: "c-1", status: "SCHEDULED" as const }];
    assert.equal(calendarImportDefaultServiceType("DEEP_CLEAN", "c-1", customers, priorJob), "RECURRING");
    assert.equal(
      calendarImportDefaultServiceType("DEEP_CLEAN", "c-1", customers, [{ customerId: "c-1", status: "DRAFT" }]),
      "RECURRING",
    );
    assert.equal(calendarImportDefaultServiceType("DEEP_CLEAN", "c-1", customers, []), "DEEP_CLEAN");
    assert.equal(calendarImportDefaultServiceType("MOVE_OUT", "c-1", customers, priorJob), "MOVE_OUT");
    assert.equal(calendarImportDefaultServiceType("DEEP_CLEAN", undefined, customers), "DEEP_CLEAN");
    assert.equal(calendarImportDefaultServiceType("DEEP_CLEAN", "c-unknown", customers), "DEEP_CLEAN");
  });

  it("detects move-out service type from event text", () => {
    assert.equal(parseServiceTypeFromEventText("Move out clean at 628 NE Roselawn"), "MOVE_OUT");
    assert.equal(parseServiceTypeFromEventText("MOVE-OUT / deep dusting"), "MOVE_OUT");
    assert.equal(parseServiceTypeFromEventText("Event Type: Move-in/out"), "MOVE_OUT");
    assert.equal(parseServiceTypeFromEventText("move in / out clean"), "MOVE_OUT");
    assert.equal(parseServiceTypeFromEventText("Deep clean only"), "DEEP_CLEAN");
    const parsed = parseGoogleCalendarEvent({
      id: "evt-move",
      summary: "Taylor Blue - Move out",
      description: "Event Type: Move out cleaning",
      location: "628 NE Roselawn St, Portland, OR",
      start: { dateTime: "2026-11-15T09:00:00-08:00" },
      end: { dateTime: "2026-11-15T12:00:00-08:00" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.fields.serviceType, "MOVE_OUT");
  });

  it("maps a timed event into service date and arrival", () => {
    const parsed = parseGoogleCalendarEvent({
      id: "evt-1",
      summary: "Rebecca Smith - Deep clean",
      description: "Call 5035551212",
      location: "123 Main St, Portland, OR 97201",
      start: { dateTime: "2026-11-15T09:00:00-08:00" },
      end: { dateTime: "2026-11-15T12:00:00-08:00" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.fields.serviceDate, "2026-11-15");
    assert.equal(parsed.fields.arrivalWindowStart, "09:00");
    assert.equal(parsed.fields.expectedDurationMinutes, undefined);
    assert.equal(parsed.fields.parsed.suggestedFirstName, "Rebecca");
    assert.equal(parsed.fields.parsed.suggestedLastName, "Smith");
    assert.equal(parsed.fields.parsed.suggestedPhone, "5035551212");
    assert.equal(parsed.fields.marketId, "portland");
    assert.equal(parsed.fields.specialInstructions, "");
  });

  it("computes ttl one year after updatedAt", () => {
    const ttl = calendarImportTtlEpoch("2026-01-01T12:00:00.000Z");
    assert.equal(ttl, Math.floor(Date.parse("2026-01-01T12:00:00.000Z") / 1000) + 365 * 24 * 60 * 60);
  });

  it("leaves start time unset when title contains TBD", () => {
    assert.equal(calendarEventTitleHasTbd("Jane Doe - TBD"), true);
    const parsed = parseGoogleCalendarEvent({
      id: "evt-tbd",
      summary: "Jane Doe - Deep clean TBD",
      start: { dateTime: "2026-11-15T09:00:00-08:00" },
      end: { dateTime: "2026-11-15T11:00:00-08:00" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.fields.arrivalWindowStart, undefined);
    assert.equal(parsed.fields.arrivalWindowEnd, undefined);
    assert.equal(parsed.fields.serviceDate, "2026-11-15");
  });

  it("skips personal calendar blocks by title", () => {
    assert.equal(calendarEventIsExcludedFromImport({ summary: "water plants" }), true);
    assert.equal(calendarEventIsExcludedFromImport({ summary: "Kelsey unavailable" }), true);
    assert.equal(calendarEventIsExcludedFromImport({ summary: "Available — hold" }), true);
    assert.equal(
      calendarEventIsExcludedFromImport({
        summary: "Rebecca Smith - Deep clean",
        description: "I am unavailable that week",
      }),
      false,
    );
  });

  it("skips blocked personal titles by exact match", () => {
    assert.equal(calendarEventIsExcludedFromImport({ summary: "Dentist" }), true);
    assert.equal(calendarEventIsExcludedFromImport({ summary: "DENTIST" }), true);
    assert.equal(calendarEventIsExcludedFromImport({ summary: "NARPM Greater Portland Chapter Meeting" }), true);
    assert.equal(calendarEventIsExcludedFromImport({ summary: "Dentist appointment" }), false);
  });

  it("skips kelsey therapy events case-insensitively", () => {
    assert.equal(calendarEventIsExcludedFromImport({ summary: "Kelsey Therapy" }), true);
    assert.equal(calendarEventIsExcludedFromImport({ summary: "Friday kelsey therapy block" }), true);
    assert.equal(calendarEventIsExcludedFromImport({ summary: "Rebecca Smith - Deep clean" }), false);

    const parsed = parseGoogleCalendarEvent({
      id: "evt-therapy",
      summary: "KELSEY  THERAPY",
      start: { dateTime: "2026-11-15T09:00:00-08:00" },
      end: { dateTime: "2026-11-15T10:00:00-08:00" },
    });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.reason, "excluded");
  });

  it("drops calendar hold length mistaken for on-site estimate on resync", () => {
    const event = {
      id: "evt-calendly",
      start: { dateTime: "2026-11-15T09:00:00-08:00" },
      end: { dateTime: "2026-11-15T11:00:00-08:00" },
    };
    assert.equal(calendarImportPreservedDurationMinutes({ expectedDurationMinutes: 120 }, event), undefined);
    assert.equal(calendarImportPreservedDurationMinutes({ expectedDurationMinutes: 240 }, event), 240);
  });

  it("strips Calendly golden hour suffix from title and suggested name", () => {
    const parsed = parseGoogleCalendarEvent({
      id: "evt-calendly",
      summary: "Teryn Mattox and Golden Hour Cleaning Co",
      start: { dateTime: "2026-11-15T09:00:00-08:00" },
      end: { dateTime: "2026-11-15T11:00:00-08:00" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.fields.raw.title, "Teryn Mattox");
    assert.equal(parsed.fields.parsed.suggestedFirstName, "Teryn");
    assert.equal(parsed.fields.parsed.suggestedLastName, "Mattox");
  });

  it("fills special instructions from Calendly requests label only for Calendly events", () => {
    const calendlyBody =
      "Address of Service: 123 Main St\n" +
      "Share and preferences, priorities, or special requests:\n" +
      "Dog in backyard; use side gate.\n" +
      "Need to make changes to this event?";
    assert.equal(
      parseCalendlySpecialRequestsFromEventText(calendlyBody),
      "Dog in backyard; use side gate.",
    );
    assert.equal(
      parseCalendlySpecialRequestsFromEventText(
        "<p>Share and preferences, priorities, or special requests:</p><p>Cat is shy.</p>",
      ),
      "Cat is shy.",
    );

    const calendly = parseGoogleCalendarEvent({
      id: "evt-calendly-instructions",
      summary: "Jane Doe and Golden Hour Cleaning Co",
      description: calendlyBody,
      start: { dateTime: "2026-11-15T09:00:00-08:00" },
      end: { dateTime: "2026-11-15T11:00:00-08:00" },
    });
    assert.equal(calendly.ok, true);
    if (!calendly.ok) return;
    assert.equal(calendly.fields.specialInstructions, "Dog in backyard; use side gate.");
    assert.equal(calendly.fields.raw.bookingSource, "calendly");
    assert.equal(
      resolvedCalendarImportSpecialInstructions({
        specialInstructions: "",
        raw: {
          title: "Jane",
          description: calendlyBody,
          location: "",
          bookingSource: "calendly",
        },
      }),
      "Dog in backyard; use side gate.",
    );
    assert.equal(
      calendarEventIsCalendlyBooking({
        summary: "Jane Doe and Golden Hour Cleaning Co",
        description: calendlyBody,
      }),
      true,
    );

    const manual = parseGoogleCalendarEvent({
      id: "evt-manual",
      summary: "Rebecca Smith - Deep clean",
      description:
        "Share and preferences, priorities, or special requests:\nShould not copy on manual events",
      start: { dateTime: "2026-11-15T09:00:00-08:00" },
      end: { dateTime: "2026-11-15T12:00:00-08:00" },
    });
    assert.equal(manual.ok, true);
    if (!manual.ok) return;
    assert.equal(manual.fields.specialInstructions, "");
  });

  it("refreshes Calendly special instructions on sync when admin has not edited them", () => {
    const existing = {
      importId: "calimp-x",
      googleCalendarEventId: "g1",
      status: "PENDING_REVIEW" as const,
      serviceDate: "2026-11-15",
      serviceType: "DEEP_CLEAN" as const,
      headcountNeeded: 1,
      specialInstructions: "Old note from Calendly",
      marketId: "portland" as const,
      raw: {
        title: "Jane",
        description:
          "Address of Service: 1 Main\nShare and preferences, priorities, or special requests:\nOld note from Calendly",
        location: "",
      },
      parsed: {},
      createdAt: "",
      updatedAt: "",
    } as import("./types.ts").CalendarImport;
    assert.equal(
      syncedCalendarImportSpecialInstructions(existing, "Updated Calendly note", {
        summary: "Jane and Golden Hour Cleaning Co",
        description:
          "Address of Service: 1 Main\nShare and preferences, priorities, or special requests:\nUpdated Calendly note",
      }),
      "Updated Calendly note",
    );
    assert.equal(
      syncedCalendarImportSpecialInstructions(
        { ...existing, specialInstructions: "Admin typed this" },
        "From Calendly",
        { summary: "Jane and Golden Hour Cleaning Co", description: "Address of Service: x" },
      ),
      "Admin typed this",
    );
  });

  it("strips auto-copied event text from cleaner instructions", () => {
    assert.equal(
      calendarImportAdminInstructions({
        specialInstructions: "4 bed 2 bath 1500 sq ft",
        raw: { title: "Job", description: "4 bed 2 bath 1500 sq ft", location: "", htmlLink: undefined },
      }),
      "",
    );
    assert.equal(
      calendarImportAdminInstructions({
        specialInstructions: "Use side gate",
        raw: { title: "Job", description: "4 bed 2 bath", location: "", htmlLink: undefined },
      }),
      "Use side gate",
    );
  });

  it("parses street with glued city and trailing state", () => {
    const hints = parseLocationHint("1948 SE 52nd Ave Portland, OR 97215");
    assert.equal(hints.streetAddress, "1948 SE 52nd Ave");
    assert.equal(hints.city, "Portland");
    assert.equal(hints.state, "OR");
    assert.equal(hints.zip, "97215");
    assert.equal(hints.marketId, "portland");
  });

  it("parses Google Calendar location with country suffix", () => {
    const hints = parseLocationHint("1948 SE 52nd Ave Portland, OR, United States");
    assert.equal(hints.streetAddress, "1948 SE 52nd Ave");
    assert.equal(hints.city, "Portland");
    assert.equal(hints.state, "OR");
  });

  it("parses Kelsey one-line details format", () => {
    const size = parsePropertySizeFromEventText("4 bed 2 bath 1500 sq ft");
    assert.equal(size.bedrooms, 4);
    assert.equal(size.bathrooms, 2);
    assert.equal(size.squareFeet, 1500);
  });

  it("parses Kelsey multiline details format", () => {
    const size = parsePropertySizeFromEventText("4 bed\n2 bath\n1500 sq ft");
    assert.equal(size.bedrooms, 4);
    assert.equal(size.bathrooms, 2);
    assert.equal(size.squareFeet, 1500);

    const withGaps = parsePropertySizeFromEventText("4 bed\n\n2 bath\n\n1500 sq ft");
    assert.equal(withGaps.squareFeet, 1500);

    const html = parsePropertySizeFromEventText("<p>4 bed</p><p>2 bath</p><p>1500 sq ft</p>");
    assert.equal(html.bedrooms, 4);
    assert.equal(html.bathrooms, 2);
    assert.equal(html.squareFeet, 1500);
  });

  it("parses labeled fields from html event details", () => {
    const html =
      "<p>Bedrooms: 4</p><p>Bathrooms: 2.5</p><p>Square Feet: 2340</p>";
    const size = parsePropertySizeFromEventText(html);
    assert.equal(size.bedrooms, 4);
    assert.equal(size.bathrooms, 2.5);
    assert.equal(size.squareFeet, 2340);
  });

  it("parses Calendly square footage label", () => {
    assert.equal(parsePropertySizeFromEventText("Square Footage: 1700").squareFeet, 1700);
    assert.equal(parsePropertySizeFromEventText("Square Footage:\n1700").squareFeet, 1700);
    assert.equal(
      parsePropertySizeFromEventText("<p>Square Footage: 1,700</p>").squareFeet,
      1700,
    );
  });

  it("parses beds baths and sq ft from event details", () => {
    const size = parsePropertySizeFromEventText("3 bed 2 bath\nHome is about 1,850 sq ft. Call before arrival.");
    assert.equal(size.bedrooms, 3);
    assert.equal(size.bathrooms, 2);
    assert.equal(size.squareFeet, 1850);

    const parsed = parseGoogleCalendarEvent({
      id: "evt-size",
      summary: "Jane Doe",
      description: "3br/2ba · 2,100 sqft",
      start: { dateTime: "2026-11-15T09:00:00-08:00" },
      end: { dateTime: "2026-11-15T12:00:00-08:00" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.fields.parsed.bedrooms, 3);
    assert.equal(parsed.fields.parsed.bathrooms, 2);
    assert.equal(parsed.fields.parsed.squareFeet, 2100);
  });

  it("picks the first invitee email when several appear in event details", () => {
    const text =
      "Organizer: kelsey@goldenhourcleaning.com\nInvitee Email: catherine.mcintosh@example.com\nPhone: 5035551212";
    assert.equal(extractFirstEmailFromEventText(text), "catherine.mcintosh@example.com");

    const listed = "Email: host@calendly.com\nEmail: guest.user@mail.com";
    assert.equal(extractFirstEmailFromEventText(listed), "guest.user@mail.com");

    const unordered = "kelsey@goldenhourcleaning.com\ncatherine.mcintosh@example.com";
    assert.equal(extractFirstEmailFromEventText(unordered), "catherine.mcintosh@example.com");
  });

  it("parses Calendly address of service from html description", () => {
    const html =
      '<p>Address of Service: <a href="https://maps.example/5110">5110 NE Glisan Street Portland 97124</a></p>' +
      "<p>1 bed</p><p>1 bath</p>";
    assert.equal(parseAddressOfServiceFromEventText(html), "5110 NE Glisan Street Portland 97124");
    const parsed = parseGoogleCalendarEvent({
      id: "evt-calendly-addr",
      summary: "Catherine McIntosh",
      description: html,
      start: { dateTime: "2026-11-23T08:00:00-08:00" },
      end: { dateTime: "2026-11-23T10:00:00-08:00" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.fields.parsed.streetAddress, "5110 NE Glisan Street");
    assert.equal(parsed.fields.parsed.city, "Portland");
    assert.equal(parsed.fields.parsed.zip, "97124");
    assert.equal(
      formatCalendarImportAddress(parsed.fields.parsed),
      "5110 NE Glisan Street, Portland 97124",
    );
  });

  it("parses comma-separated US address", () => {
    const hints = parseLocationHint("123 Main St, Portland, OR 97201");
    assert.equal(hints.streetAddress, "123 Main St");
    assert.equal(hints.city, "Portland");
    assert.equal(hints.state, "OR");
    assert.equal(hints.zip, "97201");
  });

  it("does not treat a five-digit house number as the ZIP", () => {
    const hints = parseLocationHint("12505 NW Bayonne Ln, Portland, OR 97229");
    assert.equal(hints.streetAddress, "12505 NW Bayonne Ln");
    assert.equal(hints.city, "Portland");
    assert.equal(hints.state, "OR");
    assert.equal(hints.zip, "97229");
    assert.equal(formatCalendarImportAddress(hints), "12505 NW Bayonne Ln, Portland, OR 97229");
  });

  it("reads invitee email from mailto links in html description", () => {
    const html = '<p>Invitee Email: <a href="mailto:catherine@example.com">Send email</a></p>';
    assert.equal(extractFirstEmailFromEventText(html), "catherine@example.com");
  });

  it("reads invitee email on the line after the label", () => {
    assert.equal(
      extractFirstEmailFromEventText("Invitee Email:\ncatherine@example.com"),
      "catherine@example.com",
    );
  });

  it("prefers non-organizer Google Calendar attendees", () => {
    assert.equal(
      extractInviteeEmailFromGoogleAttendees([
        { email: "kelsey@goldenhourcleaning.com", organizer: true },
        { email: "guest@example.com", organizer: false },
      ]),
      "guest@example.com",
    );
  });

  it("parses invitee email from attendees when description has none", () => {
    const parsed = parseGoogleCalendarEvent({
      id: "evt-attendee-email",
      summary: "Jane Guest",
      attendees: [
        { email: "host@goldenhourcleaning.com", organizer: true },
        { email: "jane.guest@gmail.com" },
      ],
      start: { dateTime: "2026-11-23T08:00:00-08:00" },
      end: { dateTime: "2026-11-23T10:00:00-08:00" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.fields.parsed.suggestedEmail, "jane.guest@gmail.com");
    assert.equal(parsed.fields.raw.inviteeEmail, "jane.guest@gmail.com");
  });

  it("detects Gmail reschedule when the hub job date is still behind the import row", () => {
    const row = {
      importId: "cal-1",
      googleCalendarEventId: "gcal-1",
      status: "APPROVED" as const,
      serviceDate: "2026-11-25",
      arrivalWindowStart: "09:00",
      arrivalWindowEnd: "09:00",
      approvedJobId: "job-1",
      serviceType: "RECURRING" as const,
      headcountNeeded: 1,
      specialInstructions: "",
      marketId: "portland" as const,
      raw: { title: "", description: "", location: "" },
      parsed: {},
      createdAt: "",
      updatedAt: "",
      lastSyncedAt: "",
    } satisfies CalendarImport;
    const hub = {
      jobs: [
        {
          jobId: "job-1",
          customerId: "c1",
          propertyId: "p1",
          serviceType: "RECURRING" as const,
          date: "2026-11-20",
          arrivalWindowStart: "09:00",
          arrivalWindowEnd: "09:00",
          headcountNeeded: 1,
          snapshot: {} as import("./types.ts").Job["snapshot"],
          specialInstructions: "",
          status: "SCHEDULED" as const,
          createdAt: "",
          createdBy: "",
          updatedAt: "",
          updatedBy: "",
        },
      ],
      customers: [],
      properties: [],
    };
    assert.equal(
      calendarImportScheduleMovedFromGoogle(hub, row, "2026-11-25", "09:00", "09:00"),
      true,
    );
  });

  it("does not treat a canceled hub job as still linked for calendar sync", () => {
    const hub = {
      jobs: [
        {
          jobId: "job-1",
          customerId: "c1",
          propertyId: "p1",
          serviceType: "DEEP_CLEAN" as const,
          date: "2026-11-29",
          headcountNeeded: 1,
          snapshot: {} as Job["snapshot"],
          status: "CANCELED" as const,
          createdAt: "",
          createdBy: "",
          updatedAt: "",
          updatedBy: "",
          specialInstructions: "",
        },
      ],
      customers: [],
      properties: [],
    };
    const row = {
      importId: "imp-1",
      googleCalendarEventId: "gcal-1",
      approvedJobId: "job-1",
      serviceDate: "2026-11-29",
      status: "WITHDRAWN" as const,
      serviceType: "DEEP_CLEAN" as const,
      headcountNeeded: 1,
      specialInstructions: "",
      marketId: "portland" as const,
      raw: { title: "", description: "", location: "" },
      parsed: {},
      createdAt: "",
      updatedAt: "",
      lastSyncedAt: "",
    } satisfies CalendarImport;
    assert.equal(calendarImportLinkedJobId(hub, row), undefined);
  });

  it("treats CALENDAR_CANCELED on the old date as stale when the hub job moved", () => {
    const hub = {
      jobs: [
        {
          jobId: "job-1",
          googleCalendarEventId: "gcal-new",
          customerId: "c1",
          propertyId: "p1",
          serviceType: "DEEP_CLEAN" as const,
          date: "2026-11-27",
          headcountNeeded: 1,
          snapshot: {} as import("./types.ts").Job["snapshot"],
          status: "SCHEDULED" as const,
          createdAt: "",
          createdBy: "",
          updatedAt: "",
          updatedBy: "",
          specialInstructions: "",
        },
      ],
      customers: [
        {
          customerId: "c1",
          firstName: "Jasmin",
          lastName: "Test Again",
          phone: "5035550100",
          status: "ACTIVE" as const,
          createdAt: "",
          createdBy: "",
          updatedAt: "",
          updatedBy: "",
        },
      ],
      properties: [],
    };
    const row = {
      importId: "imp-1",
      googleCalendarEventId: "gcal-old",
      serviceDate: "2026-11-22",
      status: "CALENDAR_CANCELED" as const,
      serviceType: "DEEP_CLEAN" as const,
      headcountNeeded: 1,
      specialInstructions: "",
      marketId: "portland" as const,
      raw: { title: "Jasmin Test Again", description: "", location: "" },
      parsed: { suggestedFirstName: "Jasmin", suggestedLastName: "Test Again", marketId: "portland" as const },
      createdAt: "",
      updatedAt: "",
      lastSyncedAt: "",
    } satisfies CalendarImport;
    assert.equal(calendarImportRescheduleStaleImportRow(hub, row), true);
    assert.equal(calendarImportCanceledCardRelevant(hub, row), false);
  });

  it("prefills property unit from calendar import details", () => {
    const prefill = calendarImportCustomerPrefillFromRow({
      parsed: { suggestedFirstName: "E2E", suggestedLastName: "Fresh", marketId: "portland" },
      specialInstructions: "Apt 2",
      raw: {
        title: "E2E Fresh",
        description: "2 bed\n1 bath\nApt 2",
        location: "100 E2E St, Portland, OR 97205, United States",
      },
    });
    assert.equal(prefill.unit, "Apt 2");
    assert.equal(prefill.suggestedNotes, "2 bed\n1 bath\nApt 2");
  });

  it("builds new customer href with parsed hints", () => {
    const href = buildCalendarImportNewCustomerHref("calimp-abc", {
      suggestedFirstName: "Rebecca",
      suggestedLastName: "Smith",
      suggestedPhone: "5035551212",
      streetAddress: "123 Main St",
      city: "Portland",
      state: "OR",
      zip: "97201",
      marketId: "portland",
    });
    assert.match(href, /firstName=Rebecca/);
    assert.match(href, /calendarImportId=calimp-abc/);
    assert.match(href, /returnTo=.*calendar-imports/);
    assert.doesNotMatch(href, /bedrooms=/);
  });

  it("finds an existing job for the same customer and service date", () => {
    const job: Job = {
      jobId: "job-1",
      customerId: "cust-1",
      propertyId: "prop-1",
      serviceType: "RECURRING",
      date: "2026-11-15",
      headcountNeeded: 2,
      snapshot: {
        customerDisplayName: "Jane Doe",
        phone: "5035551212",
        propertyId: "prop-1",
        streetAddress: "123 Main",
        city: "Portland",
        state: "OR",
        zip: "97201",
        marketId: "portland",
        timeZone: "America/Los_Angeles",
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1500,
        preferences: "",
      },
      specialInstructions: "",
      status: "SCHEDULED",
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "test",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "test",
    };
    const matched = findExistingJobForCalendarImport(
      [job],
      [],
      [],
      {
        googleCalendarEventId: "gcal-other",
        serviceDate: "2026-11-15",
        suggestedCustomerId: "cust-1",
        suggestedPropertyId: "prop-1",
        parsed: { suggestedFirstName: "Jane", suggestedLastName: "Doe" },
      },
    );
    assert.equal(matched?.jobId, "job-1");
  });

  it("suggests a customer by exact name", () => {
    const customers: Customer[] = [
      {
        customerId: "cust-rebecca",
        firstName: "Rebecca",
        lastName: "Smith",
        phone: "5035551212",
        status: "ACTIVE",
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "test",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "test",
      },
    ];
  const match = suggestCustomerForCalendarImport(customers, {
    suggestedFirstName: "Rebecca",
    suggestedLastName: "Smith",
  }, []);
    assert.equal(match.customerId, "cust-rebecca");
  });

  it("suggests a customer when the profile includes a quoted nickname", () => {
    const customers: Customer[] = [
      {
        customerId: "cust-nicky",
        firstName: 'Nicolette "Nicky"',
        lastName: "Ulrich",
        phone: "5035551212",
        status: "ACTIVE",
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "test",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "test",
      },
    ];
    const match = suggestCustomerForCalendarImport(
      customers,
      { suggestedFirstName: "Nicolette", suggestedLastName: "Ulrich" },
      [],
    );
    assert.equal(match.customerId, "cust-nicky");
  });
});

describe("calendar import property on customer", () => {
  it("builds add-property edit link", () => {
    const href = buildCalendarImportAddPropertyHref("cust-1", "calimp-9");
    assert.match(href, /\/admin\/customers\/cust-1\?/);
    assert.match(href, /calendarImportId=calimp-9/);
    assert.match(href, /addPropertyFromImport=1/);
  });

  it("treats abbreviated Gmail streets as the same hub property", () => {
    const hints = { streetAddress: "6875 SW Nyberg St", city: "Tualatin", state: "OR" };
    const property = {
      propertyId: "p1",
      customerId: "c1",
      streetAddress: "6875 Southwest Nyberg Street",
      city: "Tualatin",
      state: "OR",
      zip: "97062",
      status: "ACTIVE",
    } as import("./types.ts").Property;
    assert.equal(propertyMatchesCalendarImportAddress(property, hints), true);
    assert.equal(customerHasCalendarImportProperty([property], "c1", hints), true);
  });

  it("detects when the import address is not on the customer", () => {
    const hints = { streetAddress: "12505 NW Bayonne Ln", city: "Portland", state: "OR", zip: "97229" };
    const properties = [
      {
        propertyId: "p1",
        customerId: "c1",
        streetAddress: "500 Southwest Harlequin Dr",
        city: "Beaverton",
        state: "OR",
        zip: "97005",
        status: "ACTIVE",
      },
    ] as import("./types.ts").Property[];
    assert.equal(propertyMatchesCalendarImportAddress(properties[0]!, hints), false);
    assert.equal(customerHasCalendarImportProperty(properties, "c1", hints), false);
    const draft = calendarImportPropertyInputFromHints(hints);
    assert.ok(draft);
    assert.equal(draft?.streetAddress, "12505 NW Bayonne Ln");
  });
});

describe("visibleRecentlyDismissedCalendarImports", () => {
  const base = {
    importId: "calimp-d",
    googleCalendarEventId: "evt-d",
    status: "REJECTED" as const,
    serviceDate: "2026-11-20",
    serviceType: "DEEP_CLEAN" as const,
    headcountNeeded: 1,
    specialInstructions: "",
    marketId: "portland" as const,
    raw: { title: "Jane", description: "", location: "" },
    parsed: {},
    createdAt: "2026-11-01T00:00:00.000Z",
    lastSyncedAt: "2026-11-01T00:00:00.000Z",
  } satisfies Omit<CalendarImport, "updatedAt">;

  it("lists REJECTED and WITHDRAWN imports dismissed within the window", () => {
    const recent = { ...base, updatedAt: "2026-11-19T12:00:00.000Z" };
    const withdrawn = {
      ...base,
      importId: "calimp-w",
      status: "WITHDRAWN" as const,
      updatedAt: "2026-11-19T12:00:00.000Z",
    };
    const old = { ...base, importId: "calimp-old", updatedAt: "2026-10-01T12:00:00.000Z" };
    const pending = { ...base, importId: "calimp-p", status: "PENDING_REVIEW" as const, updatedAt: "2026-11-19T12:00:00.000Z" };
    const visible = visibleRecentlyDismissedCalendarImports(
      [recent, withdrawn, old, pending],
      "2026-11-20",
      "all",
    );
    assert.equal(visible.length, 2);
    assert.equal(visible.map((item) => item.importId).sort().join(","), "calimp-d,calimp-w");
  });

  it("counts only WITHDRAWN rows for sync-removed badge", () => {
    const withdrawn = {
      ...base,
      importId: "calimp-w",
      status: "WITHDRAWN" as const,
      updatedAt: "2026-11-19T12:00:00.000Z",
    };
    const rejected = { ...base, updatedAt: "2026-11-19T12:00:00.000Z" };
    const syncRemoved = visibleRecentlySyncRemovedCalendarImports([withdrawn, rejected], "2026-11-20", "all");
    assert.equal(syncRemoved.length, 1);
    assert.equal(syncRemoved[0]?.importId, "calimp-w");
  });
});