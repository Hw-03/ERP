import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DefectStorageView } from "../DefectStorageView";
import { DisassembleTree } from "../DisassembleTree";
import { DefectKpiCards } from "../DefectKpiCards";

const bomApi = vi.hoisted(() => ({ getBomTemplate: vi.fn() }));
vi.mock("@/lib/api/dept-adjustment", () => ({ deptAdjustmentApi: bomApi }));
beforeEach(() => { bomApi.getBomTemplate.mockReset().mockReturnValue(new Promise(() => {})); });
it("retries a failed mobile BOM template without changing the parent or quantity", async () => {
  bomApi.getBomTemplate.mockRejectedValueOnce(new Error("BOM 조회 실패")).mockResolvedValueOnce({ lines: [] });
  render(<DisassembleTree mobilePresentation parentItemId="item1" parentItemName="상위 품목" parentMesCode="P1" parentQty={2} parentDept="고압" decisions={[]} onChange={vi.fn()} />);
  expect(await screen.findByText("BOM 조회 실패")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("BOM 하위 품목이 없습니다.")).toBeInTheDocument();
  expect(bomApi.getBomTemplate).toHaveBeenCalledTimes(2);
  expect(bomApi.getBomTemplate).toHaveBeenNthCalledWith(2, "item1", "disassembly", 2);
  expect(screen.queryByText("BOM 조회 실패")).not.toBeInTheDocument();
});
it("keeps the storage search and category labels while values are loading", () => {
  render(<DefectStorageView mobilePresentation loading locations={[]} currentEmployee={{ employee_id: "e1", name: "작업자", department: "고압" }} onBack={vi.fn()} onUpdated={vi.fn()} onRestore={vi.fn()} />);
  expect(screen.getByRole("textbox", { name: "B급·구형 검색" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "보관 분류 필터" })).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "B급·구형 자재 불러오는 중" })).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText("보관 중인 B급·구형 자재가 없습니다.")).not.toBeInTheDocument();
});
it("keeps the known disassembly parent and reserves child rows", () => {
  render(<DisassembleTree mobilePresentation parentItemId="item1" parentItemName="상위 품목" parentMesCode="P1" parentQty={2} parentDept="고압" decisions={[]} onChange={vi.fn()} />);
  expect(screen.getByText("상위 품목")).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "BOM 하위 품목 불러오는 중" })).toHaveAttribute("aria-busy", "true");
});
it("keeps mobile KPI labels while unknown values are busy", () => {
  const { container } = render(<DefectKpiCards mobilePresentation loading kpi={{ quarantined: 0, over_one_year: 0 }} onCardClick={vi.fn()} />);
  expect(screen.getByText("격리 중")).toBeInTheDocument();
  expect(container.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
});
