import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  DirtyGuardProvider,
  useFlushDirtyEntries,
  useRegisterDirty,
} from "@/lib/ui/dirty-guard";

function FlushProbe({
  onReady,
}: {
  onReady: (flush: () => Promise<void>) => void;
}) {
  const flush = useFlushDirtyEntries();
  useEffect(() => onReady(flush), [flush, onReady]);
  return null;
}

function RegisteredEntries({
  cleanSave,
  dirtySave,
  confirmOnly = false,
}: {
  cleanSave: () => Promise<void> | void;
  dirtySave: () => Promise<void> | void;
  confirmOnly?: boolean;
}) {
  useRegisterDirty("clean", false, cleanSave);
  useRegisterDirty("dirty", true, dirtySave, undefined, {
    mode: confirmOnly ? "confirm-only" : "save",
  });
  return null;
}

describe("dirty guard viewport flush", () => {
  it("saves only dirty entries before the shell changes", async () => {
    const cleanSave = vi.fn();
    const dirtySave = vi.fn().mockResolvedValue(undefined);
    let flush: (() => Promise<void>) | undefined;

    render(
      <DirtyGuardProvider>
        <RegisteredEntries cleanSave={cleanSave} dirtySave={dirtySave} />
        <FlushProbe onReady={(handler) => { flush = handler; }} />
      </DirtyGuardProvider>,
    );

    await act(async () => flush?.());

    expect(dirtySave).toHaveBeenCalledTimes(1);
    expect(cleanSave).not.toHaveBeenCalled();
  });

  it("rejects a viewport switch when a dirty entry cannot be auto-saved", async () => {
    const cleanSave = vi.fn();
    const dirtySave = vi.fn();
    let flush: (() => Promise<void>) | undefined;

    render(
      <DirtyGuardProvider>
        <RegisteredEntries
          cleanSave={cleanSave}
          dirtySave={dirtySave}
          confirmOnly
        />
        <FlushProbe onReady={(handler) => { flush = handler; }} />
      </DirtyGuardProvider>,
    );

    await expect(flush?.()).rejects.toThrow("현재 작업은 자동 저장할 수 없습니다.");
    expect(dirtySave).not.toHaveBeenCalled();
  });
});
