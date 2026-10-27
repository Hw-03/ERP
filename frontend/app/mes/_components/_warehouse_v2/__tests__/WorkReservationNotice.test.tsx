// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { reservationStatusLabel, WorkReservationNotice } from "../WorkReservationNotice";
import type { IoBatch } from "@/lib/api";

it.each([3, 0])("실제 확보 수량 %i에 따라 일부 예약과 예약 없음을 구분한다", (acquired) => {
  const batch = { batch_id: "partial", status: "draft", reservation_status: "reserved",
    effective_plan: { effects: [{ kind: "out", item_id: "item", quantity: 5 }] },
    reservation_issue: { code: "stock_shortage", message: "internal", shortages: [
      { item_id: "item", item_name: "예약 자재", mes_code: "MAT", unit: "EA", location: { bucket: "warehouse", department: null }, required_quantity: 5, available_quantity: acquired, shortage_quantity: 5 - acquired },
    ] } } as IoBatch;
  expect(reservationStatusLabel(batch)).toBe(acquired > 0 ? "자재 일부 예약" : "자재 예약 없음");
  const { container } = render(<WorkReservationNotice batch={batch} />);
  expect(container).toBeEmptyDOMElement();
});

it("부족한 품목이 전부 미확보여도 다른 품목이 확보됐으면 일부 예약으로 안내한다", () => {
  const batch = { batch_id: "partial", status: "draft", reservation_status: "reserved",
    effective_plan: { effects: [{ kind: "out", item_id: "item", quantity: 5 }, { kind: "out", item_id: "secured", quantity: 2 }] },
    reservation_issue: { code: "stock_shortage", message: "internal", shortages: [
      { item_id: "item", item_name: "예약 자재", unit: "EA", required_quantity: 5, available_quantity: 0, shortage_quantity: 5 },
    ] } } as IoBatch;
  expect(reservationStatusLabel(batch)).toBe("자재 일부 예약");
});

it("일반 저장 작업은 예약 전후 모두 별도 안내 박스를 표시하지 않는다", () => {
  const batch = { batch_id: "batch", status: "draft", reservation_status: "inactive" } as IoBatch;
  const view = render(<WorkReservationNotice batch={batch} />);
  expect(view.container).toBeEmptyDOMElement();
  view.rerender(<WorkReservationNotice batch={{ ...batch, reservation_status: "reserved" }} />);
  expect(view.container).toBeEmptyDOMElement();
});

it("반려되어 돌아온 작업은 반려 상태와 재저장 안내를 보존한다", () => {
  const batch = { batch_id: "batch", status: "draft", reservation_status: "inactive",
    reservation_issue: { code: "returned_after_rejection", message: "internal", shortages: [] } } as IoBatch;
  render(<WorkReservationNotice batch={batch} />);
  expect(screen.getByText("반려됨")).toBeInTheDocument();
  expect(screen.getByText("반려 후 다시 저장하여 예약해야 합니다.")).toBeInTheDocument();
});

it("예약 자재가 없는 입고도 별도 안내 박스를 표시하지 않는다", () => {
  const batch = { batch_id: "batch", status: "draft", reservation_status: "not_required" } as IoBatch;
  const { container } = render(<WorkReservationNotice batch={batch} />);
  expect(container).toBeEmptyDOMElement();
});

it("재고 조사로 멈춘 작업의 안내는 보존한다", () => {
  const batch = { batch_id: "batch", status: "draft", reservation_status: "inactive",
    stocktake_pause: { token: "pause", round_id: "round", state: "blocked", paused_at: "2026-10-23T00:00:00Z", pending_target_count: 1, missing_target_count: 0 } } as IoBatch;
  render(<WorkReservationNotice batch={batch} />);
  expect(screen.getByText("재고 조사 중")).toBeInTheDocument();
});

it("원작업 복귀는 미저장 변경 안내를 확인한 뒤에만 실행한다", () => {
  const resume = vi.fn();
  render(<WorkReservationNotice onReturn={resume} />);
  fireEvent.click(screen.getByRole("button", { name: "원작업으로 돌아가기" }));
  expect(resume).not.toHaveBeenCalled();
  expect(screen.getByText(/지금 작성 중인 창고 작업에서 저장하지 않은 내용은 사라집니다/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "돌아가기", exact: true }));
  expect(resume).toHaveBeenCalledOnce();
});

it("최신 취소 상태를 알릴 때 과거 예약 중 배지를 강조하지 않는다", () => {
  const batch = { batch_id: "batch", status: "draft", reservation_status: "reserved" } as IoBatch;
  render(<WorkReservationNotice batch={batch} latestBatch={{ ...batch, status: "cancelled", reservation_status: "inactive" }} />);
  expect(screen.getByText("예약 해제")).toBeInTheDocument();
  expect(screen.queryByText("예약 중", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("현재 상태: 취소");
});

it("창고 작업 요청 중에는 복귀버튼과 이미 열린 확인창의 확정을 잠근다", () => {
  const resume = vi.fn();
  const view = render(<WorkReservationNotice onReturn={resume} busy={false} />);
  fireEvent.click(screen.getByRole("button", { name: "원작업으로 돌아가기" }));
  view.rerender(<WorkReservationNotice onReturn={resume} busy />);
  expect(screen.getByRole("button", { name: "원작업으로 돌아가기" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "처리 중..." }));
  expect(resume).not.toHaveBeenCalled();
});
