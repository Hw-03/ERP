import { useRef, useState } from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { IoBatch } from "@/lib/api";
import { useIoDraft } from "../useIoDraft";
import { useIoSubmit } from "../useIoSubmit";
import { useIoWorkState } from "../useIoWorkState";
import { useIoDraftRestore } from "../useIoDraftRestore";
import { IoConfirmStep } from "../IoConfirmStep";

const io = vi.hoisted(() => ({ saveDraft: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: io }));
vi.mock("../../_defect_hub/ReasonFormFields", () => ({ ReasonFormFields: ({ category, memo, onCategoryChange, onMemoChange }: any) => <>
  <input aria-label="사유 카테고리" value={category} onChange={(event) => onCategoryChange(event.target.value, "category-id")} />
  <input aria-label="사유 메모" value={memo} onChange={(event) => onMemoChange(event.target.value)} />
</> }));
beforeEach(() => { vi.clearAllMocks(); io.saveDraft.mockResolvedValue({ batch_id: "draft" }); io.submit.mockResolvedValue({ status: "completed" }); });

const payload = { employeeId: "employee", workType: "defect" as const, subType: "defect_quarantine" as const, bundles: [],
  reasonCategoryId: "category-id", reasonCategory: "스크래치", notes: "왼쪽" };

it("불량격리 임시저장과 제출은 선택한 사유 ID·이름을 함께 전송한다", async () => {
  const draft = renderHook(() => useIoDraft());
  const submit = renderHook(() => useIoSubmit());
  await act(async () => { await draft.result.current.saveDraft(payload); await submit.result.current.submit(payload); });
  for (const call of [io.saveDraft.mock.calls.at(-1), io.submit.mock.calls.at(-1)]) {
    expect(call?.[0]).toMatchObject({ reason_category_id: "category-id", reason_category: "스크래치", notes: "왼쪽" });
  }
});

it("불량격리 초안 복원은 사유 ID·이름·메모를 복구한다", () => {
  const batch = { batch_id: "restore", work_type: "defect", sub_type: "defect_quarantine", bundles: [],
    reason_category_id: "category-id", reason_category: "스크래치", notes: "왼쪽" } as unknown as IoBatch;
  const restored = renderHook(() => {
    const state = useIoWorkState();
    const restoredDraftRef = useRef<string | null>(null), restoredNonceRef = useRef<number | null>(null), autosaveBatchIdRef = useRef<string | null>(null);
    useIoDraftRestore({ draftToRestore: batch, state, restoredDraftRef, restoredNonceRef, autosaveBatchIdRef, onStatusChange: vi.fn() });
    return state;
  });
  expect(restored.result.current).toMatchObject({ reasonCategoryId: "category-id", reasonCategory: "스크래치", notes: "왼쪽" });
});

it("빈 사유의 불량격리 초안은 저장할 수 있다", async () => {
  const draft = renderHook(() => useIoDraft());
  await act(async () => { await draft.result.current.saveDraft({ ...payload, reasonCategory: "", reasonCategoryId: null, notes: "" }); });
  expect(io.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ reason_category_id: null, reason_category: null }));
});

it("일반 입출고는 불량 사유 필드를 전송하지 않는다", async () => {
  const submit = renderHook(() => useIoSubmit());
  await act(async () => { await submit.result.current.submit({ ...payload, workType: "process", subType: "adjust_in" }); });
  expect(io.submit.mock.calls[0][0]).not.toHaveProperty("reason_category");
  expect(io.submit.mock.calls[0][0]).not.toHaveProperty("reason_category_id");
});

function Confirm() {
  const [category, setCategory] = useState(""), [memo, setMemo] = useState("");
  const bundles = [{ bundle_id: "bundle", source_kind: "manual", title: "품목", quantity: 1, source_item_id: "item", source_mes_code: null, expanded_level: 1,
    lines: [{ line_id: "line", item_id: "item", item_name: "품목", quantity: 1, included: true, direction: "defective", from_bucket: "production", to_bucket: "defective", shortage: 0 }] }];
  return <IoConfirmStep employeeId="employee" workType="defect" subType="defect_quarantine" bundles={bundles as any} notes={memo}
    reasonCategory={category} reasonCategoryId={category ? "category-id" : null} onReasonCategoryChange={setCategory}
    hasShortage={false} hasInvalidQuantity={false} submitting={false} saving={false} approvalKind="none"
    onNotesChange={setMemo} onSubmit={vi.fn()} onSaveDraft={vi.fn()} />;
}

it("사유 미선택과 기타 빈 메모는 제출만 막고 임시저장을 허용한다", () => {
  render(<Confirm />);
  expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  expect(screen.getByRole("button", { name: /즉시 반영하기/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("사유 카테고리"), { target: { value: "기타" } });
  expect(screen.getByRole("button", { name: /즉시 반영하기/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("사유 메모"), { target: { value: "재검사" } });
  expect(screen.getByRole("button", { name: /즉시 반영하기/ })).toBeEnabled();
});
