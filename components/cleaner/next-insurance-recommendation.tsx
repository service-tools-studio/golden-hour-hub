import {
  NEXT_INSURANCE_PROVIDER_DISCLAIMER,
  NEXT_INSURANCE_REFERRAL_URL,
} from "@/lib/next-insurance-referral";

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Single referral anchor — use for every NEXT Insurance link in the questionnaire. */
export function NextInsuranceReferralLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={NEXT_INSURANCE_REFERRAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}

export function NextInsuranceExploreLink({ className }: { className?: string }) {
  return (
    <NextInsuranceReferralLink
      className={
        className ??
        "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-mint px-4 text-sm font-semibold text-ink shadow-[0_4px_12px_rgba(51,51,51,0.08)] sm:w-auto sm:min-h-12 sm:text-base"
      }
    >
      Explore NEXT Insurance
      <ExternalLinkIcon className="shrink-0 opacity-90" />
    </NextInsuranceReferralLink>
  );
}

export function NextInsuranceRecommendationCard() {
  return (
    <div className="mt-3 rounded-2xl bg-cream/80 p-4 ring-1 ring-ink/8">
      <h3 className="text-base font-semibold text-ink">Need liability insurance?</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink/75">
        We recommend NEXT Insurance for cleaning businesses. You can explore coverage options and request a quote
        online. Be sure your policy covers residential cleaning services performed in Oregon and meets a minimum
        coverage limit of $1 million per occurrence.
      </p>
      <div className="mt-4">
        <NextInsuranceExploreLink />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink/60">{NEXT_INSURANCE_PROVIDER_DISCLAIMER}</p>
    </div>
  );
}

export function NextInsuranceOregonCoverageHelper() {
  return (
    <div className="mt-3 rounded-xl bg-white/80 px-3 py-3 ring-1 ring-ink/8">
      <p className="text-sm leading-relaxed text-ink/75">
        Please contact your insurance provider to confirm whether your policy covers cleaning services performed in
        Oregon. If you need different coverage, you can explore options through{" "}
        <NextInsuranceReferralLink className="font-semibold text-ink underline underline-offset-2">
          NEXT Insurance
        </NextInsuranceReferralLink>{" "}
        or another provider.
      </p>
    </div>
  );
}
