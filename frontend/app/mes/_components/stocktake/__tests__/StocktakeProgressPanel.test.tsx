import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StocktakeEvent, StocktakeProgress } from "@/lib/api/types/stocktake";
import { StocktakeActivity, StocktakeProgressPanel } from "../StocktakeProgressPanel";

const summary = { total: 1000, confirmed: 2, applied: 1, unconfirmed: 998, selected: 0, confirmed_excluded: 1, held: 0, pending: 0 };
const progress: StocktakeProgress = { round_id: "r", status: "ACTIVE", summary, item_summary: { total: 500, confirmed: 1, applied: 0, unconfirmed: 499 }, my_waiting: { items: 1, locations: 2 }, by_scope: [{ ...summary, scope_id: "tube", scope_name: "튜브" }], by_employee: [{ ...summary, owner_id: "a", owner_name: "담당자" }], worker_items: [{ owner_id: "a", owner_name: "담당자", surveyed: 5, confirmed: 2, applied: 1 }] };
const event: StocktakeEvent = { event_id: "e", count_id: "c", actor_id: "a", actor_name: "조사자", kind: "COUNT_CONFIRMED", created_at: "2026-10-08T01:23:00Z", item_name: "이전 품목", item_code: "CODE", scope_name: "창고", unit: "개", payload: { quantities: { normal: 12, defect: 0, b_grade: -2, obsolete: null }, reason: "사유", fence: 42 } };

describe("progress presentation", () => {
  it("starts with items and switches recorded quantities instantly while retaining activity and round refresh state", () => {
    const quantified = { ...progress, worker_items: [{ ...progress.worker_items![0], quantities_by_unit: [{ unit: "EA", surveyed: 1234567890, confirmed: 1234567890, applied: 0 }] }] };
    const { rerender, unmount } = render(<StocktakeProgressPanel progress={quantified} active activity={<details><summary>최근 활동</summary>활동</details>} />);
    expect(screen.getByRole("button", { name: "품목 수" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("row", { name: "담당자 2 1" })).toBeInTheDocument();
    const details = screen.getByText("최근 활동").closest("details")!;
    details.open = true;
    fireEvent.click(screen.getByRole("button", { name: "실셈 수량" }));
    const quantityTable = screen.getByRole("table", { name: "작업자별 실셈 수량 · 개" });
    expect(quantityTable).toBeInTheDocument();
    expect(within(quantityTable).getByRole("cell", { name: "확인 1,234,567,890 개" })).toBeInTheDocument();
    expect(screen.getByText("1,234,567,890", { selector: "[data-worker-number]" })).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "[data-worker-number]" })).toBeInTheDocument();
    expect(details).toHaveAttribute("open");
    rerender(<StocktakeProgressPanel progress={{ ...quantified, round_id: "another" }} active />);
    expect(screen.getByRole("button", { name: "실셈 수량" })).toHaveAttribute("aria-pressed", "true");
    unmount();
    render(<StocktakeProgressPanel progress={quantified} active />);
    expect(screen.getByRole("button", { name: "품목 수" })).toHaveAttribute("aria-pressed", "true");
  });

  it("disables legacy quantity mode and keeps missing values distinct from actual zero", () => {
    const { rerender } = render(<StocktakeProgressPanel progress={progress} active={false} />);
    expect(screen.getByRole("button", { name: "실셈 수량" })).toBeDisabled();
    expect(screen.getByText("실셈 수량 자료가 없습니다.")).toBeInTheDocument();
    const quantified = { ...progress, worker_items: [{ ...progress.worker_items![0], quantities_by_unit: [{ unit: "EA", surveyed: null, confirmed: 0, applied: null }] }] };
    rerender(<StocktakeProgressPanel progress={quantified} active />);
    fireEvent.click(screen.getByRole("button", { name: "실셈 수량" }));
    expect(screen.getAllByText("—", { selector: "[data-worker-number]" })).toHaveLength(1);
    expect(screen.getByText("0", { selector: "[data-worker-number]" })).toBeInTheDocument();
    rerender(<StocktakeProgressPanel progress={progress} active />);
    expect(screen.getByRole("button", { name: "실셈 수량" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "실셈 수량" })).toBeDisabled();
    expect(screen.getAllByText("—", { selector: "[data-worker-number]" })).toHaveLength(2);
  });

  it("measures one number slot for all stages and removes all bars before the common space drops below 32px", () => {
    let width = 720;
    let resize!: ResizeObserverCallback;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return { width: this.matches("div.relative") ? width : this.parentElement?.getAttribute("aria-hidden") === "true" ? (this.textContent?.length ?? 0) * 9 : 0 } as DOMRect;
    });
    vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect() {} });
    try {
      const quantified = { ...progress, worker_items: [
        { ...progress.worker_items![0], quantities_by_unit: [{ unit: "EA", surveyed: 1234567890, confirmed: 1234567890, applied: 0 }] },
        { owner_id: "b", owner_name: "LongNameWithoutSpacesForWrapping", surveyed: 2, confirmed: 1, applied: 0, quantities_by_unit: [{ unit: "EA", surveyed: 50, confirmed: 30, applied: 20 }] },
      ] };
      render(<StocktakeProgressPanel progress={quantified} active />);
      fireEvent.click(screen.getByRole("button", { name: "실셈 수량" }));
      const table = screen.getByRole("table", { name: "작업자별 실셈 수량 · 개" });
      expect(table).toHaveStyle({ "--worker-number-width": "117px" });
      expect(table).toHaveAttribute("data-bars", "true");
      width = 420;
      act(() => resize([], {} as ResizeObserver));
      expect(table).toHaveAttribute("data-bars", "false");
      expect(table).toHaveAttribute("data-desktop-stack", "false");
      width = 350;
      act(() => resize([], {} as ResizeObserver));
      expect(table).toHaveAttribute("data-desktop-stack", "true");
      width = 230;
      act(() => resize([], {} as ResizeObserver));
      expect(table).toHaveAttribute("data-mobile-stack", "true");
      expect(within(table).getByText("1,234,567,890")).toBeInTheDocument();
      expect(within(table).getByRole("rowheader", { name: "LongNameWithoutSpacesForWrapping" })).toBeInTheDocument();
    } finally {
      rect.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("shares every worker and stage axis per unit and preserves participant order", () => {
    render(<StocktakeProgressPanel progress={{ ...progress, worker_items: [
      { owner_id: "b", owner_name: "먼저 참여", surveyed: 1, confirmed: 1, applied: 0, quantities_by_unit: [{ unit: "EA", surveyed: 100, confirmed: 50, applied: 0 }, { unit: "kg", surveyed: 8, confirmed: 2, applied: null }] },
      { owner_id: "a", owner_name: "다음 참여", surveyed: 2, confirmed: 1, applied: 0, quantities_by_unit: [{ unit: "EA", surveyed: 50, confirmed: 25, applied: 0 }, { unit: "kg", surveyed: 4, confirmed: 2, applied: 0 }] },
    ] }} active />);
    fireEvent.click(screen.getByRole("button", { name: "실셈 수량" }));
    const table = screen.getByRole("table", { name: "작업자별 실셈 수량 · 단위별" });
    expect(within(table).getAllByRole("rowheader").map(header => header.textContent)).toEqual(["먼저 참여", "다음 참여"]);
    const first = table.querySelectorAll("tbody tr:first-child [data-worker-chart-bar]");
    const second = table.querySelectorAll("tbody tr:nth-child(2) [data-worker-chart-bar]");
    expect(first[0]).toHaveStyle({ width: "100%" });
    expect(first[1]).toHaveStyle({ width: "100%" });
    expect(second[0]).toHaveStyle({ width: "50%" });
    expect(second[1]).toHaveStyle({ width: "100%" });
    expect(within(table).getByText("50 개")).toBeInTheDocument();
    expect(within(table).getAllByText("2 kg")).toHaveLength(2);
  });

  it("keeps EA and 개 on one unit axis with exact fractional quantities", () => {
    render(<StocktakeProgressPanel progress={{ ...progress, worker_items: [
      { ...progress.worker_items![0], quantities_by_unit: [{ unit: "EA", surveyed: 100, confirmed: 0.1234567, applied: null }] },
      { owner_id: "b", owner_name: "다른 작업자", surveyed: 1, confirmed: 1, applied: 0, quantities_by_unit: [{ unit: "개", surveyed: 50, confirmed: 25, applied: 0 }] },
    ] }} active />);
    fireEvent.click(screen.getByRole("button", { name: "실셈 수량" }));
    const table = screen.getByRole("table", { name: "작업자별 실셈 수량 · 개" });
    expect(within(table).getByText("0.1234567")).toBeInTheDocument();
    expect(within(table).queryByRole("cell", { name: "조사 50 개" })).not.toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "확인 25 개" }).querySelector("[data-worker-chart-bar]")).toHaveStyle({ width: "100%" });
    expect(within(table).queryByText("EA")).not.toBeInTheDocument();
  });

  it("labels unknown units and leaves absent unit contributions as missing", () => {
    render(<StocktakeProgressPanel progress={{ ...progress, worker_items: [
      { ...progress.worker_items![0], quantities_by_unit: [{ unit: "", surveyed: 3, confirmed: null, applied: null }] },
      { owner_id: "b", owner_name: "자료 없는 작업자", surveyed: 1, confirmed: 0, applied: 0, quantities_by_unit: [] },
    ] }} active={false} />);
    fireEvent.click(screen.getByRole("button", { name: "실셈 수량" }));
    const table = screen.getByRole("table", { name: "작업자별 실셈 수량 · 단위 미지정" });
    const missingRow = within(table).getByRole("rowheader", { name: "자료 없는 작업자" }).closest("tr")!;
    expect(within(missingRow).getAllByText("—")).toHaveLength(2);
    expect(missingRow.querySelector("[data-worker-chart-bar]")).toBeNull();
    expect(within(table).getAllByRole("cell", { name: "확인 — 단위 미지정" })).toHaveLength(2);
  });

  it("keeps an empty participant list empty in quantity mode", () => {
    render(<StocktakeProgressPanel progress={{ ...progress, worker_items: [], by_employee: [] }} active />);
    fireEvent.click(screen.getByRole("button", { name: "실셈 수량" }));
    expect(screen.getByText("참여한 작업자가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /작업자별/ })).not.toBeInTheDocument();
    expect(screen.queryByText("0", { selector: "[data-worker-number]" })).not.toBeInTheDocument();
  });
  it("compares every worker and stage against one shared maximum", () => {
    render(<StocktakeProgressPanel progress={{ ...progress, worker_items: [
      { owner_id: "a", owner_name: "첫 작업자", surveyed: 100, confirmed: 50, applied: 25 },
      { owner_id: "b", owner_name: "둘째 작업자", surveyed: 50, confirmed: 25, applied: 0 },
    ] }} active />);
    expect(screen.queryByText(/^공통 눈금/)).not.toBeInTheDocument();
    expect(screen.queryByText(/품목별 위치를 각각 집계합니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/조사는 시작한 품목/)).not.toBeInTheDocument();
    const first = screen.getByRole("row", { name: "첫 작업자 50 25" }).querySelectorAll("[data-worker-chart-bar]");
    const second = screen.getByRole("row", { name: "둘째 작업자 25 0" }).querySelectorAll("[data-worker-chart-bar]");
    expect(first).toHaveLength(2);
    expect(first[0]).toHaveStyle({ width: "100%" });
    expect(first[1]).toHaveStyle({ width: "50%" });
    expect(second[0]).toHaveStyle({ width: "50%" });
    expect(second[1]).toHaveStyle({ width: "0%" });
    first.forEach(bar => expect(bar.parentElement).toHaveAttribute("aria-hidden", "true"));
  });

  it("keeps zero values empty and recalculates the common scale after a refresh", () => {
    const { rerender } = render(<StocktakeProgressPanel progress={{ ...progress, worker_items: [
      { owner_id: "a", owner_name: "참여자", surveyed: 0, confirmed: 0, applied: 0 },
    ] }} active />);
    expect(screen.getByRole("row", { name: "참여자 0 0" })).toBeInTheDocument();
    const bars = screen.getByRole("row", { name: "참여자 0 0" }).querySelectorAll("[data-worker-chart-bar]");
    expect(bars).toHaveLength(2);
    bars.forEach(bar => expect(bar).toHaveStyle({ width: "0%" }));
    rerender(<StocktakeProgressPanel progress={{ ...progress, worker_items: [
      { owner_id: "a", owner_name: "참여자", surveyed: 10, confirmed: 5, applied: 0 },
      { owner_id: "b", owner_name: "많이 조사한 참여자", surveyed: 20, confirmed: 10, applied: 5 },
    ] }} active />);
    expect(screen.queryByText(/^공통 눈금/)).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: "참여자 5 0" }).querySelector("[data-worker-chart-bar]")).toHaveStyle({ width: "50%" });
  });

  it("preserves long names and large exact counts without reducing them to percentages", () => {
    const name = "LongWorkerNameWithoutWhitespaceForComparison";
    render(<StocktakeProgressPanel progress={{ ...progress, worker_items: [
      { owner_id: "a", owner_name: name, surveyed: 125000, confirmed: 100000, applied: 62500 },
    ] }} active={false} />);
    const row = screen.getByRole("row", { name: `${name} 100,000 62,500` });
    expect(within(row).getByRole("rowheader", { name })).toBeInTheDocument();
    const bars = row.querySelectorAll("[data-worker-chart-bar]");
    expect(bars[0]).toHaveStyle({ width: "100%" });
    expect(bars[1]).toHaveStyle({ width: "62.5%" });
    expect(row.textContent).not.toContain("%");
    expect(screen.queryByText(/^공통 눈금/)).not.toBeInTheDocument();
  });
  it("keeps the round, locations, workers and evidence in mobile reading order without next actions", () => {
    render(<StocktakeProgressPanel progress={progress} active
      roundInfo={<section aria-label="조사 회차 정보">긴 회차 이름 · 진행 중</section>}
      evidence={<section aria-label="종료 증빙">종료 사유</section>}
      activity={<details aria-label="최근 활동"><summary>최근 활동</summary>활동 내용</details>} />);
    const round = screen.getByRole("region", { name: "조사 회차 정보" });
    expect(screen.queryByRole("region", { name: "다음 작업" })).not.toBeInTheDocument();
    const locations = screen.getByRole("region", { name: "위치별 진행" });
    const workers = screen.getByRole("region", { name: "작업자별 현황" });
    const evidence = screen.getByRole("region", { name: "종료 증빙" });
    const activity = screen.getByText("최근 활동", { selector: "summary" }).closest("details")!;
    [round, locations, workers, evidence].forEach((element, index) => {
      expect(element.compareDocumentPosition([locations, workers, evidence, activity][index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(workers.closest("details")).toBeNull();
    expect(activity).not.toHaveAttribute("open");
    expect(within(workers).getByRole("table", { name: "작업자별 품목 수" })).toBeInTheDocument();
    expect(within(workers).getByRole("row", { name: "담당자 2 1" })).toBeInTheDocument();
  });

  it("preserves activity disclosure state when progress and slots refresh", () => {
    const activity = <details aria-label="최근 활동"><summary>최근 활동</summary>활동 내용</details>;
    const { rerender } = render(<StocktakeProgressPanel progress={progress} active activity={activity} />);
    const disclosure = screen.getByText("최근 활동", { selector: "summary" }).closest("details")!;
    disclosure.open = true;
    rerender(<StocktakeProgressPanel progress={{ ...progress, summary: { ...summary, confirmed: 3 } }} active
      roundInfo={<section aria-label="조사 회차 정보">진행 중</section>}
      activity={<details aria-label="최근 활동"><summary>최근 활동</summary>갱신된 활동</details>} />);
    expect(screen.getByText("최근 활동", { selector: "summary" }).closest("details")).toBe(disclosure);
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByText("갱신된 활동")).toBeInTheDocument();
  });

  it("shows all participants with comparable item counts in a closed round", () => {
    const scopeName = "긴 위치 이름 · 고압 조립 및 검사 대기 구역";
    const ownerName = "LongWorkerNameWithoutWhitespace";
    render(<StocktakeProgressPanel active={false} progress={{ ...progress,
      by_scope: [{ ...summary, scope_id: "long", scope_name: scopeName }],
      by_employee: [{ ...summary, owner_id: "a", owner_name: ownerName, total: 12, confirmed: 11, applied: 6 },
        { ...summary, owner_id: "b", owner_name: "두 번째 작업자", total: 3, confirmed: 1, applied: 0 }],
      worker_items: [{ owner_id: "a", owner_name: ownerName, surveyed: 8, confirmed: 7, applied: 4 },
        { owner_id: "b", owner_name: "두 번째 작업자", surveyed: 3, confirmed: 1, applied: 0 },
        { owner_id: "c", owner_name: "중단한 작업자", surveyed: 1, confirmed: 0, applied: 0 }],
    }} roundInfo={<section aria-label="조사 회차 정보">긴 회차 이름 · 품목 기준 · 부분 종료</section>}
      evidence={<section aria-label="종료 증빙">긴 종료 사유를 보존합니다.</section>} />);
    const workers = screen.getByRole("region", { name: "작업자별 현황" });
    expect(within(workers).getByRole("row", { name: `${ownerName} 7 4` })).toBeInTheDocument();
    expect(within(workers).getByRole("row", { name: "두 번째 작업자 1 0" })).toBeInTheDocument();
    expect(within(workers).getByRole("row", { name: "중단한 작업자 0 0" })).toBeInTheDocument();
    expect(within(workers).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText(scopeName, { selector: "h4" })).toBeInTheDocument();
    expect(screen.getByText("긴 종료 사유를 보존합니다.")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["품목 수", "실셈 수량"]);
  });

  it("keeps location rates without duplicated item actions", () => {
    render(<StocktakeProgressPanel progress={progress} active />);
    expect(screen.queryByRole("region", { name: "다음 작업" })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "전체 위치 반영" })).toHaveAttribute("value", "1");
    expect(screen.getAllByText("(0.1%)").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "작업자별 현황" })).toBeVisible();
    expect(screen.getAllByText("대상 1,000건")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "조사하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "반영 대기" })).not.toBeInTheDocument();
  });
  it("does not infer legacy counts and hides closed-round actions", () => {
    render(<StocktakeProgressPanel progress={{ ...progress, item_summary: undefined, my_waiting: undefined, by_scope: [], by_employee: [], worker_items: [], summary: { ...summary, total: 0, confirmed: 0, applied: 0, held: 2, pending: 3 } }} active={false} />);
    expect(screen.queryByRole("region", { name: "다음 작업" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["품목 수", "실셈 수량"]);
    expect(screen.getByText("종료 시 미반영 위치")).toBeInTheDocument();
    expect(screen.getByText("보류 2건 · 미편입 대기 3건")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "전체 위치 확인" })).toHaveAttribute("max", "1");
    expect(screen.getByText("참여한 작업자가 없습니다.")).toBeInTheDocument();
  });
  it("does not label legacy location counts as item counts", () => {
    render(<StocktakeProgressPanel progress={{ ...progress, worker_items: undefined }} active />);
    const workers = screen.getByRole("region", { name: "작업자별 현황" });
    expect(within(workers).getByRole("row", { name: "담당자 — —" })).toBeInTheDocument();
    expect(within(workers).getByText("품목 집계를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(workers.querySelector("[data-worker-chart-bar]")).toBeNull();
  });
  it("reads recorded evidence and hides technical payload from staff", () => {
    render(<StocktakeActivity events={[event]} admin={false} />);
    expect(screen.getByText("이전 품목 · 창고")).toBeInTheDocument();
    expect(screen.getByText("12 개")).toBeInTheDocument();
    expect(screen.getByText("0 개")).toBeInTheDocument();
    expect(screen.getByText("-2 개")).toBeInTheDocument();
    expect(screen.getByText("미입력")).toBeInTheDocument();
    expect(screen.getByText("사유: 사유")).toBeInTheDocument();
    expect(screen.queryByText("원본 증빙")).not.toBeInTheDocument();
  });
  it("keeps admin proof collapsed and tolerates unknown events without invented quantities", () => {
    render(<StocktakeActivity events={[{ ...event, kind: "FUTURE_EVENT", payload: {} }]} admin />);
    expect(screen.getByText("기타 작업")).toBeInTheDocument();
    expect(screen.getByText("원본 증빙").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText("12 개")).not.toBeInTheDocument();
  });
});
