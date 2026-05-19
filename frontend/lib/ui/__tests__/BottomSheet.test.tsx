import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BottomSheet } from "@/lib/ui/BottomSheet";

function getSheet() {
  // 핸들 버튼의 부모가 스크롤 시트 컨테이너(터치 핸들러 부착 대상)
  return screen.getByLabelText("시트 닫기 핸들").parentElement as HTMLElement;
}

describe("BottomSheet", () => {
  afterEach(() => vi.restoreAllMocks());

  it("open=true 시 title 과 children 렌더", () => {
    render(
      <BottomSheet open onClose={() => {}} title="품목 선택">
        <p>본문</p>
      </BottomSheet>,
    );
    expect(screen.getByText("품목 선택")).toBeInTheDocument();
    expect(screen.getByText("본문")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("open=false 면 아무것도 렌더 안 함", () => {
    render(
      <BottomSheet open={false} onClose={() => {}} title="hidden">
        <p>본문</p>
      </BottomSheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape / 배경 탭 / 핸들 클릭 → onClose", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="t">
        <p>본문</p>
      </BottomSheet>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.click(screen.getByLabelText("시트 닫기 핸들"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("핸들에서 임계 이상 끌어내리면 onClose", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="t" dismissThresholdPx={96}>
        <p>본문</p>
      </BottomSheet>,
    );
    const sheet = getSheet();
    fireEvent.touchStart(sheet, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientY: 320 }] }); // dy=220 > 96
    fireEvent.touchEnd(sheet, { changedTouches: [{ clientY: 320 }] });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("임계 미만으로 끌면 닫히지 않고 스냅백", () => {
    const onClose = vi.fn();
    // 느린 드래그 → 속도 임계도 못 넘게 performance.now 제어
    let t = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (t += 1000));
    render(
      <BottomSheet open onClose={onClose} title="t" dismissThresholdPx={96}>
        <p>본문</p>
      </BottomSheet>,
    );
    const sheet = getSheet();
    fireEvent.touchStart(sheet, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientY: 130 }] }); // dy=30 < 96
    fireEvent.touchEnd(sheet, { changedTouches: [{ clientY: 130 }] });
    expect(onClose).not.toHaveBeenCalled();
  });
});
