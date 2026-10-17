import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms & Conditions | Golden Hour Hub",
  description: "Terms and conditions for Golden Hour Hub.",
};

export default function TermsPage() {
  return (
    <Screen>
      <article className="px-5 py-8 text-ink">
        <h1 className="text-2xl font-semibold tracking-tight">Terms &amp; Conditions</h1>
        <p className="mt-2 text-sm text-ink/70">Effective Date: October 16, 2026</p>

        <div className="mt-6 space-y-6 text-sm leading-6 text-ink/90">
          <p>
            These Terms &amp; Conditions govern access to Golden Hour Hub, a private scheduling and contractor
            management platform operated by Heart Aligned Wellness LLC, doing business as Golden Hour Cleaning Co.
          </p>
          <p>By accessing or using Golden Hour Hub, you agree to these Terms &amp; Conditions.</p>

          <section>
            <h2 className="text-base font-semibold text-ink">1. Purpose of Golden Hour Hub</h2>
            <p className="mt-2">
              Golden Hour Hub is designed to facilitate communication and scheduling between Golden Hour Cleaning Co.
              and independent cleaning contractors.
            </p>
            <p className="mt-2">The platform may be used to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>View and respond to cleaning job invitations.</li>
              <li>Submit and update work availability.</li>
              <li>Review assigned jobs and scheduling details.</li>
              <li>Receive scheduling updates and reminders.</li>
              <li>Communicate regarding cleaning assignments.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">2. Account Registration and Security</h2>
            <p className="mt-2">Access to Golden Hour Hub is limited to authorized users.</p>
            <p className="mt-2">
              Users are responsible for maintaining the confidentiality of their login credentials and notifying
              Golden Hour Cleaning Co. of suspected unauthorized account activity.
            </p>
            <p className="mt-2">Users must provide accurate contact information and keep their account information current.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">3. Job Invitations and Scheduling</h2>
            <p className="mt-2">
              Job invitations are subject to availability, operational requirements, and confirmation by Golden Hour
              Cleaning Co.
            </p>
            <p className="mt-2">Receiving an invitation does not guarantee assignment to a particular job.</p>
            <p className="mt-2">
              Contractors are responsible for reviewing assignment details and communicating scheduling conflicts or
              changes promptly.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">4. Independent Contractor Relationships</h2>
            <p className="mt-2">Golden Hour Hub is an administrative scheduling and communication tool.</p>
            <p className="mt-2">
              Use of the platform does not independently establish an employment relationship, guarantee a minimum number
              of assignments, or modify the terms of any separate written contractor agreement.
            </p>
            <p className="mt-2">
              The parties&apos; legal relationship is determined by applicable law and the actual working arrangement, not
              solely by the terminology used in this platform or these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">5. SMS Messaging Terms</h2>
            <p className="mt-2">
              <span className="font-medium text-ink">Program Name:</span> Golden Hour Hub Scheduling Notifications
            </p>
            <p className="mt-1">
              <span className="font-medium text-ink">Operated by:</span> Heart Aligned Wellness LLC, doing business as
              Golden Hour Cleaning Co.
            </p>
            <p className="mt-2">
              Contractors who voluntarily enroll in our SMS notification program may receive recurring automated text
              messages related to:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>New cleaning job invitations.</li>
              <li>Assignment confirmations.</li>
              <li>Scheduling changes.</li>
              <li>Upcoming cleaning appointments.</li>
              <li>Weekly availability requests.</li>
              <li>Other operational scheduling communications.</li>
            </ul>
            <p className="mt-2">Message frequency varies based on scheduling activity and individual assignments.</p>
            <p className="mt-2">Message and data rates may apply.</p>
            <p className="mt-2">
              SMS enrollment is voluntary and is collected separately from acceptance of these Terms &amp; Conditions.
            </p>
            <p className="mt-3 font-semibold text-ink">
              To unsubscribe, reply STOP to any SMS message from our program. After opting out, you will no longer receive
              automated scheduling messages from that messaging program unless you opt in again.
            </p>
            <p className="mt-3 font-semibold text-ink">
              For assistance, reply HELP to any SMS message or contact Golden Hour Cleaning Co. using the contact
              information below.
            </p>
            <p className="mt-2">Consent to receive SMS notifications is not consent to receive marketing or promotional messages.</p>
            <p className="mt-2">Carriers are not liable for any delayed or undelivered messages.</p>
            <p className="mt-2">
              SMS delivery is subject to mobile network availability and carrier restrictions. We do not guarantee that
              every message will be delivered immediately or successfully.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">6. Acceptable Use</h2>
            <p className="mt-2">
              Users agree to use Golden Hour Hub only for legitimate scheduling, communication, and business purposes.
            </p>
            <p className="mt-2">
              Unauthorized access, misuse of contractor or customer information, and attempts to compromise platform
              security are prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">7. Platform Availability</h2>
            <p className="mt-2">
              We strive to maintain reliable access to Golden Hour Hub but do not guarantee uninterrupted or error-free
              operation.
            </p>
            <p className="mt-2">
              The platform may occasionally be unavailable due to maintenance, technical issues, or circumstances beyond
              our control.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">8. Privacy</h2>
            <p className="mt-2">Use of Golden Hour Hub is also governed by our Privacy Policy:</p>
            <p className="mt-2">
              <Link
                href="/privacy"
                className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4"
              >
                Privacy Policy
              </Link>
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">9. Changes to These Terms</h2>
            <p className="mt-2">
              We may update these Terms &amp; Conditions periodically. Updated terms will be published on this page with a
              revised effective date.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">10. Contact Information</h2>
            <div className="mt-2 space-y-1">
              <p>Heart Aligned Wellness LLC</p>
              <p>Doing Business As: Golden Hour Cleaning Co.</p>
              <p>
                Website:{" "}
                <a
                  href="https://www.goldenhourcleaningco.com"
                  className="font-semibold underline decoration-gold decoration-2 underline-offset-4"
                >
                  https://www.goldenhourcleaningco.com
                </a>
              </p>
              <p>
                Email:{" "}
                <a
                  href="mailto:golden.hour.cleaning.company@gmail.com"
                  className="font-semibold underline decoration-gold decoration-2 underline-offset-4"
                >
                  golden.hour.cleaning.company@gmail.com
                </a>
              </p>
              <p>
                Phone:{" "}
                <a href="tel:+19718088538" className="font-semibold underline decoration-gold decoration-2 underline-offset-4">
                  (971) 808-8538
                </a>
              </p>
            </div>
          </section>
        </div>

        <p className="mt-10 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/privacy" className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4">
            Privacy Policy
          </Link>
          <Link href="/" className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4">
            Back to Golden Hour Hub
          </Link>
        </p>
      </article>
    </Screen>
  );
}
