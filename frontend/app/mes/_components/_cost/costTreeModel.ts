import type { CostNode } from "@/lib/api/types/cost";

export type HighlightScope = "family" | "down" | "up" | "direct";
export interface TreeEntry {
  path: string; parent: string | null; depth: number; node: CostNode; children: string[];
}
export type TreeIndex = Map<string, TreeEntry>;
export type BranchState = { expanded: Set<string>; revealed: Set<string> };

/** Index occurrences without changing shared API objects or root-relative amounts. */
export function indexCostTree(root: CostNode): TreeIndex {
  const index: TreeIndex = new Map();
  function visit(node: CostNode, path: string, parent: string | null, depth: number): void {
    const children = node.children.map((child, i) => `${path}/${i}:${encodeURIComponent(child.item_id)}`);
    index.set(path, { path, parent, depth, node, children });
    node.children.forEach((child, i) => visit(child, children[i], path, depth + 1));
  }
  visit(root, "root", null, 0);
  return index;
}

/** Fall back to a surviving ancestor, never to another occurrence of the same item. */
export function nearestCostPath(index: TreeIndex, path: string): string {
  let current = path;
  while (!index.has(current) && current.includes("/")) current = current.slice(0, current.lastIndexOf("/"));
  return index.has(current) ? current : "root";
}

export function costAncestors(index: TreeIndex, path: string): TreeEntry[] {
  const chain: TreeEntry[] = [];
  let entry = index.get(path);
  while (entry) { chain.unshift(entry); entry = entry.parent ? index.get(entry.parent) : undefined; }
  return chain;
}

export function costDescendants(index: TreeIndex, path: string): TreeEntry[] {
  const result: TreeEntry[] = [];
  function visit(current: string): void {
    const entry = index.get(current);
    if (!entry) return;
    result.push(entry);
    entry.children.forEach(visit);
  }
  visit(path);
  return result;
}

/** New exploration scopes show every occurrence; users may collapse branches afterwards. */
export function initialCostBranches(index: TreeIndex, path: string): BranchState {
  const expanded = new Set(costDescendants(index, path).filter(entry => entry.children.length).map(entry => entry.path));
  return { expanded, revealed: new Set(expanded) };
}

export function highlightedCostPaths(index: TreeIndex, selected: string | null, scope: HighlightScope): Set<string> {
  if (!selected) return new Set();
  const entry = index.get(selected)!;
  const paths = new Set([selected]);
  if (scope === "family" || scope === "up") costAncestors(index, selected).forEach(parent => paths.add(parent.path));
  if (scope === "family" || scope === "down") costDescendants(index, selected).forEach(child => paths.add(child.path));
  if (scope === "direct") { if (entry.parent) paths.add(entry.parent); entry.children.forEach(child => paths.add(child)); }
  return paths;
}
