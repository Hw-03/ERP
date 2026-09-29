import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HandoverSectionPanel } from "../HandoverSectionPanel";

const api = vi.hoisted(() => ({ listHandovers: vi.fn(), listHandoverInbox: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => 0 }));
const props = { operator: { employee_id: "e1", name: "작업자", department: "고압", warehouse_role: "none" as const }, operatorEmployeeId: "e1", items: [], refreshNonce: 0, onChanged: vi.fn(), mobilePresentation: true };
beforeEach(() => { api.listHandovers.mockReset().mockResolvedValue([]); api.listHandoverInbox.mockReset(); });
it("does not show an empty inbox before its first response", async () => {
  api.listHandoverInbox.mockReturnValue(new Promise(() => {}));
  render(<HandoverSectionPanel {...props} />);
  await act(async () => {});
  expect(screen.getByRole("status", { name: "인수 대기함 불러오는 중" })).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText("인수 대기 중인 인수인계서가 없습니다.")).not.toBeInTheDocument();
});
it("does not describe the first failed request as an empty inbox", async () => {
  api.listHandoverInbox.mockRejectedValue(new Error("인수 조회 실패"));
  render(<HandoverSectionPanel {...props} />);
  await act(async () => {});
  expect(screen.getByRole("alert")).toHaveTextContent("인수 조회 실패");
  expect(screen.queryByText("인수 대기 중인 인수인계서가 없습니다.")).not.toBeInTheDocument();
});
