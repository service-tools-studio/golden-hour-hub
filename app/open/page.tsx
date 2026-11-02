import Link from "next/link";
import { hubSiteMetadata } from "@/lib/site-metadata";

export const metadata = hubSiteMetadata({
  title: "Open Golden Hour Hub",
  description: "Sign in to view cleaning jobs, invitations, and your availability.",
  openGraph: {
    title: "Golden Hour Hub",
    description: "Sign in to view cleaning jobs, invitations, and your availability.",
  },
});

type PageProps = {
  searchParams: Promise<{ from?: string }>;
};

function safeRedirectPath(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  if (!value.startsWith("/") || value.startsWith("//")) return "/cleaner";
  if (value.startsWith("/admin") || value.startsWith("/cleaner") || value.startsWith("/onboarding")) {
    return value;
  }
  return "/cleaner";
}

export default async function OpenHubPage({ searchParams }: PageProps) {
  const { from } = await searchParams;
  const destination = safeRedirectPath(from);
  const loginHref = `/login?from=${encodeURIComponent(destination)}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ink/50">Golden Hour Cleaning Co.</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Golden Hour Hub</h1>
      <p className="mt-3 text-base leading-6 text-ink/70">
        Your home for scheduling — upcoming cleanings, invitations, and availability.
      </p>
      <Link
        href={loginHref}
        className="mt-8 inline-flex min-h-12 items-center justify-center rounded-2xl bg-ink px-6 text-base font-semibold text-cream"
      >
        Sign in to Hub
      </Link>
      <p className="mt-4 text-sm text-ink/55">
        Link from a text message? Sign in with the same email you use for Golden Hour.
      </p>
    </main>
  );
}
