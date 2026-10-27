import { useEffect, useState } from "react";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { Item } from "@/lib/api";
import { clearDefectEntryUrl, readDefectEntry, type DefectEntryTarget } from "@/lib/defect-entry";

/** Both shells and browser history use the same URL contract. */
export function useDefectEntry(): { target: DefectEntryTarget | null; returnToHub: () => void } {
  const [target, setTarget] = useState(() => typeof window === "undefined" ? null : readDefectEntry(window.location.search));
  useEffect(() => {
    const restore = (): void => setTarget(readDefectEntry(window.location.search));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  return { target, returnToHub: (): void => { clearDefectEntryUrl(); setTarget(null); } };
}

/** The initial visible code/name represents an exact item ID; editing switches to normal text search. */
export function useDefectEntryFocus(target: DefectEntryTarget | null | undefined, locations: readonly DefectLocation[], items: readonly Item[], search: string, setSearch: (query: string) => void): {
  query: string; itemId: string | null; onChange: (query: string) => void;
} {
  const key = JSON.stringify(target ?? null);
  const [editedKey, setEditedKey] = useState<string | null>(null);
  const focused = Boolean(target && editedKey !== key);
  const location = target ? locations.find((location) => location.item_id === target.itemId) : undefined;
  const item = target ? items.find((candidate) => candidate.item_id === target.itemId) : undefined;
  return {
    query: focused ? location?.mes_code || item?.mes_code || location?.item_name || item?.item_name || "" : search,
    itemId: focused ? target!.itemId : null,
    onChange: (query): void => { setEditedKey(key); setSearch(query); },
  };
}
