"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, GitMerge, Minus, Plus, RotateCcw, Save, Search, Trash2 } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import {
  api,
  type BOMEntry,
  type BOMTreeNode,
  type Item,
  type ProductionCheckResponse,
  type ProductionReceiptResponse,
} from "@/lib/api";

const DEPTH_COLORS = [
  "border-blue-500/40 bg-blue-500/8",
  "border-emerald-500/30 bg-emerald-500/6",
  "border-amber-500/30 bg-amber-500/6",
  "border-purple-500/30 bg-purple-500/6",
  "border-slate-600/40 bg-slate-900/40",
];

function TreeNode({ node, depth = 0 }: { node: BOMTreeNode; depth?: number }) {
  const colorClass = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
  const stockOk = Number(node.current_stock) >= Number(node.required_quantity);
  return (
    <div>
      <div className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${colorClass}`} style={{ marginLeft: depth * 20 }}>
        <div className="flex items-center gap-2 min-w-0">
          {depth > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />}
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">{node.item_name}</p>
            <p className="font-mono text-xs text-slate-500">{node.item_code}</p>
          </div>
        </div>
        <div className="ml-3 shrink-0 text-right text-xs">
          <p className={`font-mono font-semibold ${stockOk ? "text-emerald-300" : "text-red-300"}`}>
            {Number(node.current_stock).toLocaleString()}
          </p>
          <p className="text-slate-500">/ {Number(node.required_quantity).toLocaleString()} 필요</p>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <TreeNode key={`${node.item_id}-${child.item_id}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

type RightTab = "bom" | "tree" | "where_used";

export default function BomPage() {
  const [items, setItems]               = useState<Item[]>([]);
  const [parentSearch, setParentSearch] = useState("");
  const [childSearch, setChildSearch]   = useState("");
  const [selectedParent, setSelectedParent] = useState<Item | null>(null);
  const [selectedChild, setSelectedChild]   = useState<Item | null>(null);
  const [bomEntries, setBomEntries]     = useState<BOMEntry[]>([]);
  const [bomTree, setBomTree]           = useState<BOMTreeNode | null>(null);
  const [productionCheck, setProductionCheck]   = useState<ProductionCheckResponse | null>(null);
  const [productionResult, setProductionResult] = useState<ProductionReceiptResponse | null>(null);
  const [bomQuantity, setBomQuantity]   = useState("1");
  const [productionQty, setProductionQty] = useState("1");
  const [unit, setUnit]                 = useState("EA");
  const [bomNotes, setBomNotes]         = useState("");
  const [referenceNo, setReferenceNo]   = useState("");
  const [producedBy, setProducedBy]     = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [rightTab, setRightTab]         = useState<RightTab>("bom");

  const deferredParent = useDeferredValue(parentSearch);
  const deferredChild  = useDeferredValue(childSearch);
  const parentListRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.getItems({ limit: 2000 })
      .then((data) => { if (!cancelled) { setItems(data); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "품목을 불러오지 못했습니다."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedParent) { setBomEntries([]); setBomTree(null); setProductionCheck(null); return; }
    Promise.all([api.getBOM(selectedParent.item_id), api.getBOMTree(selectedParent.item_id)])
      .then(([entries, tree]) => { setBomEntries(entries); setBomTree(tree); setProductionCheck(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "BOM 정보를 불러오지 못했습니다."));
  }, [selectedParent]);

  const filteredParents = useMemo(() => {
    const kw = deferredParent.trim().toLowerCase();
    return items
      .filter((i) => ["TA","TF","HA","HF","VA","VF","BA","BF","FG"].includes(i.category))
      .filter((i) => !kw || [i.item_name, i.item_code, i.spec ?? ""].join(" ").toLowerCase().includes(kw));
  }, [items, deferredParent]);

  const filteredChildren = useMemo(() => {
    const kw = deferredChild.trim().toLowerCase();
    return items
      .filter((i) => !selectedParent || i.item_id !== selectedParent.item_id)
      .filter((i) => !kw || [i.item_name, i.item_code, i.spec ?? ""].join(" ").toLowerCase().includes(kw))
      .slice(0, 80);
  }, [childSearch, items, selectedParent, deferredChild]);

  const refreshBom = async () => {
    if (!selectedParent) return;
    const [entries, tree] = await Promise.all([api.getBOM(selectedParent.item_id), api.getBOMTree(selectedParent.item_id)]);
    setBomEntries(entries);
    setBomTree(tree);
  };

  const handleAddBom = async () => {
    if (!selectedParent || !selectedChild) { setError("상위 품목과 하위 품목을 모두 선택해 주세요."); return; }
    const qty = Number(bomQuantity);
    if (!qty || qty <= 0) { setError("수량은 0보다 커야 합니다."); return; }
    try {
      setSaving(true); setError(null);
      await api.createBOM({ parent_item_id: selectedParent.item_id, child_item_id: selectedChild.item_id, quantity: qty, unit, notes: bomNotes || undefined });
      setSelectedChild(null); setChildSearch(""); setBomQuantity("1"); setBomNotes("");
      await refreshBom();
    } catch (err) { setError(err instanceof Error ? err.message : "BOM 추가에 실패했습니다."); }
    finally { setSaving(false); }
  };

  const handleDeleteBom = async (bomId: string) => {
    try { setSaving(true); setError(null); await api.deleteBOM(bomId); await refreshBom(); }
    catch (err) { setError(err instanceof Error ? err.message : "BOM 삭제에 실패했습니다."); }
    finally { setSaving(false); }
  };

  const handleCheckProduction = async () => {
    if (!selectedParent) return;
    try { setSaving(true); setError(null); setProductionResult(null); const result = await api.checkProduction(selectedParent.item_id, Number(productionQty || 1)); setProductionCheck(result); }
    catch (err) { setError(err instanceof Error ? err.message : "생산 가능 여부 확인에 실패했습니다."); }
    finally { setSaving(false); }
  };

  const handleProductionReceipt = async () => {
    if (!selectedParent) return;
    try {
      setSaving(true); setError(null);
      const result = await api.productionReceipt({ item_id: selectedParent.item_id, quantity: Number(productionQty || 1), reference_no: referenceNo || undefined, produced_by: producedBy || undefined, notes: productionNotes || undefined });
      setProductionResult(result);
      await refreshBom();
    } catch (err) { setError(err instanceof Error ? err.message : "생산 입고 실행에 실패했습니다."); }
    finally { setSaving(false); }
  };

  const TABS: { key: RightTab; label: string }[] = [
    { key: "bom",        label: `BOM 목록 (${bomEntries.length})` },
    { key: "tree",       label: "BOM 트리" },
    { key: "where_used", label: "Where-Used" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl px-6 pb-8">
        <div className="grid h-[calc(100vh-64px)] grid-cols-[minmax(280px,0.85fr)_minmax(500px,1.5fr)] gap-4 pt-4">

          {/* ── LEFT: 상위 품목 선택 ── */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">BOM &amp; Production</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-50">생산 대상 품목</h2>
              <p className="mt-1 text-xs text-slate-500">반제품(A·F) 및 완제품(FG) 필터</p>
            </div>

            <div className="border-b border-slate-800 px-5 py-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={parentSearch}
                  onChange={(e) => setParentSearch(e.target.value)}
                  placeholder="품목명, 코드 검색..."
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                />
              </label>
              <p className="mt-2 text-xs text-slate-600">{filteredParents.length}개 품목</p>
            </div>

            <div ref={parentListRef} className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">불러오는 중...</div>
              ) : filteredParents.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">검색 결과 없음</div>
              ) : (
                filteredParents.map((item) => {
                  const isSelected = selectedParent?.item_id === item.item_id;
                  return (
                    <button
                      key={item.item_id}
                      type="button"
                      onClick={() => setSelectedParent(item)}
                      className={`flex w-full items-center justify-between border-b border-slate-900 px-5 py-3 text-left transition ${
                        isSelected
                          ? "border-l-2 border-l-blue-500 bg-blue-900/25"
                          : "border-l-2 border-l-transparent hover:bg-slate-900/60"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{item.item_name}</p>
                        <p className="font-mono text-xs text-slate-500">{item.item_code}</p>
                      </div>
                      <span className="ml-3 shrink-0 font-mono text-sm text-slate-400">
                        {Number(item.quantity).toLocaleString()}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* ── RIGHT: BOM 관리 + 생산 ── */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
            {!selectedParent ? (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-800/60 text-slate-600">
                  <GitMerge className="h-9 w-9" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-300">품목을 선택해 주세요</h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                  좌측에서 생산 대상 품목을 선택하면 BOM 구성과 생산 입고를 여기서 처리할 수 있습니다.
                </p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="border-b border-slate-800 px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs text-blue-300">{selectedParent.item_code}</p>
                      <h3 className="mt-1 text-xl font-bold text-slate-50">{selectedParent.item_name}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">현재고</p>
                      <p className="font-mono text-xl font-semibold text-slate-50">{Number(selectedParent.quantity).toLocaleString()} <span className="text-sm text-slate-500">{selectedParent.unit || "EA"}</span></p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mx-5 mt-3 rounded-xl border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>
                )}

                {/* Tab bar */}
                <div className="flex border-b border-slate-800 px-5">
                  {TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setRightTab(tab.key)}
                      className={`border-b-2 px-4 py-3 text-xs font-semibold transition ${
                        rightTab === tab.key
                          ? "border-blue-500 text-blue-300"
                          : "border-transparent text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {/* ── TAB: BOM 목록 ── */}
                  {rightTab === "bom" && (
                    <div className="space-y-4 px-5 py-4">
                      {/* Add BOM */}
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">하위 품목 추가</p>
                        <label className="relative block">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                          <input
                            value={childSearch}
                            onChange={(e) => { setChildSearch(e.target.value); setSelectedChild(null); }}
                            placeholder="하위 품목 검색..."
                            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500"
                          />
                        </label>
                        <div className="mt-2 max-h-[180px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
                          {filteredChildren.length === 0 ? (
                            <p className="px-4 py-2 text-xs text-slate-600">검색 결과 없음</p>
                          ) : (
                            filteredChildren.map((item) => (
                              <button
                                key={item.item_id}
                                type="button"
                                onClick={() => setSelectedChild(item)}
                                className={`flex w-full items-center justify-between border-b border-slate-800/60 px-3 py-2 text-left transition last:border-0 ${
                                  selectedChild?.item_id === item.item_id
                                    ? "border-l-2 border-l-emerald-500 bg-emerald-900/20"
                                    : "border-l-2 border-l-transparent hover:bg-slate-800/60"
                                }`}
                              >
                                <div>
                                  <span className="font-mono text-xs text-slate-500">{item.item_code}</span>
                                  <span className="ml-2 text-sm text-slate-200">{item.item_name}</span>
                                </div>
                                <span className="ml-3 font-mono text-xs text-slate-400">{Number(item.quantity).toLocaleString()}</span>
                              </button>
                            ))
                          )}
                        </div>
                        {selectedChild && (
                          <div className="mt-3 flex items-center gap-2">
                            <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950 px-2 py-1">
                              <button type="button" onClick={() => setBomQuantity((v) => String(Math.max(1, Number(v) - 1)))} className="text-slate-400 hover:text-white"><Minus className="h-3 w-3" /></button>
                              <input value={bomQuantity} onChange={(e) => setBomQuantity(e.target.value)} className="w-14 bg-transparent text-center text-sm font-mono text-slate-50 outline-none" inputMode="numeric" />
                              <button type="button" onClick={() => setBomQuantity((v) => String(Number(v) + 1))} className="text-slate-400 hover:text-white"><Plus className="h-3 w-3" /></button>
                            </div>
                            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="단위" className="w-16 rounded-xl border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-sm text-slate-100 outline-none focus:border-blue-500" />
                            <input value={bomNotes} onChange={(e) => setBomNotes(e.target.value)} placeholder="비고 (선택)" className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500" />
                            <button type="button" onClick={() => void handleAddBom()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
                              <Plus className="h-3.5 w-3.5" />추가
                            </button>
                          </div>
                        )}
                      </div>

                      {/* BOM list */}
                      <div className="space-y-2">
                        {bomEntries.length === 0 ? (
                          <p className="py-4 text-center text-sm text-slate-500">등록된 BOM이 없습니다.</p>
                        ) : (
                          bomEntries.map((entry) => {
                            const child = items.find((i) => i.item_id === entry.child_item_id);
                            const stockOk = child ? Number(child.quantity) >= Number(entry.quantity) : true;
                            return (
                              <div key={entry.bom_id} className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${stockOk ? "border-slate-800 bg-slate-900/40" : "border-red-500/20 bg-red-500/5"}`}>
                                <div>
                                  <p className="text-sm font-medium text-slate-100">{child?.item_name || entry.child_item_id}</p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    필요 {Number(entry.quantity).toLocaleString()} {entry.unit}
                                    {child ? <span className={` · 현재고 ${stockOk ? "text-emerald-400" : "text-red-400"}`}>{Number(child.quantity).toLocaleString()}</span> : null}
                                    {entry.notes ? ` · ${entry.notes}` : ""}
                                  </p>
                                </div>
                                <button type="button" onClick={() => void handleDeleteBom(entry.bom_id)} className="rounded-xl p-2 text-slate-600 transition hover:bg-red-500/10 hover:text-red-300" aria-label="BOM 삭제">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── TAB: BOM 트리 ── */}
                  {rightTab === "tree" && (
                    <div className="px-5 py-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs text-slate-500">현재고(실선)가 필요수량 이상이면 초록, 부족이면 빨강</p>
                        <button type="button" onClick={() => void refreshBom()} className="text-slate-600 hover:text-slate-400"><RotateCcw className="h-3.5 w-3.5" /></button>
                      </div>
                      {bomTree ? (
                        <div className="space-y-1"><TreeNode node={bomTree} /></div>
                      ) : (
                        <p className="py-8 text-center text-sm text-slate-500">표시할 BOM 트리가 없습니다.</p>
                      )}
                    </div>
                  )}

                  {/* ── TAB: Where-Used ── */}
                  {rightTab === "where_used" && (
                    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
                        <GitMerge className="h-7 w-7" />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-slate-200">역추적 (Where-Used)</h3>
                      <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                        이 품목이 어떤 상위 BOM에서 사용되는지 트리로 표시합니다.
                      </p>
                      <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-2 text-xs text-amber-300/80">
                        백엔드 API 준비 중 — GET /api/bom/where-used/{"{item_id}"}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Production section ── */}
                <div className="border-t border-slate-800 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">생산 입고 / Backflush</p>
                    {productionCheck && !productionCheck.can_produce && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-700/40 bg-red-950/40 px-2.5 py-1 text-xs text-red-300">
                        <AlertTriangle className="h-3 w-3" />자재 부족
                      </span>
                    )}
                    {productionResult && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/40 bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-300">
                        입고 완료
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 items-end">
                    <div>
                      <p className="mb-1 text-[10px] text-slate-500">수량</p>
                      <input value={productionQty} onChange={(e) => setProductionQty(e.target.value)} placeholder="수량" inputMode="numeric" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] text-slate-500">참조번호</p>
                      <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="참조번호" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] text-slate-500">작업자</p>
                      <input value={producedBy} onChange={(e) => setProducedBy(e.target.value)} placeholder="작업자" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500" />
                    </div>
                    <button type="button" onClick={() => void handleCheckProduction()} disabled={saving} className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:opacity-50 whitespace-nowrap">
                      재고 검증
                    </button>
                    <button type="button" onClick={() => void handleProductionReceipt()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap">
                      <Save className="h-3.5 w-3.5" />생산 입고
                    </button>
                  </div>
                  {productionCheck && (
                    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
                      <p className={`text-xs font-semibold ${productionCheck.can_produce ? "text-emerald-300" : "text-red-300"}`}>
                        {productionCheck.can_produce ? `✓ ${Number(productionQty)}개 생산 가능` : "✗ 재고 부족"}
                      </p>
                      {!productionCheck.can_produce && productionCheck.missing_components && (
                        <div className="mt-1.5 space-y-1">
                          {productionCheck.missing_components.map((c) => (
                            <p key={c.item_id} className="text-xs text-slate-400">
                              {c.item_name}: 부족 {Number(c.shortage).toLocaleString()}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
