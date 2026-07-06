import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { api } from "@/lib/api";
import { IoComposeView } from "../IoComposeView";

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/mes",
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams("tab=warehouse"),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getAllBOM: vi.fn(),
    getItems: vi.fn(),
    preview: vi.fn(),
    saveDraft: vi.fn(),
    getDraft: vi.fn(),
    deleteDraft: vi.fn(),
    submit: vi.fn(),
    getIndependentShippingComponentChangePreview: vi.fn(),
    executeIndependentShippingComponentChange: vi.fn(),
  },
}));

const operator = {
  employee_id: "op-1",
  name: "김현우",
  department: "조립",
  warehouse_role: "none",
};

function renderCompose(items: Item[] = []) {
  return render(
    <IoComposeView
      globalSearch=""
      operator={operator}
      employees={[]}
      items={items}
      productModels={[]}
      setItems={() => {}}
      onStatusChange={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAllBOM).mockResolvedValue([]);
  vi.mocked(api.getItems).mockResolvedValue([]);
  routerPush.mockClear();
});

describe("IoComposeView navigation chrome", () => {
  it("replaces the work-type card with a dedicated work screen after selecting a work type", async () => {
    renderCompose();

    expect(screen.getByRole("button", { name: /창고 입출고/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "작업 유형 선택" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /창고 입출고/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "작업 유형 선택" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /품목 전환/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "세부 작업과 부서 선택" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "작업 유형 선택" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /창고 입출고/ })).toBeInTheDocument();
    });
    expect(screen.queryAllByRole("button", { name: "작업 유형 선택" })).toHaveLength(0);
  });
});
