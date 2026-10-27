import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBatch, IoBundle, IoLine, StockRequest } from "@/lib/api";
import { IoDraftWorkTable } from "../IoDraftWorkTable";
import { IoDraftWorkCard } from "../IoDraftWorkCard";
import { DraftCartItemRow } from "../DraftCartItemRow";

function makeLine(overrides: Partial<IoLine> = {}): IoLine {
  return {
    line_id: "line-1",
    item_id: "item-1",
    item_name: "DX3000 분해 대상",
    mes_code: "3-AA-0001",
    unit: "EA",
    direction: "out",
    from_bucket: "production",
    from_department: "조립",
    to_bucket: "none",
    to_department: null,
    quantity: 1,
    bom_expected: null,
    included: true,
    origin: "direct",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
    approval_outcome: null,
    ...overrides,
  };
}

function makeBundle(overrides: Partial<IoBundle> = {}): IoBundle {
  return {
    bundle_id: "bundle-1",
    source_kind: "bom_parent",
    title: "DX3000 분해 대상",
    source_item_id: "item-1",
    source_mes_code: "3-AA-0001",
    quantity: 1,
    expanded_level: 1,
    lines: [
      makeLine(),
      makeLine({
        line_id: "line-2",
        item_id: "item-2",
        item_name: "DX3000 POWER BUTTON",
        mes_code: "3-AR-0006",
        direction: "in",
        from_bucket: "none",
        from_department: null,
        to_bucket: "production",
        to_department: "조립",
        quantity: 2,
        bom_expected: 2,
        origin: "bom_auto",
      }),
    ],
    ...overrides,
  };
}

function makeDraft(overrides: Partial<IoBatch> = {}): IoBatch {
  return {
    batch_id: "batch-1",
    work_type: "process",
    sub_type: "disassemble",
    status: "draft",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    approver_employee_id: null,
    approver_name: null,
    from_department: null,
    to_department: "조립",
    requires_approval: true,
    stock_request_id: null,
    shipping_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-08-04T00:05:00Z",
    updated_at: "2026-08-04T00:10:00Z",
    submitted_at: null,
    completed_at: null,
    bundles: [makeBundle()],
    ...overrides,
  };
}

describe("IoDraftWorkTable hierarchy", () => {
  it.each(["desktop", "mobile"] as const)("%s 작업 목록의 중복 부분 예약 안내를 생략하고 부족 요약은 유지한다", (layout) => {
    const draft = makeDraft({ bundles: [makeBundle({ lines: [makeLine({ shortage: 2 })] })], reservation_status: "reserved", effective_plan: { version: 1, fingerprint: "partial", effects: [
      { kind: "out", item_id: "item-1", quantity: 5 },
    ] } as IoBatch["effective_plan"], reservation_issue: { code: "stock_shortage", message: "internal", shortages: [
      { item_id: "item-1", item_name: "부족 자재", mes_code: "MAT", unit: "EA", location: { bucket: "warehouse", department: null }, required_quantity: 5, available_quantity: 3, shortage_quantity: 2 },
    ] } });
    const actions = { onContinue: vi.fn(), onRequestDelete: vi.fn() };
    render(layout === "desktop" ? <IoDraftWorkTable drafts={[draft]} busyId={null} {...actions} /> : <IoDraftWorkCard draft={draft} isBusy={false} {...actions} />);
    expect(screen.queryByText("자재 일부 예약")).not.toBeInTheDocument();
    expect(screen.queryByText(/확보 가능한 자재만 예약했습니다/)).not.toBeInTheDocument();
    expect(screen.getByText(layout === "desktop" ? "부족 1종" : "자재 1종 부족")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이어서 작업" })).toBeEnabled();
  });
  it("모바일 대표 품목은 묶음 개수 대신 실제 저장한 직접 라인 수량을 표시한다", () => {
    const draft = makeDraft({ bundles: [makeBundle({ source_kind: "manual", quantity: 1, lines: [makeLine({ quantity: 500, unit: "BOX" })] })] });
    render(<IoDraftWorkCard draft={draft} isBusy={false} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);
    expect(screen.getByText("500")).toBeVisible();
    expect(screen.getByText("BOX")).toBeVisible();
    expect(screen.queryByText(/총 1개/)).not.toBeInTheDocument();
  });
  it.each(["desktop", "mobile"] as const)("%s 내 작업은 첫 품목과 메모를 요약하고 펼치면 전체를 표시한다", (layout) => {
    const draft = makeDraft({ notes: "첫 줄 메모\n둘째 줄 메모\n셋째 줄 메모", bundles: [makeBundle(), makeBundle({ bundle_id: "second", title: "두번째 작업 품목", quantity: 7 })] });
    const actions = { onContinue: vi.fn(), onRequestDelete: vi.fn() };
    render(layout === "desktop" ? <IoDraftWorkTable drafts={[draft]} busyId={null} {...actions} /> : <IoDraftWorkCard draft={draft} isBusy={false} {...actions} />);
    expect(screen.queryByText("두번째 작업 품목")).not.toBeInTheDocument();
    expect(screen.getByText(/외 1개 품목/)).toBeVisible();
    expect(screen.getByLabelText("작업 메모")).toHaveClass("line-clamp-2");
    fireEvent.click(screen.getByRole("button", { name: layout === "desktop" ? "작업 상세 펼치기" : "자재 목록 펼치기" }));
    expect(screen.getByText("두번째 작업 품목")).toBeVisible();
    expect(screen.getAllByLabelText("작업 메모").some((memo) => !memo.classList.contains("line-clamp-2"))).toBe(true);
  });

  it("구형 내 작업도 대표 품목과 메모를 접고 펼친다", () => {
    const draft = { request_id: "legacy", request_type: "raw_receive", notes: "구형 메모\n둘째 줄", updated_at: "2026-10-23T00:00:00Z", lines: [
      { line_id: "first", item_name_snapshot: "첫 구형 품목", quantity: 2 },
      { line_id: "second", item_name_snapshot: "둘째 구형 품목", quantity: 3 },
    ] } as StockRequest;
    render(<DraftCartItemRow draft={draft} isBusy={false} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);
    expect(screen.queryByText("둘째 구형 품목")).not.toBeInTheDocument();
    expect(screen.getByText("외 1개 품목")).toBeVisible();
    expect(screen.getByLabelText("작업 메모")).toHaveClass("line-clamp-2");
    fireEvent.click(screen.getByRole("button", { name: "상세 펼치기" }));
    expect(screen.getByText("둘째 구형 품목")).toBeVisible();
    expect(screen.getByLabelText("작업 메모")).not.toHaveClass("line-clamp-2");
  });
  it("조사 중에는 이어하기만 잠그고 상세와 삭제는 유지한다", () => {
    const draft = makeDraft({ stocktake_pause: { token: "pause", round_id: "round", state: "blocked", paused_at: "now", pending_target_count: 1, missing_target_count: 1 } });
    render(<IoDraftWorkTable drafts={[draft]} busyId={null} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);
    expect(screen.getByText("조사 대상 확인 필요")).toBeVisible();
    expect(screen.getByRole("button", { name: "이어서 작업" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "작업 삭제" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /상세.*펼치기/ }));
    expect(screen.getByText("DX3000 POWER BUTTON")).toBeVisible();
  });
  it.each([
    ["receive", "receive_supplier", "창고", "원자재 입고"],
    ["receive", "outbound_supplier", "창고", "원자재 출고"],
    ["tube_material", "tube_receive_supplier", "튜브", "튜브 원자재 입고"],
    ["tube_material", "tube_outbound_supplier", "튜브", "튜브 원자재 출고"],
    ["process", "produce", "조립", "생산 입고"],
    ["process", "disassemble", "조립", "분해 출고"],
    ["internal_use", "internal_use_out", "AS", "AS 사용"],
    ["internal_use", "internal_use_out", "연구", "연구소 사용"],
  ] as const)("%s/%s 작업명도 완료 내역과 일치한다 (%s)", (workType, subType, department, label) => {
    render(<IoDraftWorkTable drafts={[makeDraft({ work_type: workType, sub_type: subType, to_department: department })]}
      busyId={null} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);
    expect(screen.getByText(label, { exact: true }).parentElement).toHaveClass("!w-40");
  });

  it.each([
    ["produce", false, "yellow"], ["disassemble", false, "yellow"],
    ["produce", true, "cyan"], ["disassemble", true, "red"],
  ] as const)("%s는 저장 예정의 실제 방향으로 색상을 구분한다 (mixed=%s)", (subType, mixed, tone) => {
    const draft = makeDraft({ sub_type: subType, effective_plan: { version: 1, fingerprint: "saved", effects: [{
      effect_id: "effect", operation_line_id: "line-2", bundle_id: "bundle-1", item_id: "item-2",
      item_name: "단독 입고", mes_code: "3-AR-0006", quantity: 2, unit: "EA",
      kind: "in", from: null, to: { bucket: "production", department: "조립" },
    }] } });
    if (mixed) draft.effective_plan!.effects.push({ ...draft.effective_plan!.effects[0], effect_id: "out", kind: "out", from: { bucket: "warehouse", department: null }, to: null });
    const { container } = render(<IoDraftWorkTable drafts={[draft]} busyId={null} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);
    expect(container.querySelector<HTMLElement>("tbody > tr > td:nth-child(3) > div > span")?.style.color).toBe(`var(--c-${tone})`);
    expect(draft.bundles[0].lines.map((line) => line.direction)).toEqual(["out", "in"]);
  });

  it.each([
    ["receive", "receive_supplier", "green", "arrow-down-to-line"],
    ["receive", "outbound_supplier", "red", "arrow-up-from-line"],
    ["tube_material", "tube_receive_supplier", "green", "arrow-down-to-line"],
    ["warehouse_io", "warehouse_to_dept", "blue", "arrow-right-left"],
    ["process", "produce", "cyan", "hammer"],
    ["process", "disassemble", "red", "wrench"],
    ["process", "adjust_in", "yellow", "sliders-vertical"],
    ["internal_use", "internal_use_out", "red", "arrow-up-from-line"],
  ] as const)("%s/%s 작업 배지는 내역의 %s 색상과 아이콘 기준을 따른다", (workType, subType, tone, icon) => {
    const { container } = render(<IoDraftWorkTable drafts={[makeDraft({ work_type: workType, sub_type: subType })]}
      busyId={null} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);
    const badge = container.querySelector<HTMLElement>("tbody > tr > td:nth-child(3) > div > span");
    expect(badge?.style.color).toBe(`var(--c-${tone})`);
    expect(badge?.querySelector("svg")).toHaveClass(`lucide-${icon}`);
  });

  it("접기와 펼치기 모두 같은 외부 스크롤 영역과 고정 머리글을 유지한다", () => {
    render(<IoDraftWorkTable drafts={[makeDraft()]} busyId={null} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);
    const viewport = screen.getByRole("region", { name: "작업 중 목록" });
    const table = viewport.querySelector("table")!;
    const columns = table.querySelector("colgroup")!.outerHTML;
    const header = table.querySelector("thead")!;
    expect(viewport).toHaveClass("sg", "absolute", "inset-y-0", "-right-2.5", "overflow-auto");
    expect(viewport.parentElement).toHaveClass("relative", "min-h-0", "flex-1");
    expect(header).toHaveClass("sticky", "top-0");
    expect(viewport.parentElement?.querySelector("[data-scrollbar-rail-frame]")).toHaveClass("inset-0", "pointer-events-none");
    fireEvent.click(screen.getByRole("button", { name: "작업 상세 펼치기" }));
    expect(viewport.querySelector("table")).toBe(table);
    expect(table.querySelector("colgroup")!.outerHTML).toBe(columns);
    expect(table.querySelector("thead")).toBe(header);
    fireEvent.click(screen.getByRole("button", { name: "작업 상세 접기" }));
    expect(viewport.querySelector("table")).toBe(table);
    expect(table.querySelector("colgroup")!.outerHTML).toBe(columns);
  });

  it("일반 작업의 상태 배지는 생략하고 반려와 예약 확인 안내만 표시한다", () => {
    const props = { busyId: null, onContinue: vi.fn(), onRequestDelete: vi.fn() };
    const view = render(<IoDraftWorkTable {...props} drafts={[makeDraft({ reservation_status: "inactive" })]} />);
    expect(screen.queryByText("작업 중")).not.toBeInTheDocument();
    expect(screen.queryByText("예약 해제")).not.toBeInTheDocument();
    view.rerender(<IoDraftWorkTable {...props} drafts={[makeDraft({ reservation_status: "reserved" })]} />);
    expect(screen.queryByText("작업 중")).not.toBeInTheDocument();
    view.rerender(<IoDraftWorkTable {...props} drafts={[makeDraft({ reservation_status: "inactive", reservation_issue: { code: "returned_after_rejection", message: "반려된 작업", shortages: [] } })]} />);
    expect(screen.getByText("반려됨")).toBeInTheDocument();
    view.rerender(<IoDraftWorkTable {...props} drafts={[makeDraft({ reservation_status: undefined })]} />);
    expect(screen.getByText("예약 상태 확인 필요")).toBeInTheDocument();
  });

  it("작업 열은 입출고 내역과 같은 한 줄 배지로 작업 이름과 아이콘을 표시한다", () => {
    render(<IoDraftWorkTable drafts={[makeDraft({ work_type: "warehouse_io", sub_type: "dept_to_warehouse" })]}
      busyId={null} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);
    const label = screen.getByText("창고 입출고");
    expect(label).toHaveClass("truncate");
    expect(label.parentElement).toHaveClass("h-6", "leading-none", "!w-40");
    expect(label.parentElement?.querySelector("svg")).toHaveClass("lucide-arrow-right-left");
    expect(screen.queryByText("부서 → 창고")).toBeNull();
  });

  it("shows a collapsed inventory-change summary and reveals the BOM rows on demand", () => {
    render(
      <IoDraftWorkTable
        drafts={[makeDraft()]}
        busyId={null}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    for (const label of ["상세", "작업 시작", "작업", "대상", "품목코드", "예정 변동"]) {
      expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("columnheader", { name: "수량", exact: true })).not.toBeInTheDocument();
    const target = screen.getByText("DX3000 분해 대상");
    expect(screen.getByText("1 EA").closest("td")).toBe(target.closest("td"));
    const startedAt = screen.getByText("08/04 09:05");
    const toggle = screen.getByRole("button", { name: "작업 상세 펼치기" });
    expect(startedAt).toHaveClass("whitespace-nowrap");
    expect(startedAt.closest("td")).not.toBe(toggle.closest("td"));
    expect(screen.queryByText("출고 · BOM")).not.toBeInTheDocument();
    expect(screen.getByText("감소 1종")).toBeInTheDocument();
    expect(screen.getByText("증가 1종")).toBeInTheDocument();
    expect(screen.queryByText("DX3000 POWER BUTTON")).not.toBeInTheDocument();

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("출고 예약")).toBeInTheDocument();
    expect(screen.getByText("DX3000 POWER BUTTON")).toBeInTheDocument();
    expect(screen.getByText("입고 예약")).toBeInTheDocument();
    expect(screen.getByText("+2 EA")).toBeInTheDocument();
    const child = screen.getByText("DX3000 POWER BUTTON").closest("tr")!;
    expect(within(child).queryByText("2 EA", { exact: true })).not.toBeInTheDocument();
    expect(within(child).getByText("+2 EA")).toBeVisible();
    const bundle = screen.getAllByText("DX3000 분해 대상").at(-1)!.closest("tr")!;
    expect(within(bundle.cells[2]).getByText("출고 예약")).toBeVisible();
    expect(screen.queryByText("BOM", { exact: true })).not.toBeInTheDocument();
    expect(within(bundle).queryByText("1 EA", { exact: true })).not.toBeInTheDocument();
    expect(within(bundle).getByText("−1 EA")).toBeVisible();
  });

  it("shows a custom disassemble BOM as parent unchanged and selected children outbound", () => {
    const draft = makeDraft({
      bundles: [makeBundle({
        title: "SOLO 18cm CONE ASS'Y",
        lines: [
          makeLine({ item_name: "SOLO 18cm CONE ASS'Y" }),
          makeLine({
            line_id: "line-excluded-child",
            item_id: "item-excluded-child",
            item_name: "SOLO 연장 CONE",
            mes_code: "8-AR-0272",
            direction: "in",
            from_bucket: "none",
            from_department: null,
            to_bucket: "production",
            to_department: "조립",
            quantity: 0,
            bom_expected: 1,
            included: false,
            edited: true,
            origin: "bom_auto",
          }),
          makeLine({
            line_id: "line-selected-child",
            item_id: "item-selected-child",
            item_name: "SOLO MAIN CONE",
            mes_code: "8-AR-0273",
            direction: "in",
            from_bucket: "none",
            from_department: null,
            to_bucket: "production",
            to_department: "조립",
            quantity: 1,
            bom_expected: 1,
            origin: "bom_auto",
          }),
        ],
      })],
    });

    render(
      <IoDraftWorkTable
        drafts={[draft]}
        busyId={null}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("감소 1종")).toBeInTheDocument();
    expect(screen.queryByText(/증가 \d+종/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "작업 상세 펼치기" }));
    const parentRow = screen.getAllByText("SOLO 18cm CONE ASS'Y").at(-1)?.closest("tr");
    const selectedChildRow = screen.getByText("SOLO MAIN CONE").closest("tr");
    expect(parentRow).toHaveTextContent("상위 미반영");
    expect(parentRow).toHaveTextContent("변동 없음");
    expect(selectedChildRow).toHaveTextContent("출고 예약");
    expect(selectedChildRow).toHaveTextContent("−1 EA");
  });

  it("opens only one draft at a time with keyboard row controls", () => {
    const secondDraft = makeDraft({
      batch_id: "batch-2",
      bundles: [makeBundle({
        bundle_id: "bundle-2",
        title: "DX4000 분해 대상",
        source_item_id: "item-3",
        source_mes_code: "3-AA-4000",
        lines: [
          makeLine({ line_id: "line-3", item_id: "item-3", item_name: "DX4000 분해 대상", mes_code: "3-AA-4000" }),
          makeLine({
            line_id: "line-4",
            item_id: "item-4",
            item_name: "DX4000 회수품",
            mes_code: "3-AR-4000",
            direction: "in",
            from_bucket: "none",
            from_department: null,
            to_bucket: "production",
            to_department: "조립",
            origin: "bom_auto",
          }),
        ],
      })],
    });
    render(
      <IoDraftWorkTable
        drafts={[makeDraft(), secondDraft]}
        busyId={null}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const firstRow = screen.getByText("DX3000 분해 대상").closest("tr")!;
    const secondRow = screen.getByText("DX4000 분해 대상").closest("tr")!;
    expect(firstRow).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(firstRow, { key: "Enter" });
    expect(screen.getByText("DX3000 POWER BUTTON")).toBeInTheDocument();

    fireEvent.keyDown(secondRow, { key: " " });
    expect(screen.queryByText("DX3000 POWER BUTTON")).not.toBeInTheDocument();
    expect(screen.getByText("DX4000 회수품")).toBeInTheDocument();
  });

  it("keeps row expansion separate from continue and delete actions", () => {
    const onContinue = vi.fn();
    const onRequestDelete = vi.fn();
    const { rerender } = render(
      <IoDraftWorkTable
        drafts={[makeDraft()]}
        busyId={null}
        onContinue={onContinue}
        onRequestDelete={onRequestDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
    fireEvent.click(screen.getByRole("button", { name: "작업 삭제" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onRequestDelete).toHaveBeenCalledOnce();
    expect(screen.queryByText("DX3000 POWER BUTTON")).not.toBeInTheDocument();

    rerender(
      <IoDraftWorkTable
        drafts={[makeDraft()]}
        busyId="batch-1"
        onContinue={onContinue}
        onRequestDelete={onRequestDelete}
      />,
    );
    expect(screen.getByRole("button", { name: "이어서 작업" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "작업 삭제" })).toBeDisabled();
  });

  it("excludes non-effective lines from the summary and labels move and shortage states", () => {
    const draft = makeDraft({
      sub_type: "warehouse_to_dept",
      bundles: [makeBundle({
        lines: [
          makeLine({ shortage: 1 }),
          makeLine({
            line_id: "line-move",
            item_id: "item-move",
            item_name: "이동 품목",
            direction: "move",
            from_bucket: "warehouse",
            to_bucket: "production",
            to_department: "조립",
            origin: "bom_auto",
            quantity: 3,
          }),
          makeLine({
            line_id: "line-excluded",
            item_id: "item-excluded",
            item_name: "제외 품목",
            direction: "in",
            from_bucket: "none",
            to_bucket: "production",
            included: false,
            origin: "bom_auto",
            quantity: 4,
          }),
        ],
      })],
    });
    render(
      <IoDraftWorkTable
        drafts={[draft]}
        busyId={null}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("감소 1종")).toBeInTheDocument();
    expect(screen.getByText("이동 1종")).toBeInTheDocument();
    expect(screen.queryByText(/증가 \d+종/)).not.toBeInTheDocument();
    expect(screen.getByText("부족 1종")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "작업 상세 펼치기" }));
    expect(screen.getByText("3 EA 이동")).toBeInTheDocument();
    const moving = screen.getByText("이동 품목").closest("tr")!;
    expect(within(moving).getByText("이동 예약")).toBeVisible();
    expect(screen.getByText("제외 품목")).toHaveStyle({ textDecoration: "line-through" });
    expect(within(screen.getByText("제외 품목").closest("tr")!).queryByText(/입고 예약|출고 예약|이동 예약/)).not.toBeInTheDocument();
    expect(screen.getByText("변동 없음")).toBeInTheDocument();
  });
});
