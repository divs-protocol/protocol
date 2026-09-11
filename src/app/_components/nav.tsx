"use client";

import { createContext, useContext } from "react";

/**
 * Section navigation for controls that sit below the shell.
 *
 * Sections are real routes; the shell supplies a function that pushes one, so a
 * button in the footer or the landing view does not need its own router.
 */
export const NavContext = createContext<(section: string) => void>(() => {});
export const useNav = () => useContext(NavContext);
