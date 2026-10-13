"use client";

import { createContext, useContext } from "react";

const ApiPublicUrlContext = createContext("http://localhost:4000");

/** Hands the runtime `API_PUBLIC_URL` (server-only env) to client components,
 * since `NEXT_PUBLIC_*` values are frozen into the bundle at build time. */
export function ApiPublicUrlProvider({
  apiPublicUrl,
  children,
}: {
  apiPublicUrl: string;
  children: React.ReactNode;
}) {
  return (
    <ApiPublicUrlContext.Provider value={apiPublicUrl}>
      {children}
    </ApiPublicUrlContext.Provider>
  );
}

export const useApiPublicUrl = () => useContext(ApiPublicUrlContext);
