---
type: file-explanation
source_path: "frontend/app/legacy/_components/common/__tests__/ConfirmModal.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ConfirmModal.test.tsx — ConfirmModal.test.tsx 설명

## 이 파일은 무엇을 책임지나

`ConfirmModal.test.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/common/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";

describe("ConfirmModal", () => {
  it("open=true 시 title 과 children 렌더", () => {
    render(
      <ConfirmModal
        open
        title="삭제하시겠습니까?"
        onClose={() => {}}
        onConfirm={() => {}}
      >
        <p>되돌릴 수 없습니다</p>
      </ConfirmModal>
    );
    expect(screen.getByText("삭제하시겠습니까?")).toBeInTheDocument();
    expect(screen.getByText("되돌릴 수 없습니다")).toBeInTheDocument();
  });

  it("Escape 키 onClose 호출", () => {
    const onClose = vi.fn();
    render(
      <ConfirmModal
        open
        title="확인"
        onClose={onClose}
        onConfirm={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("busy=true 면 backdrop 클릭 무시 + Escape 무시", () => {
    const onClose = vi.fn();
    render(
      <ConfirmModal
        open
        busy
        title="처리 중"
        onClose={onClose}
        onConfirm={() => {}}
      />
    );
    // backdrop 클릭 (portal 로 document.body 에 그려지므로 screen 으로 조회)
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    // Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("open=false 면 아무것도 렌더 안 함", () => {
```
