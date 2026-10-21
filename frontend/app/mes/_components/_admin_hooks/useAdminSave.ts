"use client";

import { useCallback, useRef, useState } from "react";

/** Share the pending save with navigation guards and reject failures without submitting twice. */
export function useAdminSave<T = void>(): { saving: boolean; run: (action: () => Promise<T>) => Promise<T> } {
  const pending = useRef<Promise<T> | null>(null);
  const [saving, setSaving] = useState(false);
  const run = useCallback((action: () => Promise<T>): Promise<T> => {
    if (pending.current) return pending.current;
    setSaving(true);
    const task = (async () => await action())().finally(() => {
      pending.current = null;
      setSaving(false);
    });
    pending.current = task;
    return task;
  }, []);
  return { saving, run };
}
