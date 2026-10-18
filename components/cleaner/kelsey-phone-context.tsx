"use client";

import { createContext, useContext } from "react";

const KelseyPhoneDigitsContext = createContext("");

export function KelseyPhoneProvider({
  phoneDigits,
  children,
}: {
  phoneDigits: string;
  children: React.ReactNode;
}) {
  return <KelseyPhoneDigitsContext.Provider value={phoneDigits}>{children}</KelseyPhoneDigitsContext.Provider>;
}

export function useKelseyPhoneDigits(): string {
  return useContext(KelseyPhoneDigitsContext);
}
