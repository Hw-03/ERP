import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminSectionEntrySkeleton } from "../AdminSectionEntrySkeleton";

describe("AdminSectionEntrySkeleton", () => {
  beforeEach(() => window.history.replaceState({}, "", "/mes?tab=admin"));

  it("품목 진입에서 실제 탭과 비활성 삭제 버튼을 함께 표시한다", () => {
    render(<AdminSectionEntrySkeleton section="items" />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    screen.getAllByRole("tab").forEach(tab => expect(tab).toBeDisabled());
    expect(screen.getByRole("button", { name: "삭제", exact: true })).toBeDisabled();
  });

  it("BOM 진입에서 실제 보기 전환과 잠금 안내 공간을 예약한다", () => {
    render(<AdminSectionEntrySkeleton section="bom" />);
    const modes = screen.getByRole("group", { name: "BOM 보기 방식" });
    expect(within(modes).getByRole("button", { name: "편집", exact: true })).toBeDisabled();
    expect(within(modes).getByRole("button", { name: "사용처", exact: true })).toBeDisabled();
    expect(screen.getByText("완료 해제 후 수정 가능")).toBeVisible();
    expect(screen.getByLabelText("BOM 구성 저장")).toHaveClass("h-9", "shrink-0");
    expect(screen.getByRole("button", { name: "구성 저장", exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "변경 취소", exact: true })).toBeDisabled();
    expect(screen.getByText("미배치 원자재")).toBeInTheDocument();
  });

  it("복원된 사용처 모드로 처음부터 두 패널만 표시한다", () => {
    window.history.replaceState({ bomWorkbench: { mode: "whereused", dept: "H", parentId: "parent" } }, "");
    render(<AdminSectionEntrySkeleton section="bom" />);
    expect(screen.queryByText("하위 품목 추가")).not.toBeInTheDocument();
    expect(screen.queryByText("미배치 원자재")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("BOM 구성 저장")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("admin-table-skeleton")).toHaveLength(2);
  });
});
