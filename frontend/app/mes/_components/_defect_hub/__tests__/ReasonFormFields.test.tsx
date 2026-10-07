import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReasonFormFields } from "../ReasonFormFields";

const api = vi.hoisted(() => ({
  listReasonCategories: vi.fn(), createReasonCategory: vi.fn(), updateReasonCategory: vi.fn(),
}));
vi.mock("@/lib/api/defects", () => ({ defectsApi: api }));

const reasons = [
  { category_id: "surface", name: "표면 균열", is_active: true, is_other: false },
  { category_id: "other", name: "기타", is_active: true, is_other: true },
  { category_id: "hidden", name: "지난 사유", is_active: false, is_other: false },
];

function Form() {
  const [category, setCategory] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  return <>
    <ReasonFormFields employeeId="employee" category={category} categoryId={categoryId}
      memo={memo} onCategoryChange={(name, id) => { setCategory(name); setCategoryId(id ?? null); }}
      onMemoChange={setMemo} required />
    <output aria-label="선택 사유 번호">{categoryId}</output>
  </>;
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Form /></QueryClientProvider>);
}

describe("managed defect reasons", () => {
  beforeEach(() => { vi.clearAllMocks(); api.listReasonCategories.mockResolvedValue(reasons); });

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
    fireEvent.change(screen.getByRole("textbox", { name: "표면 균열 이름 수정" }), { target: { value: "새 균열" } });
    fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));
    expect(await screen.findByRole("button", { name: "새 균열", exact: true })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "새 균열 숨김" }));
    await waitFor(() => expect(screen.getByLabelText("선택 사유 번호")).toBeEmptyDOMElement());
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
