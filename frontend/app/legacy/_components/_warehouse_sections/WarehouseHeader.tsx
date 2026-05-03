"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { LoadFailureCard } from "../common/LoadFailureCard";

export function WarehouseHeader({ loadFailure }: { loadFailure: string | null }) {
  return (
    <>
      <header className="pb-1">
        <h1 className="text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>
          입출고 작업
        </h1>
      </header>
      {loadFailure && <LoadFailureCard message={loadFailure} />}
    </>
  );
}
