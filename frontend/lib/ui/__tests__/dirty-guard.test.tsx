import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import {
  DirtyGuardProvider,
  useRegisterDirty,
  useConfirmNavigation,
  useLocalDirtyGuard,
} from "@/lib/ui/dirty-guard";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** useConfirmNavigation 을 호출하는 단순 버튼 */
function NavButton({
  onProceed,
  label = "이동",
}: {
  onProceed: () => void;
  label?: string;
}) {
  const confirm = useConfirmNavigation();
  return (
    <button type="button" onClick={() => confirm(onProceed)}>
      {label}
    </button>
  );
}

/** useRegisterDirty + NavButton 조합 래퍼 */
function RegisteredSection({
  sectionKey,
  dirty,
  save,
  onProceed,
}: {
  sectionKey: string;
  dirty: boolean;
  save: () => Promise<void> | void;
  onProceed: () => void;
}) {
  useRegisterDirty(sectionKey, dirty, save);
  return <NavButton onProceed={onProceed} />;
}
/** useRegisterDirty + NavButton confirm-only helper */
function ConfirmOnlyRegisteredSection({
  sectionKey,
  dirty,
  save,
  onProceed,
}: {
  sectionKey: string;
  dirty: boolean;
  save: () => Promise<void> | void;
  onProceed: () => void;
}) {
  useRegisterDirty(sectionKey, dirty, save, undefined, { mode: "confirm-only" });
  return <NavButton onProceed={onProceed} />;
}

/** useLocalDirtyGuard 를 쓰는 컴포넌트 */
function LocalSection({
  dirty,
  save,
  onProceed,
}: {
  dirty: boolean;
  save: () => Promise<void> | void;
  onProceed: () => void;
}) {
  const { confirmNavigation } = useLocalDirtyGuard(dirty, save);
  return (
    <button type="button" onClick={() => confirmNavigation(onProceed)}>
      로컬이동
    </button>
  );
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe("dirty-guard", () => {
  afterEach(() => vi.restoreAllMocks());

  // 케이스 1 — 등록 없을 때 confirmNavigation → proceed 즉시 호출
  it("등록 없을 때 confirmNavigation — proceed 즉시 호출", () => {
    const proceed = vi.fn();
    render(
      <DirtyGuardProvider>
        <NavButton onProceed={proceed} />
      </DirtyGuardProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "이동" }));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // 케이스 2 — dirty=false 등록 후 confirmNavigation → 모달 없이 즉시 proceed
  it("dirty=false 등록 후 confirmNavigation — proceed 즉시 호출 (모달 X)", () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <RegisteredSection
          sectionKey="s1"
          dirty={false}
          save={save}
          onProceed={proceed}
        />
      </DirtyGuardProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "이동" }));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // 케이스 3 — dirty=true 등록 후 confirmNavigation → 모달 노출
  it("dirty=true 등록 후 confirmNavigation — 모달 노출", () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <RegisteredSection
          sectionKey="s1"
          dirty={true}
          save={save}
          onProceed={proceed}
        />
      </DirtyGuardProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "이동" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("작성 중인 내용이 있어요")).toBeInTheDocument();
    expect(screen.getByText(/임시저장하면 나중에 이어서 진행할 수 있습니다/)).toBeInTheDocument();
    expect(proceed).not.toHaveBeenCalled();
  });

  // 케이스 4 — "임시저장하고 이동" → save 호출 후 proceed 호출
  it('"임시저장하고 이동" — save 호출 후 proceed 호출', async () => {
    const proceed = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <DirtyGuardProvider>
        <RegisteredSection sectionKey="s1" dirty={true} save={save} onProceed={proceed} />
      </DirtyGuardProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "이동" }));
    fireEvent.click(screen.getByRole("button", { name: "임시저장하고 이동" }));
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(1);
  });

  // 케이스 5 — "저장 안 하고 나가기" → save 호출 안 함, proceed 호출
  it('"저장 안 하고 나가기" — save 미호출, proceed 호출', () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <RegisteredSection sectionKey="s1" dirty={true} save={save} onProceed={proceed} />
      </DirtyGuardProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "이동" }));
    fireEvent.click(screen.getByRole("button", { name: "저장 안 하고 나가기" }));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  // 케이스 6 — ESC → save·proceed 둘 다 호출 안 함
  it("ESC — save·proceed 둘 다 호출 안 함", () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <RegisteredSection sectionKey="s1" dirty={true} save={save} onProceed={proceed} />
      </DirtyGuardProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "이동" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(proceed).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // 케이스 7 — 다중 섹션 등록, 일부만 dirty → aggregate save가 dirty인 것만 순차 호출
  it("다중 섹션 — dirty인 것만 save 호출", async () => {
    const proceed = vi.fn();
    const saveClean = vi.fn();
    const saveDirty = vi.fn().mockResolvedValue(undefined);

    function MultiSection() {
      useRegisterDirty("clean", false, saveClean);
      useRegisterDirty("dirty", true, saveDirty);
      return <NavButton onProceed={proceed} />;
    }

    render(
      <DirtyGuardProvider>
        <MultiSection />
      </DirtyGuardProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "이동" }));
    fireEvent.click(screen.getByRole("button", { name: "임시저장하고 이동" }));
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(saveDirty).toHaveBeenCalledTimes(1);
    expect(saveClean).not.toHaveBeenCalled();
  });

  // 케이스 8 — useLocalDirtyGuard 단독 사용 (dirty=true → 모달, 저장 안 하고 나가기)
  it("useLocalDirtyGuard — dirty=true → 모달, 저장 안 하고 나가기 동작", () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <LocalSection dirty={true} save={save} onProceed={proceed} />
      </DirtyGuardProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "로컬이동" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장 안 하고 나가기" }));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("confirm-only mode shows a leave confirmation without a save action", () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <ConfirmOnlyRegisteredSection
          sectionKey="shipping"
          dirty={true}
          save={save}
          onProceed={proceed}
        />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "이동" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("이 화면을 나갈까요?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "임시저장하고 이동" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "나가기" }));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
