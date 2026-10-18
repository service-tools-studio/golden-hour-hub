"use client";

import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";

const className = "-mt-0.5 shrink-0 self-start text-sm font-medium text-ink/60";

export function HeaderAuthAction() {
  const hub = useHub();
  const router = useRouter();

  if (hub.previewAuth) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          void (async () => {
            await hub.signOut();
            router.replace("/");
          })();
        }}
      >
        Switch
      </button>
    );
  }

  if (!hub.role) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void (async () => {
          await hub.signOut();
          window.location.replace("/login");
        })();
      }}
    >
      Log out
    </button>
  );
}
