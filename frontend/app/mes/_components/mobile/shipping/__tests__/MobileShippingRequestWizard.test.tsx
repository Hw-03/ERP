import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, ShippingRequest } from "@/lib/api";
import { MobileShippingRequestWizard } from "../MobileShippingRequestWizard";

const api = vi.hoisted(() => ({
  getItems: vi.fn(), getBOM: vi.fn(), matchShippingBom: vi.fn(),
  createShippingRequest: vi.fn(), updateShippingRequest: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api }));

const item = (id: string, stage: string): Item => ({
  item_id: id, item_name: `${stage} ${id}`, process_type_code: stage,
  mes_code: id, unit: "EA", deleted_at: null,
} as Item);
const pf = item("pf-1", "PF");
const pa = item("pa-1", "PA");
const child = item("child-1", "CP");
const matched = {
  base_pf_matches: true, pf_candidates: [], matched_pa_item_id: "pa-1",
  matched_pf_item_id: "pf-1", matched_pa_item_name: pa.item_name,
  matched_pf_item_name: pf.item_name, requires_pa_name: false,
  requires_pf_name: false, preview_pa_mes_code: pa.mes_code,
  preview_pf_mes_code: pf.mes_code,
};

function mount(step: 1 | 2 | 3 | 4 | 5 = 1, request: ShippingRequest | null = null) {
  const onStepChange = vi.fn();
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const view = render(<MobileShippingRequestWizard operator={null} request={request} step={step}
    onStepChange={onStepChange} onSaved={onSaved} onCancel={onCancel} />);
  const setStep = (next: 1 | 2 | 3 | 4 | 5, nextRequest = request) => view.rerender(
    <MobileShippingRequestWizard operator={null} request={nextRequest} step={next}
      onStepChange={onStepChange} onSaved={onSaved} onCancel={onCancel} />);
  return { onStepChange, onSaved, setStep };
}

function editableRequest(): ShippingRequest {
  return {
    request_id: "request-1", status: "PREPARING", base_pf_item_id: pf.item_id,
    base_pf_item_name: pf.item_name, request_quantity: 1, invoice_number: "INV-1",
    requested_by_name: "원래 요청자", notes: "원래 메모", finalization_mode: "KEEP_BASE",
    bom_lines: [
      { line_id: "pf-bom", parent_stage: "PF", child_item_id: pa.item_id, item_name: pa.item_name, quantity: 1, unit: "EA", included: true, origin: "DEFAULT" },
      { line_id: "pa-bom", parent_stage: "PA", child_item_id: child.item_id, item_name: child.item_name, quantity: 2, unit: "EA", included: true, origin: "DEFAULT" },
    ], companion_lines: [],
  } as ShippingRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getItems.mockResolvedValue([pf, pa, child]);
  api.getBOM.mockImplementation(async (id: string) => id === pf.item_id
    ? [{ bom_id: "pf-bom", child_item_id: pa.item_id, quantity: 1, unit: "EA" }]
    : [{ bom_id: "pa-bom", child_item_id: child.item_id, quantity: 2, unit: "EA" }]);
  api.matchShippingBom.mockResolvedValue(matched);
});

describe("MobileShippingRequestWizard", () => {
  it("기본 BOM 일치 시 다른 판매처의 동일 BOM 후보가 아니라 기준 PA·PF를 표시한다", async () => {
    api.matchShippingBom.mockResolvedValue({ ...matched, matched_pa_item_name: "다른 판매처 PA", matched_pf_item_name: "다른 판매처 PF" });
    mount(3, editableRequest());
    expect(await screen.findByText("기본 BOM과 일치합니다.")).toBeInTheDocument();
    expect(screen.getByText("PF pf-1")).toBeInTheDocument();
    expect(screen.getByText("PA pa-1")).toBeInTheDocument();
    expect(screen.queryByText(/다른 판매처/)).not.toBeInTheDocument();
  });
  it("기준 PF 선택 시 PF와 연결 PA의 기본 BOM을 불러와 요청에 포함한다", async () => {
    const { onStepChange, onSaved, setStep } = mount();
    fireEvent.change(await screen.findByLabelText("인보이스 번호"), { target: { value: "INV-1" } });
    fireEvent.click(screen.getByRole("button", { name: "기준 PF 선택" }));
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: /PF pf-1/ }));
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(onStepChange).toHaveBeenCalledWith(2);
    setStep(5);
    const saved = editableRequest();
    api.createShippingRequest.mockResolvedValue(saved);
    await waitFor(() => expect(api.matchShippingBom).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: "출하 요청 저장" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "출하 요청 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(api.createShippingRequest).toHaveBeenCalledWith(expect.objectContaining({
      base_pf_item_id: "pf-1", invoice_number: "INV-1", request_quantity: 1,
      bom_lines: expect.arrayContaining([
        expect.objectContaining({ parent_stage: "PF", child_item_id: "pa-1", quantity: 1 }),
        expect.objectContaining({ parent_stage: "PA", child_item_id: "child-1", quantity: 2 }),
      ]),
    }));
  });

  it("신규 요청의 응답 실패 뒤 재시도는 같은 제출 키를 유지하고 연속 클릭을 막는다", async () => {
    const { setStep, onSaved } = mount();
    fireEvent.change(await screen.findByLabelText("인보이스 번호"), { target: { value: "RETRY-1" } });
    fireEvent.click(screen.getByRole("button", { name: "기준 PF 선택" }));
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: /PF pf-1/ }));
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    setStep(5);
    api.createShippingRequest.mockRejectedValueOnce(new Error("응답 연결 끊김")).mockResolvedValueOnce(editableRequest());
    const submit = screen.getByRole("button", { name: "출하 요청 저장" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(await screen.findByText("응답 연결 끊김")).toBeInTheDocument();
    const firstKey = api.createShippingRequest.mock.calls[0][0].client_request_id;
    expect(firstKey).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    act(() => { submit.click(); submit.click(); });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(api.createShippingRequest).toHaveBeenCalledTimes(2);
    expect(api.createShippingRequest.mock.calls[1][0].client_request_id).toBe(firstKey);
  });

  it("기존 요청의 요청자와 동반품 변경을 보존하고 PF 변경은 막는다", async () => {
    const request = editableRequest();
    const { setStep, onSaved } = mount(1, request);
    await screen.findByText("PF pf-1");
    expect(screen.getByRole("button", { name: "기준 PF 변경" })).toBeDisabled();
    setStep(2);
    fireEvent.click(screen.getByRole("button", { name: /동반 출하품/ }));
    const companionCard = screen.getByText("동반 출하품").closest("section")!;
    fireEvent.click(within(companionCard).getByRole("button", { name: "품목 추가" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /CP child-1/ }));
    fireEvent.change(within(companionCard).getByLabelText("CP child-1 수량"), { target: { value: "3" } });
    setStep(4);
    expect(screen.getByText("원래 요청자")).toBeInTheDocument();
    expect(screen.getByLabelText("요청 메모")).toHaveValue("원래 메모");
    setStep(5);
    api.updateShippingRequest.mockResolvedValue(request);
    await waitFor(() => expect(api.matchShippingBom).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(request));
    expect(api.updateShippingRequest).toHaveBeenCalledWith("request-1", expect.objectContaining({
      requested_by_name: "원래 요청자",
      companion_lines: [{ item_id: "child-1", quantity: 3, unit: "EA" }],
    }));
  });

  it("PF 선택 시트를 닫고 다시 열어도 입력과 검색어를 보존한다", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "기준 PF 선택" }));
    await within(screen.getByRole("dialog")).findByRole("button", { name: /PF pf-1/ });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "시트 닫기 핸들" }));
    fireEvent.change(screen.getByLabelText("인보이스 번호"), { target: { value: "INV-DRAFT" } });
    fireEvent.change(screen.getByLabelText("출하 수량"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "기준 PF 선택" }));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("PF 검색"), { target: { value: "pf-1" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "시트 닫기 핸들" }));
    expect(screen.getByLabelText("인보이스 번호")).toHaveValue("INV-DRAFT");
    expect(screen.getByLabelText("출하 수량")).toHaveValue(7);
    fireEvent.click(screen.getByRole("button", { name: "기준 PF 선택" }));
    expect(within(screen.getByRole("dialog")).getByLabelText("PF 검색")).toHaveValue("pf-1");
  });

  it("BOM 접기를 오가고 단계를 이동해도 수정한 수량을 보존한다", async () => {
    const { setStep } = mount(2, editableRequest());
    await screen.findByText("child-1 · EA · 기본");
    expect(screen.getByRole("button", { name: /PA 구성품/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /PF 구성품/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /동반 출하품/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.change(screen.getByLabelText("CP child-1 수량"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /PA 구성품/ }));
    fireEvent.click(screen.getByRole("button", { name: /PA 구성품/ }));
    expect(screen.getByLabelText("CP child-1 수량")).toHaveValue(4);
    setStep(3);
    setStep(2);
    expect(screen.getByLabelText("CP child-1 수량")).toHaveValue(4);
  });

  it("잠긴 요청도 구성품을 펼쳐 읽되 수량과 구성 변경은 막는다", async () => {
    mount(2, { ...editableRequest(), status: "PREPARED" });
    await screen.findByText("child-1 · EA · 기본");
    const pfToggle = screen.getByRole("button", { name: /PF 구성품/ });
    expect(pfToggle).toBeEnabled();
    expect(pfToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(pfToggle);
    expect(pfToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("PA pa-1 수량")).toBeDisabled();
    expect(screen.getByRole("button", { name: "PA pa-1 제외" })).toBeDisabled();
  });

  it("기본 구성품 수량만 바꾸면 매칭과 최종 확인에 수량 변경으로 표시한다", async () => {
    const { setStep } = mount(2, editableRequest());
    fireEvent.change(screen.getByLabelText("CP child-1 수량"), { target: { value: "4" } });
    setStep(3);
    expect(await screen.findByText("수량 변경 · 2 → 4")).toBeInTheDocument();
    setStep(5);
    expect(screen.getByText("수량 변경 · 2 → 4")).toBeInTheDocument();
  });

  it("변경된 BOM에서 새 PA/PF 품명을 입력한 뒤 다음 단계로 이동한다", async () => {
    api.matchShippingBom.mockResolvedValue({
      ...matched, base_pf_matches: false, requires_pa_name: true, requires_pf_name: true,
      pf_candidates: [{ pf_item_id: "pf-2", pf_item_name: "기존 후보", pf_mes_code: "PF-2", pa_item_id: "pa-2", pa_item_name: "기존 PA", pa_mes_code: "PA-2" }],
    });
    const { setStep, onStepChange } = mount(2, editableRequest());
    await screen.findByText("CP child-1");
    fireEvent.click(screen.getByRole("button", { name: "CP child-1 제외" }));
    setStep(3);
    await screen.findByRole("button", { name: "새 PA·PF로 생성" });
    fireEvent.change(screen.getByLabelText("새 PA 품명"), { target: { value: "새 PA 모델" } });
    fireEvent.change(screen.getByLabelText("새 PF 품명"), { target: { value: "새 PF 모델" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(onStepChange).toHaveBeenCalledWith(4);
  });

  it("저장 오류와 같은 요청의 새 목록 응답에도 작성한 메모를 유지한다", async () => {
    const request = editableRequest();
    const { setStep, onSaved } = mount(4, request);
    await screen.findByLabelText("요청 메모");
    fireEvent.change(screen.getByLabelText("요청 메모"), { target: { value: "수정한 메모" } });
    setStep(4, { ...request, notes: "서버의 오래된 메모" });
    expect(screen.getByLabelText("요청 메모")).toHaveValue("수정한 메모");
    api.updateShippingRequest.mockRejectedValue(new Error("저장 실패"));
    setStep(5);
    await waitFor(() => expect(api.matchShippingBom).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    expect(await screen.findByText("저장 실패")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    setStep(4);
    expect(screen.getByLabelText("요청 메모")).toHaveValue("수정한 메모");
  });

  it("오래된 BOM 매칭 응답이 새 매칭 결과를 덮어쓰지 않는다", async () => {
    let resolveFirst!: (value: typeof matched) => void;
    let resolveSecond!: (value: typeof matched) => void;
    api.matchShippingBom
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const { setStep } = mount(3, editableRequest());
    await waitFor(() => expect(api.matchShippingBom).toHaveBeenCalledTimes(1));
    setStep(2);
    fireEvent.change(screen.getByLabelText("CP child-1 수량"), { target: { value: "3" } });
    setStep(3);
    await waitFor(() => expect(api.matchShippingBom).toHaveBeenCalledTimes(2));
    await act(async () => resolveSecond({ ...matched, base_pf_matches: false, pf_candidates: [
      { pf_item_id: "pf-new", pf_item_name: "최신 후보", pf_mes_code: "PF-N", pa_item_id: "pa-new", pa_item_name: "최신 PA", pa_mes_code: "PA-N" },
    ] }));
    expect(screen.getByRole("button", { name: /최신 후보/ })).toBeInTheDocument();
    await act(async () => resolveFirst(matched));
    expect(screen.getByRole("button", { name: /최신 후보/ })).toBeInTheDocument();
  });

  it("저장 직전 기존 PF 후보가 사라지면 새 후보를 보여주며 3단계에서 다시 선택하게 한다", async () => {
    const oldCandidate = { pf_item_id: "pf-old", pf_item_name: "기존 후보", pf_mes_code: "PF-O", pa_item_id: "pa-old", pa_item_name: "기존 PA", pa_mes_code: "PA-O" };
    const currentCandidate = { ...oldCandidate, pf_item_id: "pf-new", pf_item_name: "현재 후보" };
    const request = { ...editableRequest(), finalization_mode: "REUSE_CANDIDATE" as const, reuse_pf_item_id: "pf-old" };
    api.matchShippingBom.mockResolvedValueOnce({ ...matched, base_pf_matches: false, pf_candidates: [oldCandidate] })
      .mockResolvedValueOnce({ ...matched, base_pf_matches: false, pf_candidates: [currentCandidate] });
    const { setStep, onStepChange, onSaved } = mount(5, request);
    await waitFor(() => expect(api.matchShippingBom).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "수정 저장" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(onStepChange).toHaveBeenCalledWith(3));
    expect(onSaved).not.toHaveBeenCalled();
    setStep(3);
    expect(screen.getByRole("button", { name: /현재 후보/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /기존 후보/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /현재 후보/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(onStepChange).toHaveBeenCalledWith(4);
  });

  it("매칭 중 이전 단계로 돌아가면 입력을 다시 사용할 수 있다", async () => {
    let resolveMatch!: (value: typeof matched) => void;
    api.matchShippingBom.mockImplementation(() => new Promise((resolve) => { resolveMatch = resolve; }));
    const { setStep } = mount(3, editableRequest());
    await waitFor(() => expect(api.matchShippingBom).toHaveBeenCalledTimes(1));
    setStep(2);
    expect(screen.getByRole("button", { name: "다음" })).toBeEnabled();
    expect(screen.getByLabelText("CP child-1 수량")).toBeEnabled();
    await act(async () => resolveMatch(matched));
    expect(screen.getByRole("button", { name: "다음" })).toBeEnabled();
  });

  it("매칭 오류가 나도 수정 중인 구성품 수량은 남는다", async () => {
    api.matchShippingBom.mockRejectedValue(new Error("매칭 실패"));
    const { setStep } = mount(2, editableRequest());
    await screen.findByLabelText("CP child-1 수량");
    fireEvent.change(screen.getByLabelText("CP child-1 수량"), { target: { value: "4" } });
    setStep(3);
    expect(await screen.findByText("매칭 실패")).toBeInTheDocument();
    setStep(2);
    expect(screen.getByLabelText("CP child-1 수량")).toHaveValue(4);
  });
});
