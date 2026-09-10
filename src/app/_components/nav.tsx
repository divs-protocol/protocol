"use client";

import { createContext, useContext } from "react";

/**
 * Section routing for CTAs that live below the top nav.
 *
 * The app is one page with a section in state rather than real routes, so a
 * button in the footer or the landing view needs a way to reach the setter
 * without every section threading a callback through its children.
 */
export const NavContext = createContext<(section: string) => void>(() => {});
export const useNav = () => useContext(NavContext);
