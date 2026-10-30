import { costAncestors, type BranchState, type TreeEntry, type TreeIndex } from "./costTreeModel";
import { PROCESS_TO_DEPT } from "@/lib/mes/process";

export const TREE_CARD_WIDTH = 320;
export const TREE_COLUMNS = 5;
export const TREE_GAP = 32;
export const TREE_RAIL = 24;

// Match bom_family_graph.html: shipping → tube, then final → assembly → raw.
const PROCESS_ORDER = ["PF", "PA", "PR", "AF", "AA", "AR", "NF", "NA", "NR", "VF", "VA", "VR", "HF", "HA", "HR", "TF", "TA", "TR"];
const STAGE_NAMES: Record<string, string> = { F: "완료", A: "중간", R: "원자재" };
const INLINE_FA_PROCESSES = new Set(["NF", "NA", "VF", "VA", "HF", "HA", "TF", "TA"]);
const INLINE_DEPARTMENTS = new Set(["튜닝", "진공", "고압", "튜브"]);

/** Cost nodes expose MES codes; use the shared code-to-department mapping without changing the API. */
export function costProcessInfo(mesCode: string): { code: string; department: string | null; label: string | null; order: number } {
  const code = mesCode.split("-")[1] ?? "";
  const order = PROCESS_ORDER.indexOf(code);
  const department = PROCESS_TO_DEPT[code] ?? null;
  return { code: order < 0 ? "" : code, department, label: department ? `${department} ${STAGE_NAMES[code[1]]}` : null, order: order < 0 ? PROCESS_ORDER.length : order };
}

export type CostLayoutUnit = { key: string; entries: TreeEntry[]; parent: TreeEntry | null; material: boolean; hero: boolean; width: number; rank: number; columns?: TreeEntry[][]; offset?: number };
export type CostProcessBand = { code: string; department: string | null; stage: string; rows: CostLayoutUnit[][]; width: number };
export type CostDepartment = { name: string | null; rows: CostProcessBand[][] };
export type CostProcessLayout = { width: number; gutter: number; bands: CostProcessBand[]; departments: CostDepartment[]; strips: CostDepartment[][] };

/** Global process bands keep departments together regardless of a node's actual BOM depth. */
export function layoutCostTree(index: TreeIndex, state: BranchState, path: string, _availableWidth = 0): CostProcessLayout {
  const visible: TreeEntry[] = [];
  function visit(current: string): void {
    const entry = index.get(current)!;
    visible.push(entry);
    if (!state.expanded.has(current)) return;
    entry.children.forEach(visit);
  }
  visit(path);
  const byProcess = new Map<string, TreeEntry[]>();
  for (const entry of [...visible].sort((a, b) => costProcessInfo(a.node.mes_code).order - costProcessInfo(b.node.mes_code).order)) {
    const code = costProcessInfo(entry.node.mes_code).code, group = byProcess.get(code) ?? [];
    group.push(entry); byProcess.set(code, group);
  }
  const bands: CostProcessBand[] = [];
  for (const [code, members] of byProcess) {
    const { department } = costProcessInfo(members[0].node.mes_code);
    const units = new Map<string, CostLayoutUnit>();
    for (const entry of members) {
      const hero = entry.path === path;
      const material = !hero && code.endsWith("R") && !entry.children.length;
      const key = material ? `${code}:${entry.parent}` : entry.path;
      const existing = units.get(key);
      if (existing) { existing.entries.push(entry); continue; }
      // Non-assembly F/A cards share horizontal space; assembly keeps its hierarchy rows.
      const rank = department !== "조립" && /^[A-Z][FA]$/.test(code) ? 0 : costAncestors(index, entry.path).filter(ancestor => ancestor.path !== entry.path && members.includes(ancestor)).length;
      units.set(key, { key, entries: [entry], parent: entry.parent ? index.get(entry.parent)! : null, material, hero, width: hero ? 410 : TREE_CARD_WIDTH, rank });
    }
    // Assembly siblings follow their parent process and the parent's rendered order.
    const parentPositions = new Map(bands.flatMap(band => band.rows.flatMap(row => row.flatMap(unit => unit.entries))).map((entry, position) => [entry.path, position]));
    const assemblyParentOrder = (unit: CostLayoutUnit): number => {
      const parentCode = unit.parent ? costProcessInfo(unit.parent.node.mes_code).code : "";
      return parentCode === "AF" ? 0 : parentCode === "AA" ? 1 : 2;
    };
    const rows: CostLayoutUnit[][] = [];
    for (const unit of [...units.values()].sort((a, b) => a.rank - b.rank || (department === "조립" ? assemblyParentOrder(a) - assemblyParentOrder(b) : 0) || (a.material && b.material ? (parentPositions.get(a.parent?.path ?? "") ?? Number.MAX_SAFE_INTEGER) - (parentPositions.get(b.parent?.path ?? "") ?? Number.MAX_SAFE_INTEGER) : 0))) {
      const row = rows.at(-1);
      if (!row || (department !== "조립" && !INLINE_FA_PROCESSES.has(code) && row.length === TREE_COLUMNS) || row[0].rank !== unit.rank) rows.push([unit]);
      else row.push(unit);
    }
    for (const unit of units.values()) if (unit.material) {
      const count = Math.min(3, Math.ceil(unit.entries.length / 8));
      if (count > 1) {
        const size = Math.ceil(unit.entries.length / count);
        unit.columns = Array.from({length:count}, (_, i) => unit.entries.slice(i*size,(i+1)*size));
        unit.width = count * TREE_CARD_WIDTH + (count-1)*TREE_GAP;
      }
    }
    bands.push({ code, department, stage: STAGE_NAMES[code[1]] ?? "", rows, width: Math.max(...rows.map(row => row.reduce((sum, unit) => sum + unit.width, 0) + (row.length - 1) * TREE_GAP)) + TREE_RAIL });
  }
  const departments: CostDepartment[] = [];
  const maxWidth = TREE_COLUMNS * TREE_CARD_WIDTH + (TREE_COLUMNS - 1) * TREE_GAP + TREE_RAIL;
  const bandEntries = (band: CostProcessBand): TreeEntry[] => band.rows.flatMap(row => row.flatMap(unit => unit.entries));
  for (const band of bands) {
    let department = departments.at(-1);
    if (!department || department.name !== band.department) { department = { name: band.department, rows: [] }; departments.push(department); }
    const row = department.rows.at(-1);
    const related = row?.some(previous => bandEntries(previous).some(a => bandEntries(band).some(b => a.path.startsWith(`${b.path}/`) || b.path.startsWith(`${a.path}/`))));
    const compactFA = row && [...row, band].every(part => /^[A-Z][FA]$/.test(part.code) && (part.rows.length === 1 || INLINE_FA_PROCESSES.has(part.code) || department.name === "조립")) && (department.name === "조립" || INLINE_FA_PROCESSES.has(band.code) || [...row, band].reduce((sum, part) => sum + part.rows[0].length, 0) <= TREE_COLUMNS);
    const rawBelowFA = band.code.endsWith("R") && row?.some(part => INLINE_FA_PROCESSES.has(part.code));
    if (!row || rawBelowFA || !compactFA && (related || row.reduce((sum, previous) => sum + previous.width + TREE_GAP, 0) + band.width > maxWidth)) department.rows.push([band]);
    else row.push(band);
  }
  const gutter = TREE_RAIL;
  const strips: CostDepartment[][] = [];
  for (const department of departments) {
    const strip = strips.at(-1);
    if (strip && INLINE_DEPARTMENTS.has(department.name ?? "") && INLINE_DEPARTMENTS.has(strip[0].name ?? "")) strip.push(department);
    else strips.push([department]);
  }
  const departmentWidths = new Map(departments.map(dept => [dept, Math.max(...dept.rows.map(row => row.reduce((sum, band) => sum + band.width, 0) + (row.length - 1) * TREE_GAP))]));
  // Match each material column to its parent's axis. Only reserve space between
  // groups; the card itself stays at its readable fixed width.
  const updateWidths = (dept: CostDepartment): void => {
    for (const row of dept.rows) for (const band of row) band.width = Math.max(...band.rows.map(units => units.reduce((sum, unit) => sum + unit.width + (unit.offset ?? 0), 0) + (units.length - 1) * TREE_GAP)) + TREE_RAIL;
    departmentWidths.set(dept, Math.max(...dept.rows.map(row => row.reduce((sum, band) => sum + band.width, 0) + (row.length - 1) * TREE_GAP)));
  };
  const unitLeft = (dept: CostDepartment, target: CostLayoutUnit): number => {
    for (const row of dept.rows) {
      let bandLeft = TREE_RAIL;
      for (const band of row) {
        for (const units of band.rows) {
          let left = bandLeft;
          for (const unit of units) {
            left += unit.offset ?? 0;
            if (unit === target) return left;
            left += unit.width + TREE_GAP;
          }
        }
        bandLeft += band.width + TREE_GAP;
      }
    }
    return 0;
  };
  // Reserve nested same-process branches beside their parent before placing siblings.
  for (const dept of departments) {
    const units=dept.rows.flatMap(row=>row.flatMap(band=>band.rows.flat()));
    const cards=units.filter(unit=>!unit.material);
    const byPath=new Map(cards.map(unit=>[unit.entries[0].path,unit]));
    for(const material of units.filter(unit=>unit.material)) {
      const parent=byPath.get(material.parent?.path??"");
      if(parent)parent.width=Math.max(parent.width,material.width);
    }
    for(const unit of units)unit.offset=0;
    for(const row of dept.rows)for(const band of row) {
      if(band.code!=="AA")continue;
      const members=band.rows.flat(),own=new Map(members.map(unit=>[unit,unit.width]));
      const children=(unit:CostLayoutUnit):CostLayoutUnit[]=>members.filter(child=>child.parent?.path===unit.entries[0].path);
      const reserve=(unit:CostLayoutUnit):number=>unit.width=own.get(unit)!+children(unit).reduce((sum,child)=>sum+TREE_GAP+reserve(child),0);
      const roots=members.filter(unit=>!members.some(parent=>parent.entries[0].path===unit.parent?.path));
      roots.forEach(reserve);
      const positions=new Map<CostLayoutUnit,number>();
      const place=(unit:CostLayoutUnit,x:number):void=>{positions.set(unit,x);let next=x+own.get(unit)!+TREE_GAP;for(const child of children(unit)){place(child,next);next+=child.width+TREE_GAP;}};
      let x=0;for(const unit of roots){place(unit,x);x+=unit.width+TREE_GAP;}
      band.rows=[members.sort((a,b)=>positions.get(a)!-positions.get(b)!)];
      let cursor=0;
      for(const unit of band.rows[0]) {
        unit.width=own.get(unit)!;
        unit.offset=positions.get(unit)!-cursor;
        cursor=positions.get(unit)!+unit.width+TREE_GAP;
      }
    }
    updateWidths(dept);
    const materialBands=dept.rows.flat().filter(band=>band.code.endsWith("R"));
    for(const band of materialBands)for(const row of band.rows) {
      const desired=(unit:CostLayoutUnit):number=>{const parent=byPath.get(unit.parent?.path??"");return parent?unitLeft(dept,parent):unitLeft(dept,unit);};
      row.sort((a,b)=>desired(a)-desired(b));
      // A raw band has its own rail; parent axes already include that same rail.
      let cursor=TREE_RAIL;
      for(const unit of row){const x=Math.max(cursor,desired(unit));unit.offset=x-cursor;cursor=x+unit.width+TREE_GAP;}
    }
    updateWidths(dept);
  }
  const workWidth = (): number => Math.max(...strips.map(strip => strip.reduce((sum, dept) => sum + departmentWidths.get(dept)!, 0) + (strip.length - 1) * TREE_GAP));
  const width = gutter + workWidth() + TREE_RAIL;
  return { width, gutter, bands, departments, strips };
}
