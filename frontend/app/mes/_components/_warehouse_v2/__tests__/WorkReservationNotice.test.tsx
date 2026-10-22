// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WorkReservationNotice } from "../WorkReservationNotice";
import type { IoBatch } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

it("예약 해제된 임시 작업은 작업 중으로 안내하고 확보한 자재만 강조한다", () => {
  const batch = { batch_id: "batch", status: "draft", reservation_status: "inactive" } as IoBatch;
  const view = render(<WorkReservationNotice batch={batch} />);
  expect(screen.getByText("작업 중")).toBeInTheDocument();
  expect(screen.queryByText("예약 해제")).not.toBeInTheDocument();
  view.rerender(<WorkReservationNotice batch={{ ...batch, reservation_status: "reserved" }} />);
  expect(screen.getByText("작업 중").parentElement).toHaveStyle({ color: LEGACY_COLORS.green });
});

it("반려되어 돌아온 작업은 반려 상태와 재저장 안내를 보존한다", () => {
  const batch = { batch_id: "batch", status: "draft", reservation_status: "inactive",
    reservation_issue: { code: "returned_after_rejection", message: "internal", shortages: [] } } as IoBatch;
  render(<WorkReservationNotice batch={batch} />);
  expect(screen.getByText("반려됨")).toBeInTheDocument();
  expect(screen.getByText("반려 후 다시 저장하여 예약해야 합니다.")).toBeInTheDocument();
});

it("예약 자재가 없는 입고는 자재를 확보했다는 배지를 표시하지 않는다", () => {
  const batch = { batch_id: "batch", status: "draft", reservation_status: "not_required" } as IoBatch;
  render(<WorkReservationNotice batch={batch} />);
  expect(screen.getByText("예약 대상 없음")).toBeInTheDocument();
  expect(screen.queryByText("예약 중")).not.toBeInTheDocument();
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
