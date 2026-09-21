import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider, useRegisterDirty } from "@/lib/ui/dirty-guard";
import { DesktopTabHomeProvider, useDesktopTabHome, useDesktopTabHomeController, useDesktopQueryState } from "../DesktopTabHome";

function Harness({ initialHome = false, busy = false, save = async () => {} }: {
  initialHome?: boolean; busy?: boolean; save?: () => Promise<void>;
}) {
  const [home, setHome] = useState(initialHome);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const { requestHome, returnSequence } = useDesktopTabHomeController();
  useRegisterDirty("work", !!text, async () => {
    setSaving(true);
    try { await save(); } finally { setSaving(false); }
  });
  useDesktopTabHome("screen", { isHome: home, busy: busy || saving, returnHome: () => { setHome(true); setText(""); } });
  return <><button onClick={() => requestHome()}>현재 탭</button><input aria-label="작성" value={text} onChange={(e) => setText(e.target.value)} />
    <output>{home ? "첫 화면" : "하위 화면"}</output><span data-testid="sequence">{returnSequence}</span></>;
}

function setup(props: Parameters<typeof Harness>[0] = {}) {
  return render(<DirtyGuardProvider><DesktopTabHomeProvider><Harness {...props} /></DesktopTabHomeProvider></DirtyGuardProvider>);
}

describe("PC 첫 화면 복귀와 실제 미저장 보호", () => {
  it("닫힌 하위 화면의 조회 조건만 다시 열 때 복원한다", () => {
    function Query() {
      const [search, setSearch] = useDesktopQueryState("query-test", "");
      return <input aria-label="조회 검색" value={search} onChange={(event) => setSearch(event.target.value)} />;
    }
    function Owner() {
      const [open, setOpen] = useState(true);
      return <><button onClick={() => setOpen(!open)}>상세 토글</button>{open && <Query />}</>;
    }
    render(<DirtyGuardProvider><DesktopTabHomeProvider><Owner /></DesktopTabHomeProvider></DirtyGuardProvider>);
    fireEvent.change(screen.getByLabelText("조회 검색"), { target: { value: "전극" } });
    fireEvent.click(screen.getByText("상세 토글"));
    fireEvent.click(screen.getByText("상세 토글"));
    expect(screen.getByLabelText("조회 검색")).toHaveValue("전극");
  });

  it("재렌더 후 최신 콜백을 사용하고 등록 해제된 화면은 호출하지 않는다", () => {
    const returned = vi.fn();
    function Child({ value }: { value: number }) {
      useDesktopTabHome("latest", { isHome: false, returnHome: () => returned(value) });
      return null;
    }
    function Owner() {
      const [value, setValue] = useState(1);
      const [visible, setVisible] = useState(true);
      const { requestHome } = useDesktopTabHomeController();
      return <><button onClick={() => setValue(2)}>수정</button><button onClick={() => setVisible(false)}>해제</button>
        <button onClick={() => requestHome()}>복귀</button>{visible && <Child value={value} />}</>;
    }
    render(<DirtyGuardProvider><DesktopTabHomeProvider><Owner /></DesktopTabHomeProvider></DirtyGuardProvider>);
    fireEvent.click(screen.getByText("수정"));
    fireEvent.click(screen.getByText("복귀"));
    expect(returned).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByText("해제"));
    fireEvent.click(screen.getByText("복귀"));
    expect(returned).toHaveBeenCalledOnce();
  });
  it("이미 첫 화면이면 입력과 모션 횟수를 유지한다", () => {
    setup({ initialHome: true });
    fireEvent.change(screen.getByLabelText("작성"), { target: { value: "일보 초안" } });
    fireEvent.click(screen.getByText("현재 탭"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("작성")).toHaveValue("일보 초안");
    expect(screen.getByTestId("sequence")).toHaveTextContent("0");
  });
  it("빈 하위 화면은 한 번만 복귀한다", () => {
    setup();
    fireEvent.click(screen.getByText("현재 탭"));
    fireEvent.click(screen.getByText("현재 탭"));
    expect(screen.getByText("첫 화면")).toBeInTheDocument();
    expect(screen.getByTestId("sequence")).toHaveTextContent("1");
  });
  it("경고 취소 뒤 다시 요청해 폐기할 수 있다", () => {
    setup();
    fireEvent.change(screen.getByLabelText("작성"), { target: { value: "작성 중" } });
    fireEvent.click(screen.getByText("현재 탭"));
    fireEvent.click(screen.getByText("계속 작성"));
    expect(screen.getByLabelText("작성")).toHaveValue("작성 중");
    expect(screen.getByText("하위 화면")).toBeInTheDocument();
    fireEvent.click(screen.getByText("현재 탭"));
    fireEvent.click(screen.getByText("저장 안 하고 나가기"));
    expect(screen.getByText("첫 화면")).toBeInTheDocument();
    expect(screen.getByTestId("sequence")).toHaveTextContent("1");
  });
  it("저장 실패 시 입력과 하위 화면을 유지한다", async () => {
    const save = vi.fn().mockRejectedValue(new Error("실패"));
    setup({ save });
    fireEvent.change(screen.getByLabelText("작성"), { target: { value: "작성 중" } });
    fireEvent.click(screen.getByText("현재 탭"));
    fireEvent.click(screen.getByText("저장하고 이동"));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(screen.getByText("하위 화면")).toBeInTheDocument();
    expect(screen.getByTestId("sequence")).toHaveTextContent("0");
  });
  it("비동기 저장 성공 후 busy 해제를 반영하고 복귀한다", async () => {
    let finish!: () => void;
    setup({ save: () => new Promise<void>((resolve) => { finish = resolve; }) });
    fireEvent.change(screen.getByLabelText("작성"), { target: { value: "작성 중" } });
    fireEvent.click(screen.getByText("현재 탭"));
    fireEvent.click(screen.getByText("저장하고 이동"));
    await waitFor(() => expect(finish).toBeDefined());
    finish();
    await waitFor(() => expect(screen.getByText("첫 화면")).toBeInTheDocument());
    expect(screen.getByTestId("sequence")).toHaveTextContent("1");
  });
  it("실행 중에는 복귀하거나 경고하지 않는다", () => {
    setup({ busy: true });
    fireEvent.click(screen.getByText("현재 탭"));
    expect(screen.getByText("하위 화면")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
