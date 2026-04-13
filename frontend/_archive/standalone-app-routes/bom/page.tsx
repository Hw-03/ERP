"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Save, Trash2 } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import {
  api,
  type BOMEntry,
  type BOMTreeNode,
  type Item,
  type ProductionCheckResponse,
  type ProductionReceiptResponse,
} from "@/lib/api";

function TreeNode({ node, depth = 0 }: { node: BOMTreeNode; depth?: number }) {
  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3"
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-slate-100">{node.item_name}</p>
            <p className="mt-1 font-mono text-xs text-slate-500">{node.item_code}</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <p>필요 수량 {Number(node.required_quantity).toLocaleString()}</p>
            <p>현재고 {Number(node.current_stock).toLocaleString()}</p>
          </div>
        </div>
      </div>
      {node.children.map((child) => (
        <TreeNode key={`${node.item_id}-${child.item_id}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function BomPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [parentSearch, setParentSearch] = useState("");
  const [childSearch, setChildSearch] = useState("");
  const [selectedParent, setSelectedParent] = useState<Item | null>(null);
  const [selectedChild, setSelectedChild] = useState<Item | null>(null);
  const [bomEntries, setBomEntries] = useState<BOMEntry[]>([]);
  const [bomTree, setBomTree] = useState<BOMTreeNode | null>(null);
  const [productionCheck, setProductionCheck] = useState<ProductionCheckResponse | null>(null);
  const [productionResult, setProductionResult] = useState<ProductionReceiptResponse | null>(null);
  const [bomQuantity, setBomQuantity] = useState("1");
  const [productionQuantity, setProductionQuantity] = useState("1");
  const [unit, setUnit] = useState("EA");
  const [notes, setNotes] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [producedBy, setProducedBy] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getItems({ limit: 2000 })
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "품목을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedParent) {
      setBomEntries([]);
      setBomTree(null);
      setProductionCheck(null);
      return;
    }

    Promise.all([api.getBOM(selectedParent.item_id), api.getBOMTree(selectedParent.item_id)])
      .then(([entries, tree]) => {
        setBomEntries(entries);
        setBomTree(tree);
        setProductionCheck(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "BOM 정보를 불러오지 못했습니다.");
      });
  }, [selectedParent]);

  const filteredParents = useMemo(() => {
    const keyword = parentSearch.trim().toLowerCase();
    return items
      .filter((item) =>
        ["TA", "TF", "HA", "HF", "VA", "VF", "BA", "BF", "FG"].includes(item.category),
      )
      .filter((item) =>
        !keyword
          ? true
          : [item.item_name, item.item_code, item.spec ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(keyword),
      )
      .slice(0, 12);
  }, [items, parentSearch]);

  const filteredChildren = useMemo(() => {
    const keyword = childSearch.trim().toLowerCase();
    return items
      .filter((item) => !selectedParent || item.item_id !== selectedParent.item_id)
      .filter((item) =>
        !keyword
          ? true
          : [item.item_name, item.item_code, item.spec ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(keyword),
      )
      .slice(0, 12);
  }, [childSearch, items, selectedParent]);

  const refreshBom = async () => {
    if (!selectedParent) return;
    const [entries, tree] = await Promise.all([
      api.getBOM(selectedParent.item_id),
      api.getBOMTree(selectedParent.item_id),
    ]);
    setBomEntries(entries);
    setBomTree(tree);
  };

  const handleAddBom = async () => {
    if (!selectedParent || !selectedChild) {
      setError("상위 품목과 하위 품목을 모두 선택해 주세요.");
      return;
    }

    const qty = Number(bomQuantity);
    if (!qty || qty <= 0) {
      setError("수량은 0보다 커야 합니다.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await api.createBOM({
        parent_item_id: selectedParent.item_id,
        child_item_id: selectedChild.item_id,
        quantity: qty,
        unit,
        notes: notes || undefined,
      });
      setSelectedChild(null);
      setChildSearch("");
      setBomQuantity("1");
      setNotes("");
      await refreshBom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOM 추가에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBom = async (bomId: string) => {
    try {
      setSaving(true);
      setError(null);
      await api.deleteBOM(bomId);
      await refreshBom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOM 삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleCheckProduction = async () => {
    if (!selectedParent) return;
    try {
      setSaving(true);
      setError(null);
      setProductionResult(null);
      const result = await api.checkProduction(
        selectedParent.item_id,
        Number(productionQuantity || 1),
      );
      setProductionCheck(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "생산 가능 여부 확인에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleProductionReceipt = async () => {
    if (!selectedParent) return;
    try {
      setSaving(true);
      setError(null);
      const result = await api.productionReceipt({
        item_id: selectedParent.item_id,
        quantity: Number(productionQuantity || 1),
        reference_no: referenceNo || undefined,
        produced_by: producedBy || undefined,
        notes: productionNotes || undefined,
      });
      setProductionResult(result);
      await refreshBom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "생산 입고 실행에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl px-6 py-8">
        <section className="rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            BOM And Production
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight">BOM 관리와 생산 입고</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            레거시 앱의 Ass&apos;y BOM 흐름을 현재 FastAPI 기반 BOM과 생산 입고 로직에 맞게
            이식했습니다. 상위 품목을 선택해 BOM을 구성하고, 재고 검증과 생산 입고까지 같은
            화면에서 처리할 수 있습니다.
          </p>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
          <section className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-100">상위 품목 선택</h3>
            <input
              value={parentSearch}
              onChange={(event) => setParentSearch(event.target.value)}
              placeholder="생산 대상 품목 검색"
              className="mt-4 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />

            <div className="mt-4 space-y-2">
              {loading ? (
                <p className="text-sm text-slate-500">품목을 불러오는 중입니다.</p>
              ) : (
                filteredParents.map((item) => (
                  <button
                    key={item.item_id}
                    onClick={() => setSelectedParent(item)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedParent?.item_id === item.item_id
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                    }`}
                  >
                    <p className="font-medium text-slate-100">{item.item_name}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{item.item_code}</p>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
            {selectedParent ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">선택된 상위 품목</h3>
                    <p className="mt-1 text-sm text-slate-500">{selectedParent.item_name}</p>
                    <p className="mt-1 font-mono text-xs text-slate-600">{selectedParent.item_code}</p>
                  </div>
                  <div className="text-right text-sm text-slate-400">
                    <p>현재고 {Number(selectedParent.quantity).toLocaleString()}</p>
                    <p>{selectedParent.unit}</p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <h4 className="text-sm font-semibold text-slate-100">BOM 항목 추가</h4>
                  <input
                    value={childSearch}
                    onChange={(event) => setChildSearch(event.target.value)}
                    placeholder="하위 품목 검색"
                    className="mt-3 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />

                  <div className="mt-3 max-h-48 space-y-2 overflow-auto">
                    {filteredChildren.map((item) => (
                      <button
                        key={item.item_id}
                        onClick={() => setSelectedChild(item)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          selectedChild?.item_id === item.item_id
                            ? "border-emerald-500 bg-emerald-500/10"
                            : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                        }`}
                      >
                        <p className="font-medium text-slate-100">{item.item_name}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{item.item_code}</p>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[120px,120px,1fr,auto]">
                    <input
                      value={bomQuantity}
                      onChange={(event) => setBomQuantity(event.target.value)}
                      className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                    />
                    <input
                      value={unit}
                      onChange={(event) => setUnit(event.target.value)}
                      className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                    />
                    <input
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="비고"
                      className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <button
                      onClick={handleAddBom}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      추가
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-100">BOM 목록</h4>
                    <div className="mt-4 space-y-3">
                      {bomEntries.length === 0 ? (
                        <p className="text-sm text-slate-500">등록된 BOM이 없습니다.</p>
                      ) : (
                        bomEntries.map((entry) => {
                          const childItem = items.find((item) => item.item_id === entry.child_item_id);
                          return (
                            <div
                              key={entry.bom_id}
                              className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3"
                            >
                              <div>
                                <p className="font-medium text-slate-100">
                                  {childItem?.item_name || entry.child_item_id}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {Number(entry.quantity).toLocaleString()} {entry.unit}
                                  {entry.notes ? ` · ${entry.notes}` : ""}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDeleteBom(entry.bom_id)}
                                className="rounded-xl p-2 text-red-300 transition hover:bg-red-500/10"
                                aria-label="BOM 삭제"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-100">BOM 트리</h4>
                    <div className="mt-4 space-y-3">
                      {bomTree ? (
                        <TreeNode node={bomTree} />
                      ) : (
                        <p className="text-sm text-slate-500">표시할 BOM 트리가 없습니다.</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40">
                <p className="text-sm text-slate-500">왼쪽에서 상위 품목을 선택해 주세요.</p>
              </div>
            )}
          </section>
        </div>

        {selectedParent && (
          <section className="mt-6 rounded-[24px] border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">생산 입고 / Backflush</h3>
                <p className="mt-1 text-sm text-slate-500">
                  생산 가능 여부를 먼저 확인한 뒤 실제 입고를 실행합니다.
                </p>
              </div>
              {productionCheck && !productionCheck.can_produce && (
                <div className="inline-flex items-center gap-2 rounded-full border border-red-700/40 bg-red-950/40 px-3 py-1.5 text-xs text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                  부족 자재 있음
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[0.85fr,1.15fr]">
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <input
                  value={productionQuantity}
                  onChange={(event) => setProductionQuantity(event.target.value)}
                  placeholder="생산 수량"
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                />
                <input
                  value={referenceNo}
                  onChange={(event) => setReferenceNo(event.target.value)}
                  placeholder="참조 번호"
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                />
                <input
                  value={producedBy}
                  onChange={(event) => setProducedBy(event.target.value)}
                  placeholder="작업자"
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                />
                <textarea
                  value={productionNotes}
                  onChange={(event) => setProductionNotes(event.target.value)}
                  placeholder="생산 메모"
                  className="min-h-[120px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                />

                <div className="flex gap-3">
                  <button
                    onClick={handleCheckProduction}
                    disabled={saving}
                    className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 transition hover:border-slate-600 disabled:opacity-50"
                  >
                    재고 검증
                  </button>
                  <button
                    onClick={handleProductionReceipt}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    생산 입고 실행
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                {productionResult ? (
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-300">입고 완료</h4>
                    <p className="mt-2 text-sm text-slate-300">{productionResult.message}</p>
                    <div className="mt-4 space-y-3">
                      {productionResult.backflushed_components.map((component) => (
                        <div
                          key={component.item_id}
                          className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3"
                        >
                          <p className="font-medium text-slate-100">{component.item_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            차감 {Number(component.required_quantity).toLocaleString()} · 전
                            {Number(component.stock_before).toLocaleString()} → 후
                            {Number(component.stock_after).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : productionCheck ? (
                  <div>
                    <h4
                      className={`text-sm font-semibold ${
                        productionCheck.can_produce ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {productionCheck.can_produce ? "생산 가능" : "생산 불가"}
                    </h4>
                    <div className="mt-4 space-y-3">
                      {productionCheck.components.map((component) => (
                        <div
                          key={component.item_code}
                          className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <p className="font-medium text-slate-100">{component.item_name}</p>
                            <p
                              className={`text-xs ${
                                component.ok ? "text-emerald-300" : "text-red-300"
                              }`}
                            >
                              {component.ok ? "충분" : "부족"}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            필요 {component.required.toLocaleString()} / 현재
                            {component.current_stock.toLocaleString()} / 부족
                            {component.shortage.toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[220px] items-center justify-center">
                    <p className="text-sm text-slate-500">재고 검증 또는 생산 결과가 여기에 표시됩니다.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
