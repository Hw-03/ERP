/**
 * useIoPreselect 단위 테스트.
 *
 * IoComposeView 에서 추출한 preselectedItem 자동 적용 hook 의 분기 검증.
 * - 일반 품목 → addItem 호출 + highlight clear
 * - BOM 부모 → addItem 호출 X + setHighlightItemId 호출
 * - workType 변경 시 재적용 (handled key 에 workType 포함)
 * - process workType + 방향 미선택 → 보류
 * - bomParentsLoaded=false 인 동안 보류 (S1 race 결함 가드)
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIoPreselect } from "../useIoPreselect";
import type { Item, IoWorkType } from "@/lib/api";

function makeItem(item_id = "ITEM-001"): Item {
  return {
    item_id,
    item_code: "C-001",
    item_name: "테스트 부품",
    unit: "EA",
    warehouse_qty: 0,
    pending_quantity: 0,
    locations: [],
  } as unknown as Item;
}

type Args = Parameters<typeof useIoPreselect>[0];
const defaults: Args = {
  preselectedItem: null,
  bomParents: new Set<string>(),
  bomParentsLoaded: true,
  workType: "receive" as IoWorkType,
  deptIoDirection: null,
  addItem: vi.fn(),
  setHighlightItemId: vi.fn(),
};

describe("useIoPreselect", () => {
  it("일반 품목이면 addItem 자동 호출 + 하이라이트 clear", () => {
    const addItem = vi.fn();
    const setHighlightItemId = vi.fn();
    const item = makeItem();
    renderHook(() =>
      useIoPreselect({
        ...defaults,
        preselectedItem: item,
        addItem,
        setHighlightItemId,
      }),
    );

    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith(item);
    expect(setHighlightItemId).toHaveBeenCalledWith(null);
  });

  it("BOM 부모면 addItem 호출 안 함, 하이라이트만 set", () => {
    const addItem = vi.fn();
    const setHighlightItemId = vi.fn();
    const item = makeItem("PARENT-1");
    renderHook(() =>
      useIoPreselect({
        ...defaults,
        preselectedItem: item,
        bomParents: new Set(["PARENT-1"]),
        addItem,
        setHighlightItemId,
      }),
    );

    expect(addItem).not.toHaveBeenCalled();
    expect(setHighlightItemId).toHaveBeenCalledWith("PARENT-1");
  });

  it("bomParentsLoaded=false 인 동안에는 어떤 분기도 실행하지 않음 (S1 race 가드)", () => {
    const addItem = vi.fn();
    const setHighlightItemId = vi.fn();
    const item = makeItem("PARENT-1");
    // 빈 set + loaded=false → 부모인지 판정 불가, 보류해야 한다.
    const { rerender } = renderHook(
      (args: Args) => useIoPreselect(args),
      {
        initialProps: {
          ...defaults,
          preselectedItem: item,
          bomParents: new Set<string>(),
          bomParentsLoaded: false,
          addItem,
          setHighlightItemId,
        },
      },
    );

    expect(addItem).not.toHaveBeenCalled();
    expect(setHighlightItemId).not.toHaveBeenCalled();

    // BOM 로딩이 끝나면 부모로 인식 → 하이라이트만
    rerender({
      ...defaults,
      preselectedItem: item,
      bomParents: new Set(["PARENT-1"]),
      bomParentsLoaded: true,
      addItem,
      setHighlightItemId,
    });
    expect(addItem).not.toHaveBeenCalled();
    expect(setHighlightItemId).toHaveBeenCalledWith("PARENT-1");
  });

  it("process workType + 방향 미선택이면 자동 적용 보류", () => {
    const addItem = vi.fn();
    const setHighlightItemId = vi.fn();
    renderHook(() =>
      useIoPreselect({
        ...defaults,
        preselectedItem: makeItem(),
        workType: "process" as IoWorkType,
        deptIoDirection: null,
        addItem,
        setHighlightItemId,
      }),
    );

    expect(addItem).not.toHaveBeenCalled();
    expect(setHighlightItemId).not.toHaveBeenCalled();
  });

  it("workType 변경 시 같은 품목이라도 재적용 (handled key 에 workType 포함)", () => {
    const addItem = vi.fn();
    const setHighlightItemId = vi.fn();
    const item = makeItem();

    const { rerender } = renderHook(
      (args: Args) => useIoPreselect(args),
      {
        initialProps: {
          ...defaults,
          preselectedItem: item,
          workType: "receive" as IoWorkType,
          addItem,
          setHighlightItemId,
        },
      },
    );
    expect(addItem).toHaveBeenCalledTimes(1);

    // 동일 workType 재렌더 → 재적용 안 함
    rerender({
      ...defaults,
      preselectedItem: item,
      workType: "receive" as IoWorkType,
      addItem,
      setHighlightItemId,
    });
    expect(addItem).toHaveBeenCalledTimes(1);

    // workType 변경 (warehouse_io) → 재적용
    rerender({
      ...defaults,
      preselectedItem: item,
      workType: "warehouse_io" as IoWorkType,
      addItem,
      setHighlightItemId,
    });
    expect(addItem).toHaveBeenCalledTimes(2);
  });

  it("preselectedItem 이 null 이면 아무 분기도 실행 안 함", () => {
    const addItem = vi.fn();
    const setHighlightItemId = vi.fn();
    renderHook(() =>
      useIoPreselect({
        ...defaults,
        preselectedItem: null,
        addItem,
        setHighlightItemId,
      }),
    );
    expect(addItem).not.toHaveBeenCalled();
    expect(setHighlightItemId).not.toHaveBeenCalled();
  });

  it("process workType + 방향 선택됨 + 일반 품목 → addItem 호출", () => {
    const addItem = vi.fn();
    const item = makeItem();
    renderHook(() =>
      useIoPreselect({
        ...defaults,
        preselectedItem: item,
        workType: "process" as IoWorkType,
        deptIoDirection: "in",
        addItem,
      }),
    );
    expect(addItem).toHaveBeenCalledWith(item);
  });
});
