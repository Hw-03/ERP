import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  DirtyGuardProvider,
  useFlushDirtyEntries,
  useRegisterDirty,
  useBeforeViewportSwitch,
} from "@/lib/ui/dirty-guard";

function ViewportProbe({
  cleanSave,
  dirtySave,
  changeShell,
  failure,
  confirmOnly = false,
}: {
  cleanSave: () => Promise<void> | void;
  dirtySave: () => Promise<void> | void;
  changeShell: () => void;
  failure: (error: unknown) => void;
  confirmOnly?: boolean;
}) {
  const [dirty, setDirty] = useState(true);
  const flush = useFlushDirtyEntries();
  useRegisterDirty("clean", false, cleanSave);
  useRegisterDirty("dirty", dirty, async () => {
    await dirtySave();
    setDirty(false);
  }, undefined, {
    mode: confirmOnly ? "confirm-only" : "save",
  });
  return <button type="button" onClick={() => void flush().then(changeShell).catch(failure)}>화면 전환</button>;
}

function SwitchProbe({ onReady }: { onReady: (handler: () => Promise<void | boolean>) => void }) {
  const handler = useBeforeViewportSwitch();
  useEffect(() => onReady(handler), [handler, onReady]);
  return null;
}

describe("dirty guard viewport flush", () => {
  it("asks before discarding a wizard and returns false when the user stays", async () => {
    const save = vi.fn();
    let handler: (() => Promise<void | boolean>) | undefined;
    render(<DirtyGuardProvider><ViewportProbe cleanSave={vi.fn()} dirtySave={save} changeShell={vi.fn()} failure={vi.fn()} confirmOnly /><SwitchProbe onReady={(next) => { handler = next; }} /></DirtyGuardProvider>);
    let result: Promise<void | boolean> | undefined;
    act(() => { result = handler?.(); });
    fireEvent.click(screen.getByRole("button", { name: "계속 머무르기" }));
    await expect(result).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
    act(() => { result = handler?.(); });
    fireEvent.click(screen.getByRole("button", { name: "나가기", exact: true }));
    await expect(result).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
  it("saves only dirty entries before the shell changes", async () => {
    const cleanSave = vi.fn();
    const dirtySave = vi.fn().mockResolvedValue(undefined);
    const changeShell = vi.fn();
    const failure = vi.fn();

    render(
      <DirtyGuardProvider>
        <ViewportProbe cleanSave={cleanSave} dirtySave={dirtySave} changeShell={changeShell} failure={failure} />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "화면 전환" }));
    await waitFor(() => expect(changeShell).toHaveBeenCalledTimes(1));

    expect(dirtySave).toHaveBeenCalledTimes(1);
    expect(cleanSave).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });

  it("rejects a viewport switch when a dirty entry cannot be auto-saved", async () => {
    const cleanSave = vi.fn();
    const dirtySave = vi.fn();
    const changeShell = vi.fn();
    const failure = vi.fn();

    render(
      <DirtyGuardProvider>
        <ViewportProbe
          cleanSave={cleanSave}
          dirtySave={dirtySave}
          changeShell={changeShell}
          failure={failure}
          confirmOnly
        />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "화면 전환" }));
    await waitFor(() => expect(failure).toHaveBeenCalledWith(new Error("현재 작업은 자동 저장할 수 없습니다.")));
    expect(changeShell).not.toHaveBeenCalled();
    expect(dirtySave).not.toHaveBeenCalled();
  });
});
