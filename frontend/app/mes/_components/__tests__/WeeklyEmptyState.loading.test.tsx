import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WeeklyDetailTable } from "../_weekly_sections/WeeklyDetailTable";

it("빈 주간보고의 화면 내 이미지를 즉시 로딩한다", () => {
  const { container } = render(
    <WeeklyDetailTable group={undefined} stockBasis="normal" onItemSelect={vi.fn()} />,
  );

  expect(screen.getByText("해당 공정완료품 데이터가 없습니다.")).toBeInTheDocument();
  expect(container.querySelector('img[src*="history-empty.webp"]')).toHaveAttribute("loading", "eager");
});
