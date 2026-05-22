---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/common/__tests__/ConfirmModal.test.tsx
status: active
updated: 2026-04-27
source_sha: ad5fbe2b7cf0
tags:
  - erp
  - frontend
  - test
  - tsx
---

# ConfirmModal.test.tsx

> [!summary] 역할
> 현재 ERP 동작을 회귀 없이 유지하기 위한 자동 테스트 파일이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/common/__tests__/ConfirmModal.test.tsx`
- Layer: `frontend`
- Kind: `test`
- Size: `1879` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/common/__tests__/__tests__|frontend/app/legacy/_components/common/__tests__]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 기능 변경 후 같은 영역 테스트를 먼저 확인한다.
- 테스트가 문서보다 최신 동작을 더 정확히 말해줄 때가 많다.

## 원본 발췌

````tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "../ConfirmModal";

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
# ... (이하 32줄 생략. 원본 참조)

````
