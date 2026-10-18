"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";

const RegisterRemoteSyncBlockerContext = createContext<((check: () => boolean) => () => void) | null>(null);

/** Pause background hub refresh while local edits are in progress (unsaved forms). */
export function useHubSyncBlocker(blocked: () => boolean) {
  const register = useContext(RegisterRemoteSyncBlockerContext);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const check = useCallback(() => blockedRef.current(), []);

  useEffect(() => {
    if (!register) return;
    return register(check);
  }, [register, check]);
}

export function HubRemoteSyncBlockerProvider({
  register,
  children,
}: {
  register: (check: () => boolean) => () => void;
  children: React.ReactNode;
}) {
  return <RegisterRemoteSyncBlockerContext.Provider value={register}>{children}</RegisterRemoteSyncBlockerContext.Provider>;
}
