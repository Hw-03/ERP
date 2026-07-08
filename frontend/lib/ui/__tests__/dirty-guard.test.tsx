import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  DirtyGuardProvider,
  useConfirmNavigation,
  useLocalDirtyGuard,
  useRegisterDirty,
} from "@/lib/ui/dirty-guard";

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

describe("dirty-guard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("등록된 dirty 상태가 없으면 바로 이동한다", () => {
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

  it("dirty=false 등록 상태도 바로 이동한다", () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <RegisteredSection sectionKey="s1" dirty={false} save={save} onProceed={proceed} />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "이동" }));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dirty=true 등록 상태에서는 PC 저장 모달을 명확한 문구로 보여준다", () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <RegisteredSection sectionKey="s1" dirty={true} save={save} onProceed={proceed} />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "이동" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("작성 중인 입출고가 있어요")).toBeInTheDocument();
    expect(screen.getByText(/임시저장하면 ‘내 요청’에서 이어서 진행할 수 있습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "임시저장하고 이동" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장 안 하고 나가기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계속 작성" })).toBeInTheDocument();
    expect(proceed).not.toHaveBeenCalled();
  });

  it("임시저장하고 이동은 save 후 proceed를 호출한다", async () => {
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

  it("저장 안 하고 나가기는 save 없이 proceed만 호출한다", () => {
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

  it("ESC는 이동과 저장을 모두 취소한다", () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <RegisteredSection sectionKey="s1" dirty={true} save={save} onProceed={proceed} />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "이동" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(proceed).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("여러 section 중 dirty인 항목의 save만 호출한다", async () => {
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

  it("local dirty guard도 같은 공통 모달 문구와 폐기 동작을 사용한다", () => {
    const proceed = vi.fn();
    const save = vi.fn();
    render(
      <DirtyGuardProvider>
        <LocalSection dirty={true} save={save} onProceed={proceed} />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "로컬이동" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("작성 중인 입출고가 있어요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장 안 하고 나가기" }));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("confirm-only mode는 저장 버튼 없이 이탈 확인만 보여준다", () => {
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
    expect(screen.getByText("이 화면에서 나갈까요?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "임시저장하고 이동" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "나가기" }));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
