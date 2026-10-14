import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryOperation } from "@/lib/api";
import { InventoryOperationHistory } from "../InventoryOperationHistory";

const state = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/api/production", () => ({ productionApi: { getInventoryOperations: state.list, getInventoryOperation: state.detail } }));

function operation(overrides: Partial<InventoryOperation> = {}): InventoryOperation {
  return { operationId: "op", kind: "BUSINESS", domain: "inventory", action: "business_correction", displayLabel: "업무 정정", effectiveStatus: "active", actorEmployeeId: "e1", actorName: "김작업", department: "조립", reason: "업무 상태 정정", effectiveAt: "2026-10-06T00:00:00Z", reversesOperationId: null, reversalOperationId: null, canCancel: false, cancelBlockers: ["실사 관측 이후에는 수량 취소할 수 없습니다."], lines: [], matchingLines: [], effects: [], ...overrides };
}

function mount(): void {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><InventoryOperationHistory /></QueryClientProvider>);
}

describe("InventoryOperationHistory", () => {
  beforeEach(() => vi.resetAllMocks());

  it("수량 없는 정정에서 연결된 모든 원업무 상세를 탐색한다", async () => {
    const correction = operation({ effects: [{ effectId: "e1", effectKind: "WORKFLOW", subjectType: "ShippingRequest", subjectId: "s1", role: "BUSINESS_CORRECTION", beforeState: { status: "COMPLETED" }, afterState: { status: "PREPARING" }, reversesEffectId: null }], businessCorrection: { correctionId: "c1", sourceType: "ShippingRequest", sourceId: "s1", sourceOperationId: null, sourceOperationIds: ["prepare", "pickup"] } });
    state.list.mockResolvedValue({ items: [correction], nextCursor: null });
    state.detail.mockImplementation(async (id: string) => id === "op" ? correction : operation({ operationId: id, displayLabel: "원출하 업무", businessCorrection: null }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /업무 정정 상세/ }));
    expect(await screen.findByText("현재 재고 수량 변동 없음")).toBeInTheDocument();
    expect(screen.getByText("완료 → 준비 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "원업무 1 보기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "원업무 2 보기" }));
    await waitFor(() => expect(state.detail).toHaveBeenCalledWith("pickup", expect.anything()));
    expect(await screen.findByText("원출하 업무")).toBeInTheDocument();
    expect(screen.getByText("실사 관측 이후에는 수량 취소할 수 없습니다.")).toBeInTheDocument();
  });

  it("목록 오류를 표시하고 재시도한다", async () => {
    state.list.mockRejectedValueOnce(new Error("조회 실패")).mockResolvedValue({ items: [], nextCursor: null });
    mount();
    expect(await screen.findByText(/조회 실패/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("작업 이력이 없습니다.")).toBeInTheDocument();
  });

  it("상태 재고의 실제 전후 수량과 사유를 표시한다", async () => {
    const move = operation({ displayLabel: "B급 전환", poolMovements: [{ movementId: "m1", poolId: "p1", itemId: "i1", scopeKey: "warehouse", category: "b_grade", delta: 3, beforeQuantity: 1, afterQuantity: 4, reason: "등급 변경 확인" }] });
    state.list.mockResolvedValue({ items: [move], nextCursor: null });
    state.detail.mockResolvedValue(move);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "B급 전환 상세" }));
    expect(await screen.findByText("상태 재고 변동")).toBeInTheDocument();
    expect(screen.getByText("1 → 4 (변화 +3)")).toBeInTheDocument();
    expect(screen.getByText("등급 변경 확인")).toBeInTheDocument();
  });

  it.each([["DEFECT", "불량"], ["B_GRADE", "B급"], ["OBSOLETE", "구형"], ["obsolete", "구형"]])("거래 없는 POOL의 품목·코드·위치와 실제 분류를 표시한다 %s", async (category, label) => {
    const move = operation({ displayLabel: "공동 재고 전환", department: null, poolMovements: [{ movementId: "m1", poolId: "p1", itemId: "i1", itemName: "고압 증빙 품목", mesCode: "8-VA-0018", physicalDepartment: "고압", scopeKey: "dept-17", category, delta: 3, beforeQuantity: 1, afterQuantity: 4, reason: "기존 재고 증빙" }] });
    state.list.mockResolvedValue({ items: [move], nextCursor: null });
    state.detail.mockResolvedValue(move);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "공동 재고 전환 상세" }));
    expect(await screen.findByText(`고압 증빙 품목 · 8-VA-0018 · ${label} · 고압`)).toBeVisible();
    expect(screen.getByText("1 → 4 (변화 +3)")).toBeVisible();
  });

  it("POOL 메타데이터 없는 이전 응답도 거래 품목 또는 품목 ID·위치 키로 식별한다", async () => {
    const move = operation({ displayLabel: "이전 작업", poolMovements: [
      { movementId: "m1", poolId: "p1", itemId: "legacy-item", scopeKey: "warehouse", category: "defect", delta: 1, beforeQuantity: 0, afterQuantity: 1, reason: null },
      { movementId: "m2", poolId: "p2", itemId: "unknown-item", scopeKey: "legacy-scope", category: "B_GRADE", delta: 1, beforeQuantity: 0, afterQuantity: 1, reason: null },
    ], lines: [{ logId: "l", itemId: "legacy-item", itemName: "이전 품목", mesCode: "OLD-1", quantityBefore: 0, quantityAfter: 1, quantityChange: 1 } as InventoryOperation["lines"][number]] });
    state.list.mockResolvedValue({ items: [move], nextCursor: null });
    state.detail.mockResolvedValue(move);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "이전 작업 상세" }));
    expect(await screen.findByText("이전 품목 · OLD-1 · 불량 · 창고")).toBeVisible();
    expect(screen.getByText("unknown-item · B급 · legacy-scope")).toBeVisible();
  });

  it("차이 0 관측의 네 상태 및 실제 전후 수량을 표시한다", async () => {
    const observation = operation({ displayLabel: "실사 반영", action: "stocktake_apply", observationLines: [{ rowType: "STOCKTAKE_OBSERVATION", applicationId: "a1", countId: "c1", confirmationRevisionId: "r1", itemId: "i1", itemName: "시험 품목", mesCode: "M1", scopeKey: "warehouse", beforeQuantities: { normal: 7, defect: 2, b_grade: 1, obsolete: 0 }, afterQuantities: { normal: 7, defect: 2, b_grade: 1, obsolete: 0 }, reservations: { normal: 3, defect: 0, b_grade: 0, obsolete: 0 }, observationEpochBefore: 1, observationEpochAfter: 2 }] });
    state.list.mockResolvedValue({ items: [observation], nextCursor: null });
    state.detail.mockResolvedValue(observation);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /실사 반영 상세/ }));
    expect(await screen.findByText("실사 관측 · 차이 0")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "시험 품목 실사 관측" })).toHaveTextContent("정상7703");
    expect(screen.getByText("B급")).toBeInTheDocument();
    expect(screen.getByText("불용")).toBeInTheDocument();
    expect(screen.queryByText("수량 로그 없음")).not.toBeInTheDocument();
  });

  it("서버 커서로 다음 작업을 읽고 이전 목록으로 돌아온다", async () => {
    state.list.mockImplementation(async (params: { cursor?: string }) => ({ items: [operation({ operationId: params.cursor ?? "first", displayLabel: params.cursor ? "다음 작업" : "첫 작업" })], nextCursor: params.cursor ? null : "next" }));
    mount();
    await screen.findByRole("button", { name: /첫 작업 상세/ });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByRole("button", { name: /다음 작업 상세/ });
    state.detail.mockResolvedValue(operation({ operationId: "next", displayLabel: "선택 상세" }));
    fireEvent.click(screen.getByRole("button", { name: /다음 작업 상세/ }));
    await screen.findByText("선택 상세");
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(await screen.findByRole("button", { name: /다음 작업 상세/ })).toBeVisible();
    expect(state.list.mock.calls.at(-1)?.[0]).toEqual({ limit: 50, cursor: "next" });
    expect(state.list.mock.calls.at(-1)?.[1]).toEqual({ signal: expect.any(AbortSignal) });
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(await screen.findByRole("button", { name: /첫 작업 상세/ })).toBeInTheDocument();
  });
});
