import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy Policy | Golden Hour Hub",
  description: "Privacy policy for Golden Hour Hub.",
};

export default function PrivacyPage() {
  return (
    <Screen>
      <article className="px-5 py-8 text-ink">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink/70">Effective Date: October 16, 2026</p>

        <div className="mt-6 space-y-6 text-sm leading-6 text-ink/90">
          <p>
            Golden Hour Hub is a private scheduling and contractor management platform operated by Heart Aligned
            Wellness LLC, doing business as Golden Hour Cleaning Co. (&quot;Golden Hour Cleaning Co.,&quot; &quot;we,&quot;
            &quot;us,&quot; or &quot;our&quot;).
          </p>
          <p>
            This Privacy Policy explains how we collect, use, store, and protect personal information provided by
            independent cleaning contractors who use Golden Hour Hub, including information associated with our SMS
            notification program.
          </p>

          <section>
            <h2 className="text-base font-semibold text-ink">1. Information We Collect</h2>
            <p className="mt-2">We may collect the following information:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Name, email address, and mobile phone number.</li>
              <li>Account credentials and authentication information.</li>
              <li>Work availability, scheduling preferences, and job assignments.</li>
              <li>Job confirmations, responses, and scheduling communications.</li>
              <li>SMS notification preferences, consent records, and opt-out status.</li>
              <li>Technical information necessary to operate and secure the platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">2. How We Use Information</h2>
            <p className="mt-2">We use collected information to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Create and manage Golden Hour Hub accounts.</li>
              <li>Coordinate cleaning assignments and contractor schedules.</li>
              <li>Send job invitations, scheduling confirmations, reminders, and assignment updates.</li>
              <li>Communicate important operational information.</li>
              <li>Maintain accurate records of SMS consent and communication preferences.</li>
              <li>Maintain the security, functionality, and reliability of our platform.</li>
            </ul>
            <p className="mt-2">We do not use our contractor SMS notification program to send marketing or promotional messages.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">3. SMS Messaging and Consent</h2>
            <p className="mt-2">
              Contractors may voluntarily opt in to receive automated SMS notifications from Golden Hour Cleaning Co.
              through Golden Hour Hub.
            </p>
            <p className="mt-2">
              Messages may include job invitations, assignment confirmations, schedule changes, upcoming job reminders,
              and availability requests.
            </p>
            <p className="mt-2">Message frequency varies depending on scheduling activity. Message and data rates may apply.</p>
            <p className="mt-2">
              Consent is collected separately from acceptance of our{" "}
              <Link href="/terms" className="font-semibold underline decoration-gold decoration-2 underline-offset-4">
                Terms and Conditions
              </Link>
              . Contractors may withdraw SMS consent at any time by replying STOP to a message or contacting us directly.
            </p>
            <p className="mt-2">Reply HELP for assistance.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">4. Information Sharing</h2>
            <p className="mt-2">
              We do not sell or share your SMS opt-in data or personal information with third parties for marketing
              purposes.
            </p>
            <p className="mt-2">
              Mobile phone numbers, SMS consent records, and messaging opt-in information are not shared with third parties
              or affiliates for their own marketing or promotional purposes.
            </p>
            <p className="mt-2">We may use trusted service providers to operate Golden Hour Hub, including:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Twilio for SMS message delivery.</li>
              <li>Amazon Web Services for data storage, authentication, and related infrastructure.</li>
              <li>Vercel for application hosting.</li>
            </ul>
            <p className="mt-2">
              These providers process information only as necessary to deliver services on our behalf, subject to
              applicable agreements and safeguards.
            </p>
            <p className="mt-2">
              We may also disclose information when required by law or when reasonably necessary to protect the security
              and integrity of our platform.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">5. Data Storage and Security</h2>
            <p className="mt-2">
              We use commercially reasonable administrative and technical safeguards to protect personal information.
            </p>
            <p className="mt-2">
              Account authentication is managed through Amazon Cognito, and application data is stored using Amazon
              DynamoDB.
            </p>
            <p className="mt-2">
              Access to contractor information is restricted to authorized personnel and service providers with a
              legitimate operational need.
            </p>
            <p className="mt-2">No internet-based service can guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">6. Data Retention</h2>
            <p className="mt-2">
              We retain contractor information for as long as reasonably necessary to operate Golden Hour Hub, administer
              contractor relationships, maintain business records, comply with legal obligations, and resolve disputes.
            </p>
            <p className="mt-2">
              SMS consent and opt-out records may be retained as necessary to document compliance and honor communication
              preferences.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">7. Your Privacy Choices</h2>
            <p className="mt-2">
              Contractors may request to review, correct, or delete eligible personal information by contacting Golden Hour
              Cleaning Co.
            </p>
            <p className="mt-2">
              Certain information may be retained when necessary for legal, accounting, security, or legitimate business
              purposes.
            </p>
            <p className="mt-2">
              SMS notifications can be discontinued by replying STOP. Contractors may request assistance by replying HELP
              or contacting us directly.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">8. Changes to This Policy</h2>
            <p className="mt-2">
              We may update this Privacy Policy periodically. Updates will be published on this page with a revised
              effective date.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-ink">9. Contact Information</h2>
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
          <Link href="/terms" className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4">
            Terms &amp; Conditions
          </Link>
          <Link href="/" className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4">
            Back to Golden Hour Hub
          </Link>
        </p>
      </article>
    </Screen>
  );
}
