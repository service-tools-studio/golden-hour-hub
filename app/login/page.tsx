import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { cognitoConfigured, previewAuthEnabled } from "@/lib/auth/config";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";
import { LoginSessionRedirect } from "@/components/login-session-redirect";

export default async function LoginPage() {
  if (previewAuthEnabled()) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ink/50">Golden Hour Cleaning Co.</p>
      {cognitoConfigured() ? (
        <>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Welcome to Golden Hour Hub</h1>
          <p className="mt-3 text-base leading-6 text-ink/70">
            Your home for all things scheduling! View upcoming cleaning jobs, respond to invitations, and keep your
            availability up to date — all in one convenient place.
          </p>
          <p className="mt-3 text-base leading-6 text-ink/70">Sign in below to get started.</p>
        </>
      ) : (
        <>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-base leading-6 text-ink/70">
          Sign-in is not configured yet. Add <code className="text-sm">COGNITO_*</code> and{" "}
          <code className="text-sm">AUTH_SESSION_SECRET</code> to <code className="text-sm">.env.local</code>
          {previewAuthAllowed() ? (
            <>
              , or leave <code className="text-sm">AUTH_SESSION_SECRET</code> empty to use preview mode at{" "}
              <a href="/" className="font-semibold underline">/</a>.
            </>
          ) : (
            "."
          )}
        </p>
        </>
      )}
      {cognitoConfigured() ? <LoginSessionRedirect /> : null}
      {cognitoConfigured() ? <LoginForm /> : null}
    </main>
  );
}
