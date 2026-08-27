"use client";

import React, { createContext, useContext } from "react";
import { StorefrontTheme } from "./types";
import { mockTheme } from "./fixtures";

export const StorefrontThemeContext = createContext<StorefrontTheme>(mockTheme);

export const useStorefrontTheme = (): StorefrontTheme => {
  return useContext(StorefrontThemeContext);
};

export const StorefrontThemeProvider: React.FC<{
  theme: StorefrontTheme;
  children: React.ReactNode;
}> = ({ theme, children }) => {
  return (
    <StorefrontThemeContext.Provider value={theme}>
      {children}
    </StorefrontThemeContext.Provider>
  );
};
