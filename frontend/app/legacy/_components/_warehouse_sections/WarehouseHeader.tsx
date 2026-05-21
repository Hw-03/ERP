"use client";

import { LoadFailureCard } from "../common/LoadFailureCard";

export function WarehouseHeader({ loadFailure }: { loadFailure: string | null }) {
  return loadFailure ? <LoadFailureCard message={loadFailure} /> : null;
}
