import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MesViewportSkeleton } from "../MesViewportSkeleton";

describe("MesViewportSkeleton", () => {
  it("반응형 화면을 판정하는 동안 PC와 모바일 공통 셸 자리를 유지한다", () => {
    render(<MesViewportSkeleton />);

    expect(screen.getByRole("status", { name: "DEXCOWIN MES 화면 준비 중" })).toBeInTheDocument();
    expect(screen.getByTestId("viewport-skeleton-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("viewport-skeleton-content")).toBeInTheDocument();
  });
});
