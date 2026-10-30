import { describe, expect, it } from "vitest";
import type { CostNode } from "@/lib/api/types/cost";
import { indexCostTree, initialCostBranches, type BranchState } from "../costTreeModel";
import { layoutCostTree, TREE_CARD_WIDTH, TREE_COLUMNS, TREE_GAP, type CostProcessLayout } from "../costTreeLayout";

const node = (id: string, children: CostNode[] = []): CostNode => ({
  item_id: id, mes_code: id, item_name: id, quantity_per_parent: "1", required_quantity: "1",
  material_cost: "1", own_labor_cost: "0", labor_cost: "0", unit_cost: "1", amount: "1", status: "complete", issues: [], children,
});
function paths(layout: CostProcessLayout): string[] {
  return layout.bands.flatMap(band => band.rows.flatMap(row => row.flatMap(unit => unit.entries.map(entry => entry.path))));
}
function openAll(root: CostNode): { index: ReturnType<typeof indexCostTree>; state: BranchState } {
  const index = indexCostTree(root), all = new Set(index.keys());
  return { index, state: { expanded: all, revealed: all } };
}

describe("BOM 공정별 가로 배치", () => {
  it.each([[8,1],[9,2],[16,2],[17,3],[30,3]])("자재 %i개는 폭과 무관하게 %i열을 예약한다", (count,columns) => {
    const {index,state}=openAll(node("3-AF-1",[node("3-AA-1",Array.from({length:count},(_,i)=>node(`3-AR-${i}`)))]));
    const narrow=layoutCostTree(index,state,"root",800),wide=layoutCostTree(index,state,"root",1900);
    const group=narrow.bands.find(b=>b.code==="AR")!.rows[0][0];
    expect(group.columns?.length??1).toBe(columns);
    expect(group.columns?.flat()??group.entries).toEqual(group.entries);
    expect(narrow).toEqual(wide);
  });
  it("부모 깊이와 무관하게 화면 전체를 부서·F/A/R 순서로 정렬한다", () => {
    const root = node("3-PF-0001", [node("3-NF-0001", [node("3-AA-0001", [node("3-AR-0001")]), node("3-VF-0001", [node("3-HF-0001", [node("3-TF-0001")])])]), node("3-PR-0001"), node("3-PA-0001"), node("3-AF-0001")]);
    const before = JSON.stringify(root), { index, state } = openAll(root);
    const layout = layoutCostTree(index, state, "root");
    expect(layout.bands.map(band => band.code)).toEqual(["PF", "PA", "PR", "AF", "AA", "AR", "NF", "VF", "HF", "TF"]);
    expect(paths(layout).sort()).toEqual([...index.keys()].sort());
    expect(JSON.stringify(root)).toBe(before);
  });

  it("조립은 5개 제한 없이 조립품과 부모별 자재 목록을 한 줄에 배치한다", () => {
    const root = node("3-AF-0001", Array.from({ length: 12 }, (_, i) => node(`3-AA-${i}`, [node(`3-AR-${i}`)])));
    const { index, state } = openAll(root), layout = layoutCostTree(index, state, "root");
    expect(TREE_COLUMNS).toBe(5);
    expect(layout.bands.find(band => band.code === "AA")!.rows.map(row => row.length)).toEqual([12]);
    expect(layout.bands.find(band => band.code === "AR")!.rows.map(row => row.length)).toEqual([12]);
    expect(layout.width).toBeGreaterThanOrEqual(12 * TREE_CARD_WIDTH + 11 * TREE_GAP);
    expect(new Set(paths(layout))).toEqual(new Set(index.keys()));
  });

  it("출하 공정과 조립 외 원자재 목록은 기존처럼 한 줄 최대 5개를 유지한다", () => {
    const root = node("3-PF-0001", Array.from({ length: 12 }, (_, i) => node(`3-PA-${i}`, [node(`3-PR-${i}`)])));
    const { index, state } = openAll(root), layout = layoutCostTree(index, state, "root");
    expect(layout.bands.find(band => band.code === "PA")!.rows.map(row => row.length)).toEqual([5, 5, 2]);
    expect(layout.bands.find(band => band.code === "PR")!.rows.map(row => row.length)).toEqual([5, 5, 2]);
  });

  it("중첩 AA는 부모 바로 옆으로 배치하며 실제 부모와 반복 품목 경로를 보존한다", () => {
    const root = node("3-AF-0001", [node("3-AA-0009", [node("3-AA-0002", [node("shared")])]), node("3-AA-0001", [node("shared")])]);
    const { index, state } = openAll(root), layout = layoutCostTree(index, state, "root");
    expect(layout.bands.find(band => band.code === "AA")!.rows.map(row => row.map(unit => unit.entries[0].node.mes_code)))
      .toEqual([["3-AA-0009", "3-AA-0002", "3-AA-0001"]]);
    expect(new Set(paths(layout))).toEqual(new Set(index.keys()));
    expect(paths(layout).filter(path => path.endsWith(":shared"))).toHaveLength(2);
  });

  it("전체 자재를 기본으로 표시하고 접힌 가지는 원본 경로대로 숨긴다", () => {
    const root = node("3-AF-0001", [node("3-AA-0001", Array.from({ length: 9 }, (_, i) => node(`3-AR-${i}`)))]);
    const index = indexCostTree(root), state = initialCostBranches(index, "root");
    const preview = layoutCostTree(index, state, "root");
    expect(paths(preview)).toHaveLength(11);
    expect(preview.bands.find(band => band.code === "AR")!.rows[0][0]).toMatchObject({ parent: { path: "root/0:3-AA-0001" }, material: true });
    expect(paths(layoutCostTree(index, state, "root"))).toHaveLength(11);
    state.expanded.delete("root/0:3-AA-0001");
    expect(paths(layoutCostTree(index, state, "root"))).toEqual(["root", "root/0:3-AA-0001"]);
  });

  it("깊은 집중 탐색에서도 원래 깊이·금액과 모든 경로를 유지한다", () => {
    let root = node("3-TR-0001");
    for (let i = 9; i >= 0; i--) root = node(`3-TA-${i}`, [root]);
    const { index, state } = openAll(root), all = layoutCostTree(index, state, "root");
    expect(new Set(paths(all))).toEqual(new Set(index.keys()));
    const focused = layoutCostTree(index, state, "root/0:3-TA-1");
    expect(focused.bands[0].rows[0][0].entries[0].depth).toBe(1);
    expect(paths(focused)).toHaveLength(10);
    expect(focused.bands.every(band => band.rows.every(row => new Set(row.map(unit => unit.rank)).size === 1))).toBe(true);
  });

  it("미분류 코드는 마지막에 두고 단독 말단 루트도 표시한다", () => {
    const root = node("3-AF-0001", [node("unknown"), node("3-NR-0001")]);
    const { index, state } = openAll(root);
    expect(layoutCostTree(index, state, "root").bands.map(band => band.code)).toEqual(["AF", "NR", ""]);
    const leaf = node("3-AR-0001"), leafIndex = indexCostTree(leaf);
    expect(paths(layoutCostTree(leafIndex, initialCostBranches(leafIndex, "root"), "root"))).toEqual(["root"]);
  });
});
