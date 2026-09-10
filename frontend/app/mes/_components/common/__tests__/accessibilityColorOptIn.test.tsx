import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterChip } from "../FilterChip";
import { KpiCard } from "../KpiCard";
import { StatusPill } from "../StatusPill";

const blue = "var(--c-blue)";
const readableBlue = "color-mix(in srgb, var(--c-blue) 60%, var(--c-text))";

describe("공용 상태 색상 opt-in", () => {
  it("KpiCard 기본 톤은 유지하고 지정된 텍스트 톤만 적용한다", () => {
    const { rerender } = render(<KpiCard label="전체" value={1} tone={blue} headerCompact />);

    expect(screen.getByText("전체")).toHaveStyle({ color: blue });

    rerender(<KpiCard label="전체" value={1} tone={blue} textTone={readableBlue} headerCompact />);
    expect(screen.getByText("전체")).toHaveStyle({ color: readableBlue });
  });

  it("FilterChip 기본 톤은 유지하고 활성 텍스트 톤을 opt-in한다", () => {
    const { rerender } = render(<FilterChip active label="전체" onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "전체" })).toHaveStyle({ color: blue });

    rerender(<FilterChip active label="전체" onClick={vi.fn()} textTone={readableBlue} />);
    expect(screen.getByRole("button", { name: "전체" })).toHaveStyle({ color: readableBlue });
  });

  it("StatusPill 기본 톤은 유지하고 텍스트 톤을 opt-in한다", () => {
    const { rerender } = render(<StatusPill label="정보" tone="info" />);

    expect(screen.getByText("정보").parentElement).toHaveStyle({ color: blue });

    rerender(<StatusPill label="정보" tone="info" textTone={readableBlue} />);
    expect(screen.getByText("정보").parentElement).toHaveStyle({ color: readableBlue });
  });
});
