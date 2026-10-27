"use client";

import { useEffect } from "react";
import { installClientErrorListeners } from "@/lib/client-events";

/** Observe uncaught browser failures without changing the current screen. */
export function ClientErrorReporter(): null {
  useEffect(installClientErrorListeners, []);
  return null;
}
