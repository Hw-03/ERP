import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShippingRequest } from "@/lib/api";
import { DirtyGuardProvider, useRegisterDirty } from "@/lib/ui/dirty-guard";
import { useState } from "react";
import { MobileShippingScreen } from "../MobileShippingScreen";

vi.mock("@/lib/api", () => ({ api: { getShippingRequests: vi.fn(), getShippingRequest: vi.fn(), getShippingHistoryMonths: vi.fn() } }));
vi.mock("../../shipping/MobileShippingRequestWizard", () => ({
  MobileShippingRequestWizard: ({ request, step, onStepChange, onCancel }: { request: ShippingRequest | null; step: number; onStepChange: (step: number) => void; onCancel: () => void }) => {
    const [value, setValue] = useState("");
    useRegisterDirty("test-wizard", Boolean(value), () => {}, undefined, { mode: "confirm-only" });
    return <>{request && request.status !== "PREPARING" && <p role="alert">준비 중인 요청만 수정</p>}<p>작성 단계 {step}</p><input aria-label="초안" value={value} onChange={(event) => setValue(event.target.value)} /><button onClick={() => onStepChange(step + 1)}>다음 단계</button><button onClick={onCancel}>작성 나가기</button></>;
  },
}));
vi.mock("../../shipping/MobileShippingDetail", () => ({
  MobileShippingDetail: ({ request, onEdit }: { request: ShippingRequest; onEdit: () => void }) => <><p>상세 {request.request_id}</p><button onClick={onEdit}>요청 수정</button></>,
}));
vi.mock("../../shipping/MobileShippingHistory", () => ({
  MobileShippingHistory: ({ status }: { status: string }) => <p>이력 상태 {status}</p>,
}));

import { api } from "@/lib/api";

const request = {
  request_id: "req-1", status: "PREPARING", base_pf_item_name: "기준 PF", base_pf_mes_code: "PF-001",
  final_pf_item_name: "최종 PF", final_pf_mes_code: "PF-002", request_quantity: 3,
  invoice_number: "INV-1", requested_by_name: "작업자", created_at: "2026-10-06T00:00:00Z",
} as ShippingRequest;

function renderScreen(onNavigateAway = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return { client, ...render(<QueryClientProvider client={client}><DirtyGuardProvider><MobileShippingScreen onNavigateAway={onNavigateAway} /></DirtyGuardProvider></QueryClientProvider>) };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/mes?tab=shipping");
  vi.mocked(api.getShippingRequests).mockReset().mockResolvedValue([request]);
  vi.mocked(api.getShippingRequest).mockReset().mockResolvedValue(request);
  vi.mocked(api.getShippingHistoryMonths).mockReset().mockResolvedValue([{ year: 2026, month: 10, count: 7 }]);
});

describe("MobileShippingScreen", () => {
  it("실제 건수의 관리·이력 허브와 최종 출하 PF를 표시한다", async () => {
    renderScreen();
    const management = await screen.findByRole("button", { name: /출하 관리.*1건/ });
    expect(await screen.findByRole("button", { name: /출하 이력.*7건/ })).toBeInTheDocument();
    fireEvent.click(management);
    expect(screen.getByRole("button", { name: "새 출하 요청 만들기" })).toBeInTheDocument();
    expect(screen.getByText("최종 PF")).toBeInTheDocument();
    expect(screen.queryByText("기준 PF")).not.toBeInTheDocument();
    expect(window.location.search).toContain("shippingView=requestList");
    fireEvent.click(screen.getByRole("button", { name: "요청 상세" }));
    expect(await screen.findByText("상세 req-1")).toBeInTheDocument();
  });

  it("PC 편집 URL의 요청과 단계를 직접 연다", async () => {
    window.history.replaceState({}, "", "/mes?tab=shipping&shippingView=requestWork&shippingRequestId=req-1&shippingStep=3");
    renderScreen();
    expect(await screen.findByText("작성 단계 3")).toBeInTheDocument();
    expect(api.getShippingRequest).toHaveBeenCalledWith("req-1", expect.anything());
  });

  it("취소 이력 URL과 완료 상태의 수정 제한을 적용한다", async () => {
    window.history.replaceState({}, "", "/mes?tab=shipping&shippingView=historyList&shippingHistoryStatus=CANCELLED");
    const first = renderScreen();
    expect(screen.getByText("이력 상태 CANCELLED")).toBeInTheDocument();
    first.unmount();
    vi.mocked(api.getShippingRequest).mockResolvedValue({ ...request, status: "PREPARED" });
    vi.mocked(api.getShippingRequests).mockResolvedValue([]);
    window.history.replaceState({}, "", "/mes?tab=shipping&shippingView=requestWork&shippingRequestId=req-1");
    renderScreen();
    expect(await screen.findByRole("alert")).toHaveTextContent("준비 중인 요청만 수정");
  });

  it("단계 간 초안을 유지하고 작업 이탈은 확인한다", async () => {
    window.history.replaceState({}, "", "/mes?tab=shipping&shippingView=requestWork");
    renderScreen();
    fireEvent.change(screen.getByLabelText("초안"), { target: { value: "작성 중" } });
    fireEvent.click(screen.getByText("다음 단계"));
    expect(screen.getByText("작성 단계 2")).toBeInTheDocument();
    expect(screen.getByLabelText("초안")).toHaveValue("작성 중");
    fireEvent.click(screen.getByText("작성 나가기"));
    fireEvent.click(screen.getByRole("button", { name: "계속 머무르기" }));
    expect(screen.getByLabelText("초안")).toHaveValue("작성 중");
    fireEvent.click(screen.getByText("작성 나가기"));
    fireEvent.click(screen.getByRole("button", { name: "나가기", exact: true }));
    expect(await screen.findByRole("button", { name: "새 출하 요청 만들기" })).toBeInTheDocument();
  });

  it("브라우저 단계 뒤로 가기는 입력을 유지한다", async () => {
    window.history.replaceState({}, "", "/mes?tab=shipping&shippingView=requestWork&shippingStep=2");
    renderScreen();
    fireEvent.change(screen.getByLabelText("초안"), { target: { value: "입력 유지" } });
    await act(async () => {
      window.history.replaceState({}, "", "/mes?tab=shipping&shippingView=requestWork&shippingStep=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByText("작성 단계 1")).toBeInTheDocument();
    expect(screen.getByLabelText("초안")).toHaveValue("입력 유지");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("브라우저 탭 이탈 취소 시 URL과 초안을 복원한다", async () => {
    window.history.replaceState({}, "", "/mes?tab=shipping&shippingView=requestWork");
    const away = vi.fn();
    renderScreen(away);
    fireEvent.change(screen.getByLabelText("초안"), { target: { value: "유지" } });
    await act(async () => {
      window.history.replaceState({}, "", "/mes?tab=dashboard");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    fireEvent.click(screen.getByRole("button", { name: "계속 머무르기" }));
    expect(window.location.search).toContain("tab=shipping");
    expect(screen.getByLabelText("초안")).toHaveValue("유지");
    expect(away).not.toHaveBeenCalled();
  });

  it("실제 뒤로 가기 취소 후 다시 이동하고 앞으로 가기를 유지한다", async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /출하 관리.*1건/ }));
    fireEvent.click(screen.getByRole("button", { name: "새 출하 요청 만들기" }));
    fireEvent.change(screen.getByLabelText("초안"), { target: { value: "보존" } });
    act(() => window.history.back());
    fireEvent.click(await screen.findByRole("button", { name: "계속 머무르기" }));
    expect(window.location.search).toContain("shippingView=requestWork");
    expect(screen.getByLabelText("초안")).toHaveValue("보존");
    act(() => window.history.back());
    fireEvent.click(await screen.findByRole("button", { name: "나가기", exact: true }));
    expect(await screen.findByRole("button", { name: "새 출하 요청 만들기" })).toBeInTheDocument();
    act(() => window.history.forward());
    expect(await screen.findByLabelText("초안")).toHaveValue("");
  });

  it("새로고침 실패 시 기존 목록을 보존하고 재시도한다", async () => {
    window.history.replaceState({}, "", "/mes?tab=shipping&shippingView=requestList");
    const { client } = renderScreen();
    expect(await screen.findByText("최종 PF")).toBeInTheDocument();
    vi.mocked(api.getShippingRequests).mockRejectedValueOnce(new Error("연결 실패"));
    await act(async () => { await client.invalidateQueries({ queryKey: ["shipping", "requests"] }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("연결 실패");
    expect(screen.getByText("최종 PF")).toBeInTheDocument();
    fireEvent.click(screen.getByText("다시 불러오기"));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("복귀 focus와 visibility 이벤트의 중복 조회를 합친다", async () => {
    renderScreen();
    await screen.findByRole("button", { name: /출하 관리.*1건/ });
    vi.mocked(api.getShippingRequests).mockClear();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.getShippingRequests).toHaveBeenCalledTimes(1);
  });
});
