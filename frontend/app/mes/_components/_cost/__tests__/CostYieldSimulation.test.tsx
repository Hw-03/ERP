import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CostYieldSummary } from "../CostYieldSimulation";

const cost = { unit_cost: "250.00", status: "complete" as const, issues: [], hourly_labor_rate: "6000.00",
  yield_adjusted_unit_cost: "300.00", yield_cost_difference: "50.00", yield_stages: [
    { item_id: "t", item_name: "튜브", mes_code: "8-TF", process_type_code: "TF", path: ["r", "t"], standard_yield_percent: "80.00", effective_yield_percent: "80.00", input_unit_cost: "100.00", output_unit_cost: "125.00" },
    { item_id: "n", item_name: "발생부", mes_code: "8-NF", process_type_code: "NF", path: ["r", "n"], standard_yield_percent: "90.00", effective_yield_percent: "90.00", input_unit_cost: "225.00", output_unit_cost: "250.00" },
  ] };

describe("저장된 단계별 기준 수율 표시", () => {
  it("서버 결과를 그대로 비교하고 단계 보정액을 다시 합산하지 않는다", () => {
    render(<CostYieldSummary cost={cost} busy={false} invalidHourly={false} />);
    expect(screen.getByText("300 원")).toBeVisible();
    expect(screen.getByText("50 원")).toBeVisible();
    expect(screen.getByText("기준 수율 적용 중")).toBeVisible();
    expect(screen.getByRole("table", { name: "단계별 기준 수율" })).toHaveTextContent("225 원");
    expect(screen.getByText("80%")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("접힌 상태에서는 배지만 표시하고 더보기로 비교를 연다", () => {
    const change = vi.fn();
    render(<CostYieldSummary cost={cost} busy={false} invalidHourly={false} compact inline onExpandedChange={change} />);
    expect(screen.queryByText("300 원")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "원가 상세 더보기" }));
    expect(change).toHaveBeenCalledWith(true);
  });
  it("갱신 중에는 이전 계산임을 표시하고 비교 금액을 보류한다", () => {
    const view = render(<CostYieldSummary cost={cost} busy invalidHourly={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("이전 계산값");
    expect(screen.queryByText("300 원")).not.toBeInTheDocument();
    view.rerender(<CostYieldSummary cost={cost} busy={false} invalidHourly />);
    expect(screen.getByRole("status")).toHaveTextContent("시급 입력을 확인");
  });
  it("미등록 기준과 등록된 100%, 적용 대상 없음을 구분한다", () => {
    const stages = cost.yield_stages.map((s, i) => ({ ...s, standard_yield_percent: i ? "100.00" : null, effective_yield_percent: "100.00" }));
    const view = render(<CostYieldSummary cost={{ ...cost, yield_stages: stages }} busy={false} invalidHourly={false} />);
    expect(screen.getByText("미등록 · 100% 가정")).toBeVisible();
    expect(screen.getByText("100%")).toBeVisible();
    expect(screen.queryByText("기준 수율 적용 중")).not.toBeInTheDocument();
    view.rerender(<CostYieldSummary cost={{ ...cost, yield_stages: [] }} busy={false} invalidHourly={false} />);
    expect(screen.getByText("기준 수율 적용 대상 공정이 없습니다.")).toBeVisible();
  });
  it("부분 비용과 등록된 0원, 미등록 금액을 구분한다", () => {
    render(<CostYieldSummary cost={{ ...cost, status: "partial", unit_cost: "0.00", yield_adjusted_unit_cost: "0.00", yield_cost_difference: "0.00", yield_stages: [] }} busy={false} invalidHourly={false} />);
    expect(screen.getAllByText("0 원")).toHaveLength(3);
    expect(screen.getByText(/등록된 비용의 부분 합계이며/)).toBeVisible();
  });
  it("원가를 계산할 수 없어도 저장된 적용 기준은 조회할 수 있다", () => {
    render(<CostYieldSummary cost={{ ...cost, status: "unavailable", unit_cost: null, yield_adjusted_unit_cost: null, yield_cost_difference: null, yield_stages: cost.yield_stages.map(s => ({ ...s, input_unit_cost: null, output_unit_cost: null })) }} busy={false} invalidHourly={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("계산 불가");
    expect(screen.getByRole("table", { name: "단계별 기준 수율" })).toHaveTextContent("80%");
    expect(screen.getAllByText("정보 없음").length).toBeGreaterThan(0);
  });
});
