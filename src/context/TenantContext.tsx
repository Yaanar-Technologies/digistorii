// C:\Users\yanna\digistorii\src\context\TenantContext.tsx
"use client";

import React, { createContext, useContext } from "react";

type TenantContextType = {
  company: string;
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: { company: string };
}) {
  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (!context) throw new Error("useTenant must be used within TenantProvider");
  return context;
};