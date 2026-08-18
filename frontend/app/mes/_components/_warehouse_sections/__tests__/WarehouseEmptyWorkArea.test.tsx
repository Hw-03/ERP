import { fireEvent, render, screen } from "@testing-library/react";
import { FilePenLine } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { WarehouseEmptyWorkArea } from "../WarehouseEmptyWorkArea";

describe("WarehouseEmptyWorkArea", () => {
  it("renders centered empty guidance and its optional action", () => {
    const onClick = vi.fn();

    render(
      <WarehouseEmptyWorkArea
        icon={<FilePenLine />}
        title="작업 중인 요청이 없습니다."
        description="요청 작성 화면에서 입력하면 임시저장할 수 있습니다."
        action={{ label: "요청 작성", onClick }}
      />,
    );

    const workArea = screen.getByTestId("warehouse-empty-work-area");
    expect(workArea).toHaveClass("flex-1", "min-h-0", "rounded-[20px]", "border");
    expect(screen.getByText("작업 중인 요청이 없습니다.")).toHaveClass("text-xl", "font-black");
    expect(screen.getByText("요청 작성 화면에서 입력하면 임시저장할 수 있습니다.")).toHaveClass("text-sm");
    expect(screen.getByRole("button", { name: "요청 작성" })).toHaveClass("min-h-11");

    fireEvent.click(screen.getByRole("button", { name: "요청 작성" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
