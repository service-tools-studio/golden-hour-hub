import Link from "next/link";
import { HeaderAuthAction } from "@/components/header-auth-action";
import { PageHeaderBrand } from "@/components/page-header-brand";

const DEFAULT_PAGE_HEADER_EYEBROW = "Golden Hour Hub";

export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-dvh w-full max-w-md pb-28">{children}</div>;
}

type Crumb = { label: string; href?: string; onClick?: () => void };

export function PageHeader({
  eyebrow = DEFAULT_PAGE_HEADER_EYEBROW,
  crumb,
  crumbs,
  title,
  titleHref,
  current,
  subtitle,
  action,
}: {
  eyebrow?: string;
  crumb?: Crumb;
  crumbs?: Crumb[];
  title: string;
  titleHref?: string;
  current?: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const trail = crumbs ?? (crumb ? [crumb] : undefined);
  const bar = (
    <div className="flex items-start justify-between gap-3">
      {trail ? (
        <nav aria-label="Breadcrumb" className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center text-sm text-ink/55">
          {trail.map((item, index) => (
            <span key={`${item.label}-${index}`} className="inline-flex items-center whitespace-nowrap">
              {index > 0 ? (
                <span className="px-1.5" aria-hidden="true">
                  /
                </span>
              ) : null}
              {item.href ? (
                <Link href={item.href} className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4">
                  {item.label}
                </Link>
              ) : (
                <button type="button" onClick={item.onClick} className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4">
                  {item.label}
                </button>
              )}
            </span>
          ))}
          <span className="inline-flex items-center whitespace-nowrap">
            <span className="px-1.5" aria-hidden="true">
              /
            </span>
            {titleHref ? (
              <Link href={titleHref} className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4">
                {title}
              </Link>
            ) : (
              <span>{title}</span>
            )}
          </span>
          {current ? (
            <span className="inline-flex items-center whitespace-nowrap">
              <span className="px-1.5" aria-hidden="true">
                /
              </span>
              <span aria-current="page">{current}</span>
            </span>
          ) : null}
        </nav>
      ) : (
        eyebrow === DEFAULT_PAGE_HEADER_EYEBROW ? (
          <PageHeaderBrand />
        ) : (
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/50">{eyebrow}</p>
        )
      )}
      <HeaderAuthAction />
    </div>
  );
  return (
    <>
      <header className={trail ? "sticky top-0 z-20 bg-cream px-5 pb-2 pt-2" : "px-5 pt-6"}>{bar}</header>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-base text-ink/70">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </>
  );
}

export function Card({
  children,
  className = "",
  muted = false,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
  onClick?: () => void;
}) {
  const classes = `rounded-3xl p-4 ${muted
      ? "bg-[#e6e4de] text-ink/45 shadow-none [&_p]:text-ink/45"
      : "bg-white text-ink shadow-[0_8px_30px_rgba(51,51,51,0.06)]"
    } ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${classes} w-full text-left`}>
        {children}
      </button>
    );
  }
  return <section className={classes}>{children}</section>;
}

export function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

export function AlertIcon({ className, label = "Alert" }: { className: string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} role="img" aria-label={label}>
      <circle cx="12" cy="12" r="11" className="fill-red-600" />
      <path d="M12 6.5v7" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="17.25" r="1.5" fill="white" />
    </svg>
  );
}

export function ButtonSpinner({ tone = "onDark" }: { tone?: "onDark" | "onLight" }) {
  const spinClass =
    tone === "onDark"
      ? "border-cream/40 border-t-cream"
      : "border-current border-t-transparent";
  return (
    <span
      className={`inline-block size-4 shrink-0 animate-spin rounded-full border-2 ${spinClass}`}
      aria-hidden="true"
    />
  );
}

export function ButtonLoadingLabel({
  label,
  tone = "onDark",
}: {
  label: string;
  tone?: "onDark" | "onLight";
}) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <ButtonSpinner tone={tone} />
      {label}
    </span>
  );
}

export function Notice({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  const error = tone !== "ok";
  return (
    <p
      className={`rounded-2xl px-4 py-3 text-base leading-6 ${error ? "bg-red-50 font-semibold text-red-700 ring-1 ring-red-600" : "bg-mint font-medium text-ink"
        }`}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

/** Inline validation or save errors shown directly above form submit actions. */
export function FormSubmitNotice({
  message,
  tone = "error",
}: {
  message: string | null;
  tone?: "error" | "ok";
}) {
  if (!message) return null;
  return <Notice tone={tone}>{message}</Notice>;
}

export function PrimaryButton({
  children,
  type = "button",
  onClick,
  disabled,
  loading = false,
  loadingLabel = "Saving…",
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}) {
  const busy = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy}
      aria-busy={loading}
      className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-ink px-4 text-base font-semibold text-cream disabled:opacity-50"
    >
      {loading ? <ButtonLoadingLabel label={loadingLabel} /> : children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  loading = false,
  loadingLabel = "Saving…",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}) {
  const busy = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy}
      aria-busy={loading}
      className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-white px-4 text-base font-semibold text-ink ring-1 ring-ink/15 disabled:opacity-50"
    >
      {loading ? <ButtonLoadingLabel label={loadingLabel} tone="onLight" /> : children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  error,
  id,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  error?: string;
  id?: string;
}) {
  return (
    <label id={id} className="block">
      <div className="mb-1.5">
        <span className={`block text-sm font-medium ${error ? "text-red-700" : "text-ink/80"}`}>{label}</span>
        {hint ? <p className="mt-0.5 text-sm text-ink/60">{hint}</p> : null}
      </div>
      {children}
      {error ? (
        <span role="alert" className="mt-1.5 block text-sm font-semibold text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export const fieldClass =
  "min-h-12 w-full rounded-2xl border border-ink/15 bg-white px-3 text-base text-ink outline-none focus:border-ink";
