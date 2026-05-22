---
type: file-explanation
source_path: "frontend/lib/ui/__tests__/BottomSheet.test.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BottomSheet.test.tsx — BottomSheet.test.tsx 설명

## 이 파일은 무엇을 책임지나

`BottomSheet.test.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/ui/__tests__/BottomSheet.test.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/lib/ui/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
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
```
