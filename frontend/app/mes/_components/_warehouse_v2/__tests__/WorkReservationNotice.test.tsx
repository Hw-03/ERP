// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WorkReservationNotice } from "../WorkReservationNotice";
import type { IoBatch } from "@/lib/api";

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
