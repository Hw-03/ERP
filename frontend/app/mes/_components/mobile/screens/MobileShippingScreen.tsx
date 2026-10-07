"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FilePenLine, History, Package, PackageCheck } from "lucide-react";
import { api, type Item, type ShippingRequest } from "@/lib/api";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { queryKeys } from "@/lib/queries/keys";
import { useShippingHistoryMonthsQuery, useShippingRequestsQuery } from "@/lib/queries/useShippingQuery";
import type { Operator } from "../../login/useCurrentOperator";
import type { IoEntryIntent } from "../../_warehouse_v2/types";
import { ShippingHeader, ShippingItemName, ShippingStatus } from "../shipping/ShippingPresentation";
import presentation from "../mobilePresentation.module.css";
import { MobileShippingRequestWizard } from "../shipping/MobileShippingRequestWizard";
import { MobileShippingDetail } from "../shipping/MobileShippingDetail";
import { MobileShippingHistory } from "../shipping/MobileShippingHistory";
import { useShippingNavigation } from "../shipping/useShippingNavigation";
import type { MobileShippingView, ShippingRoute } from "../shipping/shipping-route";
import { MobileRoundedScrollArea } from "../primitives/MobileRoundedScrollArea";

export function MobileShippingScreen({ operator = null, onGoToWarehouse, onNavigateAway, onBusyChange, onExit }: {
  operator?: Operator | null;
  onGoToWarehouse?: (item: Item, intent?: IoEntryIntent) => void;
  onNavigateAway?: (tab: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onExit?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { route, navigate } = useShippingNavigation(onNavigateAway, busy);
  const busyCallbackRef = useRef(onBusyChange);
  busyCallbackRef.current = onBusyChange;
  const updateBusy = useCallback((next: boolean) => { setBusy(next); busyCallbackRef.current?.(next); }, []);
  useEffect(() => () => { busyCallbackRef.current?.(false); }, []);
  const client = useQueryClient();
  const requests = useShippingRequestsQuery(undefined, { live: true });
  const months = useShippingHistoryMonthsQuery(undefined, route.view === "hub");
  const selectedQuery = useQuery({
    queryKey: ["shipping", "detail", route.requestId],
    queryFn: ({ signal }) => api.getShippingRequest(route.requestId!, { signal }),
    enabled: Boolean(route.requestId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const selected = selectedQuery.data ?? requests.data?.find((row) => row.request_id === route.requestId);
  const lastResume = useRef<number | null>(null);
  const refetchRequests = requests.refetch;
  const refetchSelected = selectedQuery.refetch;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (lastResume.current !== null && now - lastResume.current < 250) return;
      lastResume.current = now;
      void refetchRequests({ cancelRefetch: false });
      if (route.requestId) void refetchSelected({ cancelRefetch: false });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refetchRequests, refetchSelected, route.requestId]);

  const upsert = useCallback((next: ShippingRequest) => {
    void client.cancelQueries({ queryKey: ["shipping", "detail", next.request_id] });
    void client.cancelQueries({ queryKey: queryKeys.shipping.requests() });
    client.setQueryData(["shipping", "detail", next.request_id], next);
    client.setQueryData<ShippingRequest[]>(queryKeys.shipping.requests(), (previous = []) => [next, ...previous.filter((row) => row.request_id !== next.request_id)]);
    void client.invalidateQueries({ queryKey: ["shipping", "historyMonths"] });
  }, [client]);
  const open = (view: MobileShippingView, requestId: string | null = null, extra: Partial<ShippingRoute> = {}) => navigate({ ...route, view, requestId, step: 1, managementStatus: view === "hub" || view.startsWith("history") ? null : route.managementStatus, ...extra });
  const managed = (requests.data ?? []).filter((row) => row.status === "PREPARING" || row.status === "PREPARED");
  const initialLoading = requests.isPending || requests.isPlaceholderData && requests.isFetching;
  const initialError = requests.error && (requests.data === undefined || requests.isPlaceholderData);

  if (route.view === "historyList") return <MobileShippingHistory status={route.historyStatus} onStatusChange={(historyStatus) => open("historyList", null, { historyStatus })} onSelect={(request) => { upsert(request); open("historyWork", request.request_id); }} onBack={() => open("hub")} />;

  if (route.requestId && !selected) return <div className="flex min-h-0 flex-1 flex-col" style={{ color: C.text }}>
    <ShippingHeader title="출하 상세" backLabel="이전 화면" onBack={() => open(route.view === "historyWork" ? "historyList" : "requestList")} />
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4">
    {selectedQuery.isError ? <div role="alert">{selectedQuery.error.message}<button type="button" className="block min-h-11 font-bold" onClick={() => void selectedQuery.refetch()}>다시 불러오기</button></div> : <p role="status">출하 요청을 불러오는 중입니다.</p>}
    </div>
  </div>;

  if (route.view === "requestWork") {
    return <MobileShippingRequestWizard key={route.requestId ?? "new"} operator={operator} request={selected ?? null} step={route.step} onBusyChange={updateBusy} onStepChange={(step) => navigate({ ...route, step }, { bypassGuard: true })} onCancel={() => open(route.requestId ? "requestDetail" : "requestList", route.requestId)} onSaved={(request) => {
      updateBusy(false);
      upsert(request);
      navigate({ ...route, view: "requestDetail", requestId: request.request_id, step: 1, managementStatus: "PREPARING" }, { replace: true, bypassGuard: true });
    }} />;
  }
  if (selected && (route.view === "requestDetail" || route.view === "historyWork")) return <MobileShippingDetail key={selected.request_id} request={selected} onRequestChange={(request) => {
    upsert(request);
    if (request.status === "PICKED_UP" && route.view !== "historyWork") navigate({ ...route, view: "historyWork", historyStatus: "PICKED_UP" }, { replace: true });
  }} onEdit={() => open("requestWork", selected.request_id)} onBack={() => open(route.view === "historyWork" ? "historyList" : "requestList", null, { managementStatus: selected.status === "PREPARED" ? "PREPARED" : selected.status === "PREPARING" ? "PREPARING" : null })} onDeleted={() => { void client.invalidateQueries({ queryKey: queryKeys.shipping.all }); open("requestList", null, { managementStatus: "PREPARING" }); }} onPickupCancelled={(request) => { upsert(request); open("requestDetail", request.request_id, { managementStatus: "PREPARED" }); }} onGoToWarehouse={onGoToWarehouse} />;

  return <div className="flex min-h-0 flex-1 flex-col text-sm" style={{ color: C.text }}>
    <ShippingHeader title={route.view === "hub" ? "출하" : route.managementStatus === "PREPARING" ? "준비 중" : route.managementStatus === "PREPARED" ? "준비 완료" : "출하 관리"} onBack={route.view === "hub" ? onExit : () => route.managementStatus ? open("requestList", null, { managementStatus: null }) : open("hub")} backLabel={route.view === "hub" ? "더보기 메뉴로 돌아가기" : "이전 화면"} />
    <MobileRoundedScrollArea>
    {route.view === "hub" ? <>
      <div className={`${presentation.choiceList} ${presentation.separatedChoices}`}>
      <button type="button" onClick={() => open("requestList")} className={presentation.menuRow}><span className={presentation.choiceIcon}><PackageCheck /></span><span className="min-w-0 flex-1"><span className="block text-lg font-bold">출하 관리</span><span className="mt-1 block text-sm font-medium" style={{ color: C.muted2 }}>준비 중 · 준비 완료</span><span className="mt-2 block text-sm font-bold">{initialLoading || initialError ? "—" : managed.length}건</span></span><ChevronRight size={20} /></button>
      <button type="button" onClick={() => open("historyList")} className={presentation.menuRow}><span className={presentation.choiceIcon} style={{ color: C.purple }}><History /></span><span className="min-w-0 flex-1"><span className="block text-lg font-bold">출하 이력</span><span className="mt-1 block text-sm font-medium" style={{ color: C.muted2 }}>픽업 완료 · 요청 취소</span><span className="mt-2 block text-sm font-bold">{months.data ? months.data.reduce((total, month) => total + month.count, 0) : "—"}건</span></span><ChevronRight size={20} /></button>
      </div>
      {months.isError && <p role="alert">이력 건수를 불러오지 못했습니다.<button type="button" className="ml-2 min-h-11 font-bold" onClick={() => void months.refetch()}>다시 불러오기</button></p>}
    </> : !route.managementStatus ? <div className={`${presentation.choiceList} ${presentation.separatedChoices}`}>
      <button type="button" onClick={() => open("requestWork")} className={presentation.menuRow}><span className={presentation.choiceIcon}><FilePenLine size={24} /></span><span className="min-w-0 flex-1 text-lg font-bold">출하 요청</span><ChevronRight size={20} /></button>
      {(["PREPARING", "PREPARED"] as const).map((status) => <button type="button" key={status} onClick={() => open("requestList", null, { managementStatus: status })} className={presentation.menuRow}><span className={presentation.choiceIcon} style={{ color: status === "PREPARED" ? C.green : C.blue }}>{status === "PREPARED" ? <PackageCheck size={24} /> : <Package size={24} />}</span><span className="min-w-0 flex-1"><span className="block text-lg font-bold">{status === "PREPARED" ? "준비 완료" : "준비 중"}</span><span className="mt-2 block text-sm font-medium" style={{ color: C.muted2 }}>{initialLoading || initialError ? "—" : managed.filter((row) => row.status === status).length}건</span></span><ChevronRight size={20} /></button>)}
    </div> : <>
      {initialLoading ? <p role="status">출하 요청을 불러오는 중입니다.</p> : !initialError && [route.managementStatus].map((status) => {
        const rows = managed.filter((row) => row.status === status);
        const label = status === "PREPARING" ? "준비 중" : "준비 완료";
        return <section key={status} className="space-y-3"><h2 className="text-base font-bold">{label} <span className="ml-1 text-sm font-medium" style={{ color: C.muted2 }}>{rows.length}</span></h2>{rows.length === 0 ? <p className="rounded-[20px] border p-4" style={{ borderColor: C.border, color: C.muted2 }}>{label}인 요청이 없습니다.</p> : rows.map((request) => <div key={request.request_id} className="rounded-[20px] border p-4" style={{ background: C.s1, borderColor: C.border }}>
          <ShippingStatus status={request.status} />
          <ShippingItemName name={request.final_pf_item_name ?? request.base_pf_item_name} className="mt-3 text-base font-bold" />
          <div className="mt-2 flex items-center justify-between gap-3"><span className="min-w-0 break-all" style={{ color: C.muted2 }}>{request.final_pf_mes_code ?? request.base_pf_mes_code ?? "코드 없음"}</span><span className="shrink-0 whitespace-nowrap font-bold">{request.request_quantity}대</span></div>
          <p className="mt-3 break-all">인보이스 {request.invoice_number || "미입력"}</p><p className="mt-1 break-all text-xs font-medium" style={{ color: C.muted2 }}>{request.requested_by_name || "요청자 미지정"} · {new Date(request.created_at).toLocaleString("ko-KR")}</p>
          <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-between border-t pt-2 font-bold" style={{ borderColor: C.border, color: C.blue }} onClick={() => { upsert(request); open("requestDetail", request.request_id); }}>요청 상세<ChevronRight size={20} /></button>
        </div>)}</section>;
      })}
    </>}
    {requests.isError && <div role="alert" className="rounded-2xl border p-4" style={{ color: C.red, borderColor: C.border }}>{!initialError && "최신 상태를 불러오지 못했습니다. "}{requests.error.message}<button type="button" className="block min-h-11 font-bold" onClick={() => void requests.refetch()}>다시 불러오기</button></div>}
    </MobileRoundedScrollArea>
  </div>;
}
