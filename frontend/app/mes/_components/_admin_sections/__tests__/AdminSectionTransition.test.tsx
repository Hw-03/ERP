import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSectionTransition } from "../AdminSectionTransition";
import { AdminSectionTabs } from "../AdminSectionTabs";
import type { AdminSection } from "../../_admin_hooks/useAdminViewState";
import type { AdminSectionContentProps } from "../AdminSectionContent";

const contentRender = vi.hoisted(() => vi.fn());
vi.mock("../AdminSectionContent", async () => {
  const { memo } = await import("react");
  return { AdminSectionContent: memo(({ section }: { section: string }) => {
    contentRender(section);
    return <div data-testid="actual-section">본문 {section}</div>;
  }) };
});

const contentProps = {} as Omit<AdminSectionContentProps, "section">;
function Harness({ initial = "models" }: { initial?: AdminSection }) {
  const [section, setSection] = useState(initial);
  return <><AdminSectionTabs section={section} onSelect={setSection} /><AdminSectionTransition section={section} contentProps={contentProps} /></>;
}

let frames: Map<number, FrameRequestCallback>;
let frameId: number;
function nextFrame(): void {
  act(() => {
    const current = [...frames.values()];
    frames.clear();
    current.forEach((callback) => callback(0));
  });
}

beforeEach(() => {
  frames = new Map();
  frameId = 0;
  contentRender.mockClear();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminSectionTransition", () => {
  it.each(["items", "bom"] as const)("paints the %s entry before mounting its heavy body, without rendering the old section again", (section) => {
    render(<Harness />);
    const label = section === "items" ? "품목 관리" : "BOM 관리";
    fireEvent.click(screen.getByRole("button", { name: label, exact: true }));
    expect(screen.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: `${label} 불러오는 중` })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("actual-section").closest("[aria-hidden='true']")).toHaveAttribute("inert");
    expect(contentRender.mock.calls.map(([value]) => value)).toEqual(["models"]);
    nextFrame();
    expect(contentRender).not.toHaveBeenCalledWith(section);
    nextFrame();
    expect(contentRender.mock.calls.map(([value]) => value)).toEqual(["models", section]);
    const cover = screen.getByTestId("admin-section-entry-cover");
    expect(cover).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.animationEnd(cover);
    expect(screen.queryByTestId("admin-section-entry-cover")).not.toBeInTheDocument();
  });

  it("does not mount a heavy initial section until the entry has had a paint opportunity", () => {
    render(<Harness initial="items" />);
    expect(screen.getByRole("heading", { name: "품목 관리" })).toBeInTheDocument();
    expect(contentRender).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "품목명, 코드 검색" })).toBeDisabled();
    nextFrame();
    expect(contentRender).not.toHaveBeenCalled();
    nextFrame();
    expect(contentRender).toHaveBeenCalledOnce();
  });

  it("cancels superseded entries and mounts only the latest selection", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "품목 관리", exact: true }));
    nextFrame();
    fireEvent.click(screen.getByRole("button", { name: "BOM 관리", exact: true }));
    nextFrame();
    nextFrame();
    expect(contentRender).not.toHaveBeenCalledWith("items");
    expect(contentRender).toHaveBeenLastCalledWith("bom");
  });

  it("cancels pending work when leaving for an unaffected section", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "품목 관리", exact: true }));
    nextFrame();
    fireEvent.click(screen.getByRole("button", { name: "직원 관리", exact: true }));
    nextFrame();
    nextFrame();
    expect(contentRender.mock.calls.map(([value]) => value)).toEqual(["models", "employees"]);
    expect(screen.queryByTestId("admin-section-entry-cover")).not.toBeInTheDocument();
  });

  it("does not repeat entry on ordinary refresh or same-menu selection but does on a return visit", () => {
    const { rerender } = render(<Harness initial="items" />);
    nextFrame();
    nextFrame();
    fireEvent.animationEnd(screen.getByTestId("admin-section-entry-cover"));
    fireEvent.click(screen.getByRole("button", { name: "품목 관리", exact: true }));
    rerender(<Harness initial="items" />);
    expect(screen.queryByTestId("admin-section-entry-cover")).not.toBeInTheDocument();
    expect(contentRender).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "모델 관리", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "품목 관리", exact: true }));
    expect(screen.getByRole("status", { name: "품목 관리 불러오는 중" })).toBeInTheDocument();
    expect(contentRender.mock.calls.map(([value]) => value)).toEqual(["items", "models"]);
    nextFrame();
    nextFrame();
    expect(contentRender.mock.calls.map(([value]) => value)).toEqual(["items", "models", "items"]);
  });

  it("removes the prepared cover immediately with reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<Harness initial="bom" />);
    nextFrame();
    nextFrame();
    expect(screen.getByTestId("actual-section")).toHaveTextContent("본문 bom");
    expect(screen.queryByTestId("admin-section-entry-cover")).not.toBeInTheDocument();
  });

  it("updates a prepared body's data without recreating an entry cover", () => {
    const { rerender } = render(<AdminSectionTransition section="items" contentProps={contentProps} />);
    nextFrame();
    nextFrame();
    fireEvent.animationEnd(screen.getByTestId("admin-section-entry-cover"));
    rerender(<AdminSectionTransition section="items" contentProps={{ ...contentProps, globalSearch: "updated" }} />);
    expect(screen.queryByTestId("admin-section-entry-cover")).not.toBeInTheDocument();
    expect(frames.size).toBe(0);
    expect(contentRender).toHaveBeenCalledTimes(2);
  });
});
