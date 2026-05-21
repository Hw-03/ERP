---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/__tests__/BottomSheet.test.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BottomSheet.test.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/ui/__tests__/BottomSheet.test.tsx]]

## 원본 첫 줄

```
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
```
