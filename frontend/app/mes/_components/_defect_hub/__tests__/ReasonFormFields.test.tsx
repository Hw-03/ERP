import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReasonFormFields } from "../ReasonFormFields";

const api = vi.hoisted(() => ({
  listReasonCategories: vi.fn(), createReasonCategory: vi.fn(), updateReasonCategory: vi.fn(),
}));
vi.mock("@/lib/api/defects", () => ({ defectsApi: api }));
vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));

const reasons = [
  { category_id: "surface", name: "표면 균열", is_active: true, is_other: false },
  { category_id: "other", name: "기타", is_active: true, is_other: true },
  { category_id: "hidden", name: "지난 사유", is_active: false, is_other: false },
];

function Form({ showCategory = true }: { showCategory?: boolean }) {
  const [category, setCategory] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  return <>
    <ReasonFormFields employeeId="employee" category={category} categoryId={categoryId}
      memo={memo} onCategoryChange={(name, id) => { setCategory(name); setCategoryId(id ?? null); }}
      onMemoChange={setMemo} required showCategory={showCategory} animateCategory />
    <output aria-label="선택 사유 번호">{categoryId}</output>
  </>;
}

it("hides the category and closes its dialog without remounting or clearing the memo", async () => {
  api.listReasonCategories.mockResolvedValue(reasons);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (showCategory: boolean) => <QueryClientProvider client={client}><Form showCategory={showCategory} /></QueryClientProvider>;
  const { rerender } = render(view(true));
  const memo = screen.getByRole("textbox", { name: "메모" });
  fireEvent.change(memo, { target: { value: "보존할 메모" } });
  fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  rerender(view(false));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "사유 카테고리 선택" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "메모" })).toBe(memo);
  expect(memo).toHaveValue("보존할 메모");
  rerender(view(true));
  expect(screen.getByRole("button", { name: "사유 카테고리 선택" })).toBeInTheDocument();
  expect(memo).toHaveValue("보존할 메모");
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Form /></QueryClientProvider>);
}

describe("managed defect reasons", () => {
  beforeEach(() => { vi.clearAllMocks(); api.updateReasonCategory.mockReset(); api.createReasonCategory.mockReset(); api.listReasonCategories.mockResolvedValue(reasons); });

  it("filters during IME composition without creating a reason on composing Enter", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    await screen.findByRole("button", { name: "표면 균열", exact: true });
    const input = screen.getByRole("searchbox", { name: "사유 검색" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "용접 균열" } });
    expect(input).toHaveValue("용접 균열");
    expect(screen.queryByRole("button", { name: "표면 균열", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "추가하고 선택" })).toBeEnabled();
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(api.createReasonCategory).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    expect(screen.queryByRole("button", { name: "표면 균열", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "추가하고 선택" })).toBeEnabled();
  });

  it("selects a server reason by stable ID and excludes inactive reasons", async () => {
    mount();
    expect(screen.queryByRole("searchbox", { name: "사유 검색" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: "표면 균열", exact: true }));
    expect(screen.getByLabelText("선택 사유 번호")).toHaveTextContent("surface");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    expect(screen.queryByRole("button", { name: "지난 사유", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "표면 균열", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  it("allows an ordinary employee to create and select a reason", async () => {
    const created = { category_id: "new", name: "용접 균열", is_active: true, is_other: false };
    api.createReasonCategory.mockImplementation(async () => {
      api.listReasonCategories.mockResolvedValue([...reasons, created]);
      return created;
    });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "사유 검색" }), { target: { value: "용접 균열" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "추가하고 선택" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "추가하고 선택" }));
    await waitFor(() => expect(api.createReasonCategory).toHaveBeenCalledWith("employee", "용접 균열"));
    expect(await screen.findByLabelText("선택 사유 번호")).toHaveTextContent("new");
  });

  it("keeps other protected and explains its memo requirement", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: "기타", exact: true }));
    expect(screen.getByText("기타를 선택하면 메모를 입력하세요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    expect(screen.queryByRole("button", { name: "기타 숨김" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "기타 이름 수정" })).not.toBeInTheDocument();
  });

  it("숨긴 동명 사유는 중복 등록 대신 복원하도록 안내한다", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    await screen.findByRole("button", { name: "표면 균열", exact: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "사유 검색" }), { target: { value: "지난 사유" } });
    expect(screen.queryByRole("button", { name: "추가하고 선택" })).not.toBeInTheDocument();
    expect(screen.getByText(/같은 이름의 사유가 숨김/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "숨김 사유 관리" }));
    expect(screen.getByRole("button", { name: /지난 사유 숨김/, exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "지난 사유 복원", exact: true })).toBeEnabled();
  });

  it("선택한 사유의 이름 변경과 숨김을 같은 목록에서 반영한다", async () => {
    api.updateReasonCategory.mockImplementation(async (_employee, id, changes) => {
      const updated = { ...reasons.find((entry) => entry.category_id === id)!, ...changes };
      api.listReasonCategories.mockResolvedValue(reasons.map((entry) => entry.category_id === id ? updated : entry));
      return updated;
    });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: "표면 균열", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "표면 균열 이름 수정" }));
    expect(screen.getByRole("textbox", { name: "표면 균열 이름 수정" })).toHaveFocus();
    fireEvent.change(screen.getByRole("textbox", { name: "표면 균열 이름 수정" }), { target: { value: "새 균열" } });
    fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));
    expect(await screen.findByRole("button", { name: "새 균열", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "새 균열 숨김" }));
    fireEvent.click(screen.getByRole("button", { name: "숨기기", exact: true }));
    await waitFor(() => expect(screen.getByLabelText("선택 사유 번호")).toBeEmptyDOMElement());
  });

  it("숨김은 확인 전 저장하지 않고 취소·Escape는 선택창과 버튼 포커스를 유지한다", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    const trigger = await screen.findByRole("button", { name: "표면 균열 숨김" });
    fireEvent.click(trigger);
    const confirmation = screen.getByRole("dialog", { name: "“표면 균열” 사유를 숨길까요?" });
    expect(within(confirmation).getByText("새 작업의 선택 목록에서 숨겨집니다. 기존 기록은 유지됩니다.")).toBeInTheDocument();
    expect(api.updateReasonCategory).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "사유 카테고리" })).toBeInTheDocument();
    fireEvent.click(trigger);
    const parentEscape = vi.fn();
    window.addEventListener("keydown", parentEscape);
    try {
      fireEvent.keyDown(screen.getByRole("button", { name: "취소" }), { key: "Escape" });
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(screen.queryByRole("dialog", { name: /숨길까요/ })).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "사유 카테고리" })).toBeInTheDocument();
      expect(parentEscape).not.toHaveBeenCalled();
      expect(api.updateReasonCategory).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", parentEscape);
    }
  });

  it("숨김 확인 중 중복 요청을 막고 성공하면 검색으로 돌아간다", async () => {
    let resolveSave!: (value: typeof reasons[number]) => void;
    api.updateReasonCategory.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: "표면 균열 숨김" }));
    const confirmation = screen.getByRole("dialog", { name: /숨길까요/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "숨기기" }));
    expect(api.updateReasonCategory).toHaveBeenCalledTimes(1);
    expect(api.updateReasonCategory).toHaveBeenCalledWith("employee", "surface", { is_active: false });
    expect(within(confirmation).getByRole("button", { name: "취소" })).toBeDisabled();
    expect(within(confirmation).getByRole("button", { name: "처리 중..." })).toBeDisabled();
    const status = within(confirmation).getByText("새 작업의 선택 목록에서 숨겨집니다. 기존 기록은 유지됩니다.");
    await waitFor(() => expect(status).toHaveFocus());
    expect(fireEvent.keyDown(status, { key: "Tab" })).toBe(false);
    expect(fireEvent.keyDown(status, { key: "Tab", shiftKey: true })).toBe(false);
    expect(status).toHaveFocus();
    fireEvent.keyDown(confirmation, { key: "Escape" });
    expect(confirmation).toBeInTheDocument();
    const hidden = { ...reasons[0], is_active: false };
    api.listReasonCategories.mockResolvedValue([hidden, ...reasons.slice(1)]);
    resolveSave(hidden);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /숨길까요/ })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveFocus());
    expect(screen.queryByRole("button", { name: "표면 균열", exact: true })).not.toBeInTheDocument();
  });

  it("숨김 저장 실패는 확인창·선택·메모를 보존하고 재시도할 수 있다", async () => {
    api.updateReasonCategory.mockRejectedValue(new Error("숨김 저장 실패"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: "표면 균열", exact: true }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "입력 유지" } });
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "표면 균열 숨김" }));
    const confirmation = screen.getByRole("dialog", { name: /숨길까요/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "숨기기" }));
    expect(await within(confirmation).findByRole("alert")).toHaveTextContent("숨김 저장 실패");
    await waitFor(() => expect(within(confirmation).getByRole("button", { name: "취소" })).toHaveFocus());
    expect(screen.getByLabelText("선택 사유 번호")).toHaveTextContent("surface");
    expect(screen.getByRole("textbox")).toHaveValue("입력 유지");
    expect(within(confirmation).getByRole("button", { name: "숨기기" })).toBeEnabled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "숨기기" }));
    await waitFor(() => expect(api.updateReasonCategory).toHaveBeenCalledTimes(2));
  });

  it("닫거나 Escape를 눌러도 선택과 메모를 유지하고 부모 Escape를 막는다", async () => {
    mount();
    const parentEscape = vi.fn();
    window.addEventListener("keydown", parentEscape);
    try {
      fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
      fireEvent.click(await screen.findByRole("button", { name: "표면 균열", exact: true }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "작성한 메모" } });
      fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
      fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByLabelText("선택 사유 번호")).toHaveTextContent("surface");
      expect(screen.getByRole("textbox")).toHaveValue("작성한 메모");
      expect(parentEscape).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", parentEscape);
    }
  });

  it("목록 조회 실패 시 선택창에서 재시도할 수 있다", async () => {
    api.listReasonCategories.mockRejectedValueOnce(new Error("조회 실패"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("사유 목록을 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("button", { name: "표면 균열", exact: true })).toBeEnabled();
  });

  it("등록 실패 시 검색값을 보존하고 긴 이름의 등록을 차단한다", async () => {
    api.createReasonCategory.mockRejectedValue(new Error("저장 실패"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    await screen.findByRole("button", { name: "표면 균열", exact: true });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "새 사유" } });
    fireEvent.click(screen.getByRole("button", { name: "추가하고 선택" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
    expect(screen.getByRole("searchbox")).toHaveValue("새 사유");
    expect(screen.getByLabelText("선택 사유 번호")).toBeEmptyDOMElement();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "가".repeat(33) } });
    expect(screen.getByRole("button", { name: "추가하고 선택" })).toBeDisabled();
  });
});
