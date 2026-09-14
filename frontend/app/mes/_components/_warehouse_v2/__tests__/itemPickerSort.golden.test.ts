/**
 * 골든 테스트 — sortItemsForPicker 의 4단계 정렬을 고정한다.
 *
 * IoTargetPicker/DefectItemPicker 에 인라인 복제돼 있던 정렬을 itemPickerShared 의
 * 순수함수로 추출(동작 보존)했다. 이 테스트가 그 동작을 고정해 회귀를 막는다.
 *
 * 정렬 우선순위(작을수록 상위):
 *   1) rank        = 직원 개인 순서(employeeOrderRank), 미지정 = +Infinity
 *   2) priority    = 부서 순서(deptPriorityByLetter), letter 없음/미지정 = 999
 *   3) assemblyRank= 조립(letter "A") 그룹 내 담당 모델 우선순위, 공통이면 최소값, 그 외 +Infinity
 *   4) idx         = 원본 배열 인덱스(동률 시 서버 정렬 안정 유지)
 */
import { describe, it, expect } from "vitest";
import type { Item } from "@/lib/api";
import { sortItemsForPicker } from "../itemPickerShared";

function makeItem(
  item_id: string,
  process_type_code: string | null,
  model_slots: number[] = [],
): Item {
  return {
    item_id,
    item_name: item_id,
    unit: "EA",
    quantity: 0,
    warehouse_qty: 0,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 0,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    mes_code: null,
    model_symbol: null,
    model_slots,
    process_type_code,
    serial_no: null,
    bom_completed_at: null,
    deleted_at: null,
    created_at: "",
    updated_at: "",
    department: null,
  };
}

const ids = (items: Item[]) => items.map((i) => i.item_id);

describe("[골든] sortItemsForPicker — 4단계 정렬", () => {
  it("1) 직원 개인 순서(rank)가 최우선 — 미지정은 맨 뒤", () => {
    const items = [
      makeItem("x", "TR"),
      makeItem("y", "TR"),
      makeItem("z", "TR"),
    ];
    const employeeOrderRank = new Map([
      ["z", 0],
      ["x", 1],
    ]);
    const out = sortItemsForPicker(items, new Map(), new Map(), employeeOrderRank);
    // z(0) < x(1) < y(Infinity)
    expect(ids(out)).toEqual(["z", "x", "y"]);
  });

  it("2) rank 동률 시 부서 우선순위(priority) — letter 없음은 999로 뒤", () => {
    const items = [
      makeItem("i1", "TR"), // T → 1
      makeItem("i2", "AA"), // A → 0
      makeItem("i3", "PF"), // P → 2
      makeItem("i4", "XX"), // deptOf("X")=null → 999
    ];
    const deptPriorityByLetter = new Map([
      ["A", 0],
      ["T", 1],
      ["P", 2],
    ]);
    const out = sortItemsForPicker(items, deptPriorityByLetter, new Map(), new Map());
    expect(ids(out)).toEqual(["i2", "i1", "i3", "i4"]);
  });

  it("3) 조립(A) 그룹 내 assemblyRank — 공통 모델이면 최소 slot 우선, 동률은 idx", () => {
    const items = [
      makeItem("a1", "AA", [7]), // slot7 → 1
      makeItem("a2", "AA", [5]), // slot5 → 0
      makeItem("a3", "AA", [9]), // 매칭 없음 → Infinity
      makeItem("a4", "AA", [7, 5]), // min(1,0) → 0
    ];
    const deptPriorityByLetter = new Map([["A", 0]]);
    const assignedPriorityBySlot = new Map([
      [5, 0],
      [7, 1],
    ]);
    const out = sortItemsForPicker(items, deptPriorityByLetter, assignedPriorityBySlot, new Map());
    // ar0: a2(idx1) < a4(idx3); ar1: a1(idx0); ar∞: a3(idx2)
    expect(ids(out)).toEqual(["a2", "a4", "a1", "a3"]);
  });

  it("4) assemblyRank 는 A 그룹에만 적용 — 비A는 slot 매칭돼도 무시", () => {
    const items = [
      makeItem("t1", "TR", [5]), // letter T → assemblyRank 미적용(Infinity)
      makeItem("t2", "TR", []),
    ];
    const deptPriorityByLetter = new Map([["T", 0]]);
    const assignedPriorityBySlot = new Map([[5, 0]]);
    const out = sortItemsForPicker(items, deptPriorityByLetter, assignedPriorityBySlot, new Map());
    // 둘 다 priority 0, assemblyRank Infinity → idx 순서 유지
    expect(ids(out)).toEqual(["t1", "t2"]);
  });

  it("5) 맵이 모두 비면 원본 배열 순서를 안정적으로 유지", () => {
    const items = [makeItem("m1", "TR"), makeItem("m2", "AA"), makeItem("m3", "PF")];
    const out = sortItemsForPicker(items, new Map(), new Map(), new Map());
    expect(ids(out)).toEqual(["m1", "m2", "m3"]);
  });

  it("우선순위 계층: rank가 priority/assemblyRank를 압도한다", () => {
    const items = [
      makeItem("hi", "PF"), // priority 높음(2)이지만 rank 0
      makeItem("lo", "AA", [5]), // priority 0 + assemblyRank 0 이지만 rank 미지정
    ];
    const deptPriorityByLetter = new Map([
      ["A", 0],
      ["P", 2],
    ]);
    const assignedPriorityBySlot = new Map([[5, 0]]);
    const employeeOrderRank = new Map([["hi", 0]]);
    const out = sortItemsForPicker(items, deptPriorityByLetter, assignedPriorityBySlot, employeeOrderRank);
    expect(ids(out)).toEqual(["hi", "lo"]);
  });
});
