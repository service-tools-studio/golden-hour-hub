import { jasminSetupPhone } from "@/lib/auth/messages";

export type HubSetupMessageVariant = "sign-in" | "password-updated";

export function HubSetupMessage({ variant }: { variant: HubSetupMessageVariant }) {
  const lead =
    variant === "password-updated"
      ? "Your password was updated, but your account isn't ready in Hub yet."
      : "Your account isn't ready in Hub yet.";

  return (
    <>
      {lead} Please call Jasmin at{" "}
      <a href={jasminSetupPhone.href} className="underline underline-offset-2">
        {jasminSetupPhone.display}
      </a>{" "}
      to finish setting up your account.
    </>
  );
}
