import { describe, expect, it } from "vitest";
import type { AdjLineTemplate } from "@/lib/api/types/dept-adjustment";
import { toServerDecision, validateDecisionTree } from "../../../_defect_hub/DisassembleTree";
import { allocateNormal, effectiveRows, fromTemplate, getNode, hasChanges, setPart, updateNode } from "../mobileReworkModel";

function node(id: string, qty = 10) {
  return fromTemplate({ item_id: id, item_name: id, mes_code: `CODE-${id}`, quantity: qty, unit: "EA", department: "고압", has_children: true, bom_auto_token: `token-${id}` } as AdjLineTemplate);
}

describe("mobile rework decisions", () => {
  it("starts all normal and keeps the template's unit, receiving department and token", () => {
    expect(node("part")).toMatchObject({ normal_qty: 10, defective_qty: 0, scrap_qty: 0, unit: "EA", department: "고압", bom_auto_token: "token-part" });
  });

  it("clamps mixed quantities with the existing quarantine-first rule", () => {
    const mixed = setPart(setPart(node("part"), "defective_qty", 6), "scrap_qty", 8);
    expect(mixed).toMatchObject({ normal_qty: 0, defective_qty: 6, scrap_qty: 4, keep_qty: 0, manuallySet: true });
    expect(setPart(mixed, "defective_qty", -10)).toMatchObject({ normal_qty: 6, defective_qty: 0, scrap_qty: 4 });
    expect(setPart(mixed, "scrap_qty", NaN).scrap_qty).toBe(0);
    expect(validateDecisionTree([mixed])).toBe(true);
  });

  it("keeps per-path inputs separate when the same item occurs twice", () => {
    const roots = [{ ...node("assembly"), children: [node("repeat"), node("repeat")] }, node("repeat")];
    const next = updateNode(roots, [0, 1], (item) => setPart(item, "scrap_qty", 3));
    expect(getNode(next, [0, 1])?.scrap_qty).toBe(3);
    expect(getNode(next, [0, 0])?.scrap_qty).toBe(0);
    expect(getNode(next, [1])?.scrap_qty).toBe(0);
    expect(getNode(roots, [0, 1])?.scrap_qty).toBe(0);
  });

  it("applies basic allocation recursively without overwriting a manually edited item", () => {
    const manual = { ...setPart(node("manual"), "scrap_qty", 3), reason_memo: "표면 손상" };
    const roots = [{ ...node("assembly"), children: [node("auto", 3), manual] }];
    const next = allocateNormal(roots, 1, 2);
    expect(next[0]).toMatchObject({ normal_qty: 5, defective_qty: 5 });
    expect(next[0].children?.[0]).toMatchObject({ normal_qty: 2, defective_qty: 1 });
    expect(next[0].children?.[1]).toEqual(manual);
  });

  it("reviews exactly the active server leaves, retaining separate paths and units", () => {
    const roots = [
      { ...node("split"), nodeMode: "split" as const, children: [node("repeat", 2), { ...node("wire", 1.5), unit: "M" }] },
      { ...node("whole"), nodeMode: "whole" as const, children: [setPart(node("hidden"), "scrap_qty", 10)] },
      node("repeat", 3),
    ];
    const rows = effectiveRows(roots);
    expect(rows.map((row) => [row.path.join("/"), row.node.item_id, row.node.qty, row.node.unit])).toEqual([
      ["0/0", "repeat", 2, "EA"], ["0/1", "wire", 1.5, "M"], ["1", "whole", 10, "EA"], ["2", "repeat", 3, "EA"],
    ]);
    const flatten = (items: Record<string, unknown>[]): Record<string, unknown>[] => items.flatMap((item) => item.children ? flatten(item.children as Record<string, unknown>[]) : [item]);
    expect(rows.map(({ node: item }) => toServerDecision(item))).toEqual(flatten(roots.map(toServerDecision)));
  });

  it("retains cached child edits across whole/split transitions", () => {
    const roots = [{ ...node("parent"), nodeMode: "split" as const, children: [setPart(node("child"), "scrap_qty", 4)] }];
    const whole = updateNode(roots, [0], (item) => ({ ...item, nodeMode: "whole" }));
    expect(effectiveRows(whole).map(({ node: item }) => item.item_id)).toEqual(["parent"]);
    const split = updateNode(whole, [0], (item) => ({ ...item, nodeMode: "split" }));
    expect(effectiveRows(split)[0].node.scrap_qty).toBe(4);
    expect(hasChanges(split[0])).toBe(true);
  });
});
