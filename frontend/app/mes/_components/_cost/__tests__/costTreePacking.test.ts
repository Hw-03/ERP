import { expect, it } from "vitest";
import type { CostNode } from "@/lib/api/types/cost";
import { indexCostTree, initialCostBranches } from "../costTreeModel";
import { layoutCostTree } from "../costTreeLayout";
const node = (id: string, children: CostNode[] = []): CostNode => ({ item_id: id, mes_code: id, item_name: id, quantity_per_parent: "1", required_quantity: "1", material_cost: "1", own_labor_cost: "0", labor_cost: "0", unit_cost: "1", amount: "1", status: "complete", issues: [], children });
const build = (root: CostNode) => { const index = indexCostTree(root); return layoutCostTree(index, initialCostBranches(index, "root"), "root"); };
it("깊이가 다른 독립 AA를 같은 행에 둔다", () => {
  const layout = build(node("3-PF-1", [node("3-AA-1"), node("3-NF-1", [node("3-AA-2")])]));
  expect(layout.bands.find(b => b.code === "AA")!.rows.map(r => r.flatMap(u => u.entries.map(e => e.node.mes_code)))).toEqual([["3-AA-1", "3-AA-2"]]);
});
it("반복 자재와 많은 자재를 부모 경로별로 모두 표시한다", () => {
  const root = node("3-AF-1", [node("3-AA-1", Array.from({length:20}, (_,i)=>node(`3-AR-${i}`))),node("3-AA-2",[node("3-AR-0")])]);
  const layout = build(root), groups = layout.bands.find(b=>b.code==="AR")!.rows.flat();
  expect(groups.map(g=>g.entries.length)).toEqual([20,1]);
  expect(groups.every(g=>g.material && g.entries.every(e=>e.parent===g.parent!.path))).toBe(true);
  expect(new Set(layout.bands.flatMap(b=>b.rows.flatMap(r=>r.flatMap(u=>u.entries.map(e=>e.path)))))).toEqual(new Set(indexCostTree(root).keys()));
});
it("작은 독립 공정을 함께 배치하되 상하 관계는 분리한다", () => {
  const independent = build(node("3-PF-1", [node("3-AF-1"),node("3-AA-1"),node("3-AR-1")]));
  expect(independent.departments.find(d=>d.name==="조립")!.rows.map(r=>r.map(b=>b.code))).toEqual([["AF","AA","AR"]]);
  const related = build(node("3-AF-1",[node("3-AA-1",[node("3-AR-1")])]));
  expect(related.departments[0].rows.map(r=>r.map(b=>b.code))).toEqual([["AF","AA"],["AR"]]);
});
it("조립 외 부서는 부모·자식 F/A를 합계 5개까지 한 줄에 놓고 자재는 아래에 둔다", () => {
  for (const process of ["P", "N", "V", "H", "T"]) {
    const root = node(`3-${process}F-1`, [node(`3-${process}A-1`, [node(`3-${process}A-2`, [node(`3-${process}R-1`)])]), node(`3-${process}A-3`), node(`3-${process}A-4`)]);
    const layout = build(root), department = layout.departments[0];
    expect(department.rows.map(row => row.map(band => band.code))).toEqual([[`${process}F`, `${process}A`], [`${process}R`]]);
    expect(department.rows[0].flatMap(band => band.rows).map(row => row.length)).toEqual([1, 4]);
    expect(new Set(layout.bands.flatMap(band => band.rows.flatMap(row => row.flatMap(unit => unit.entries.map(entry => entry.path)))))).toEqual(new Set(indexCostTree(root).keys()));
  }
});
it("출하는 F/A 합계가 5개를 넘으면 기존처럼 행을 나눈다", () => {
  const layout = build(node("3-PF-1", Array.from({ length: 5 }, (_, i) => node(`3-PA-${i}`))));
  expect(layout.departments[0].rows.map(row => row.map(band => band.code))).toEqual([["PF"], ["PA"]]);
});
it("튜닝·진공·고압·튜브 F/A는 개수와 관계없이 한 줄이며 원자재는 아래에 둔다", () => {
  for (const process of ["N", "V", "H", "T"]) {
    const root = node(`3-${process}F-1`, Array.from({ length: 6 }, (_, i) => node(`3-${process}A-${i}`, [node(`3-${process}R-${i}`)])));
    const layout = build(root), department = layout.departments[0];
    expect(department.rows.map(row => row.map(band => band.code))).toEqual([[`${process}F`, `${process}A`], [`${process}R`]]);
    expect(department.rows[0].flatMap(band => band.rows).map(row => row.length)).toEqual([1, 6]);
    expect(new Set(layout.bands.flatMap(band => band.rows.flatMap(row => row.flatMap(unit => unit.entries.map(entry => entry.path)))))).toEqual(new Set(indexCostTree(root).keys()));
    const independent = build(node("3-PF-1", [node(`3-${process}F-1`), node(`3-${process}R-1`)]));
    expect(independent.departments[1].rows.map(row => row.map(band => band.code))).toEqual([[`${process}F`], [`${process}R`]]);
  }
});
it("조립은 AF 직계를 먼저 놓고 AA별 자재도 위쪽 부모 카드 순서로 정렬한다", () => {
  const root = node("7-PF-1", [node("7-PA-1", [
    node("7-AA-pack", [node("7-AR-pack")]),
    node("7-AF-1", [
      node("7-AA-first", [node("7-AA-nested", [node("7-AR-nested")]), node("7-AR-first")]),
      node("7-AA-second", [node("7-AR-second")]),
      node("7-AR-direct-1"), node("7-AR-direct-2"),
    ]),
  ])]);
  const layout = build(root);
  expect(layout.bands.find(band => band.code === "AA")!.rows.map(row => row.map(unit => unit.entries[0].node.mes_code)))
    .toEqual([["7-AA-first", "7-AA-nested", "7-AA-second", "7-AA-pack"]]);
  const groups = layout.bands.find(band => band.code === "AR")!.rows.flat();
  expect(groups.map(group => group.parent!.node.mes_code)).toEqual(["7-AF-1", "7-AA-first", "7-AA-nested", "7-AA-second", "7-AA-pack"]);
  const aa=layout.bands.find(band=>band.code==="AA")!;
  expect(aa.rows).toHaveLength(1);
  expect(aa.rows[0][1].entries[0].parent).toBe(aa.rows[0][0].entries[0].path);
  expect(groups[0].entries.map(entry => entry.node.mes_code)).toEqual(["7-AR-direct-1", "7-AR-direct-2"]);
  expect(new Set(layout.bands.flatMap(band => band.rows.flatMap(row => row.flatMap(unit => unit.entries.map(entry => entry.path)))))).toEqual(new Set(indexCostTree(root).keys()));
});
it("튜닝·진공·고압·튜브를 하나의 가로 영역으로 합치고 합산 폭을 확보한다", () => {
  const root = node("3-PF-1", [node("3-AF-1", [
    ...["N", "V", "H", "T"].map(process => node(`3-${process}F-1`, [node(`3-${process}A-1`, [node(`3-${process}R-1`)])])),
  ])]);
  const layout = build(root);
  expect(layout.strips.map(strip => strip.map(department => department.name))).toEqual([["출하"], ["조립"], ["튜닝", "진공", "고압", "튜브"]]);
  const processWidth = layout.departments.slice(2).reduce((sum, department) => sum + Math.max(...department.rows.map(row => row.reduce((width, band) => width + band.width, 0) + (row.length - 1) * 32)), 0);
  expect(layout.width).toBeGreaterThanOrEqual(layout.gutter + processWidth + 3 * 32 + 24);
});
