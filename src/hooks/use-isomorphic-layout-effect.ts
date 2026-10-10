"use client";

import { useEffect, useLayoutEffect } from "react";

/**
 * `useLayoutEffect` in the browser, `useEffect` on the server.
 *
 * Reading browser-only state (measurements, stored preferences) must happen
 * after the markup exists but before the browser paints, otherwise the user
 * sees the pre-read state flash first. React warns when `useLayoutEffect`
 * runs during server rendering, so the server keeps the passive effect.
 */
export const useIsomorphicLayoutEffect =
	typeof window !== "undefined" ? useLayoutEffect : useEffect;
