"use client";

import { useEffect, useRef, useState } from "react";
import { api, type IoBatch, type Item, type StockRequest } from "@/lib/api";
import { isDepartmentApprover } from "./_warehouse_steps";
import { useWarehouseData } from "./_warehouse_hooks/useWarehouseData";
import { WarehouseHeader } from "./_warehouse_sections/WarehouseHeader";
import { WarehouseSectionTabs, type WarehouseSectionTab } from "./_warehouse_sections/WarehouseSectionTabs";
import { WarehouseDraftPanelTabs } from "./_warehouse_sections/WarehouseDraftPanelTabs";
import { IoComposeView } from "./_warehouse_v2/IoComposeView";
import { readCurrentOperator } from "./login/useCurrentOperator";
import type { IoEntryIntent } from "./_warehouse_v2/types";
import type { IoStep } from "./_warehouse_v2/useIoWorkState";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { LoadFailureCard } from "./common/LoadFailureCard";

// 탭 전환 remount 사이 직전 카운트 보존 (세션 내 메모리 캐시).
// 새로고침 시 휘발 — 첫 진입은 항상 fresh fetch.
const cartCountCache = new Map<string, number>();
const warehouseQueueCountCache = { value: 0 };
const deptQueueCountCache = new Map<string, number>();

// 인수인계를 받는 부서 — 이 부서 소속이면 결재자가 아니어도 인수 확인 가능.
const HANDOVER_RECEIVE_DEPTS = ["고압", "진공"];

export function DesktopWarehouseView({
  globalSearch,
  onStatusChange,
  preselectedItem,
  entryIntent,
  onSubmitSuccess,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  preselectedItem?: Item | null;
  entryIntent?: IoEntryIntent | null;
  onSubmitSuccess?: () => void;
}) {
  const revision = useRealtimeRevision();
  const { employees, items, productModels, loadFailure, setItems } = useWarehouseData({
    globalSearch,
    onStatusChange,
  });

  const operator = typeof window !== "undefined" ? readCurrentOperator() : null;
  const urlDraftId = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("draftId");
  const urlRestoreStep = typeof window === "undefined"
    ? undefined
    : parseIoStep(new URLSearchParams(window.location.search).get("step"));
  const [employeeId, setEmployeeId] = useState<string>(operator?.employee_id ?? "");
  // 알림 클릭 딥링크 — URL ?section= 으로 초기 섹션 결정 (권한 없으면 compose 폴백).
  const [sectionTab, setSectionTab] = useState<WarehouseSectionTab>(() => {
    if (typeof window === "undefined") return "compose";
    const s = new URLSearchParams(window.location.search).get("section");
    const valid: WarehouseSectionTab[] = ["compose", "cart", "mine", "queue", "dept-queue", "handover"];
    if (!s || !valid.includes(s as WarehouseSectionTab)) return "compose";
    const whRole = operator?.warehouse_role ?? "none";
    if (s === "queue" && whRole !== "primary" && whRole !== "deputy") return "compose";
    if (s === "dept-queue" && !isDepartmentApprover(operator)) return "compose";
    if (s === "handover") {
      const dept = operator?.department ?? "";
      const ok = dept === "튜브" || HANDOVER_RECEIVE_DEPTS.includes(dept);
      if (!ok) return "compose";
    }
    return s as WarehouseSectionTab;
  });
  const [panelRefreshNonce, setPanelRefreshNonce] = useState(0);
  const [cartCount, setCartCount] = useState(() => {
    const eid = operator?.employee_id ?? "";
    return eid ? cartCountCache.get(eid) ?? 0 : 0;
  });
  const [warehouseQueueCount, setWarehouseQueueCount] = useState(
    () => warehouseQueueCountCache.value,
  );
  const [deptQueueCount, setDeptQueueCount] = useState(() => {
    const eid = operator?.employee_id ?? "";
    return eid ? deptQueueCountCache.get(eid) ?? 0 : 0;
  });
  const [restoreIoDraft, setRestoreIoDraft] = useState<IoBatch | null>(null);
  const [urlDraftPending, setUrlDraftPending] = useState(() => Boolean(urlDraftId));
  const [urlDraftRestoreError, setUrlDraftRestoreError] = useState<string | null>(null);
  const [urlDraftRestoreNonce, setUrlDraftRestoreNonce] = useState(0);
  const restoredUrlDraftRef = useRef<string | null>(null);
  // '이어서 하기' 클릭마다 증가 — 같은 draft 재선택(batch_id 불변)에도 복원이 재발동하도록.
  const [restoreNonce, setRestoreNonce] = useState(0);
  const [handoverInboxCount, setHandoverInboxCount] = useState(0);
  const [itemConversionFocused, setItemConversionFocused] = useState(false);

  const operatorEmployeeId = operator?.employee_id ?? employeeId;
  const canSeeQueue =
    (operator?.warehouse_role ?? "none") === "primary" ||
    (operator?.warehouse_role ?? "none") === "deputy";
  const canSeeDeptQueue = isDepartmentApprover(operator);
  // 인수인계: 작성(튜브 부서원) 또는 인수 확인(받는 부서 소속)이면 탭 노출. 결재권자는 제외.
  const canReceiveHandover = HANDOVER_RECEIVE_DEPTS.includes(operator?.department ?? "");
  const showHandover = (operator?.department ?? "") === "튜브" || canReceiveHandover;
  const normalizeSectionTab = (value: string | null): WarehouseSectionTab => {
    const valid: WarehouseSectionTab[] = ["compose", "cart", "mine", "queue", "dept-queue", "handover"];
    if (!value || !valid.includes(value as WarehouseSectionTab)) return "compose";
    if (value === "queue" && !canSeeQueue) return "compose";
    if (value === "dept-queue" && !canSeeDeptQueue) return "compose";
    if (value === "handover" && !showHandover) return "compose";
    return value as WarehouseSectionTab;
  };

  useEffect(() => {
    if (operator && employeeId === "") setEmployeeId(operator.employee_id);
  }, [operator, employeeId]);

  useEffect(() => {
    const handlePopState = () => {
      const next = normalizeSectionTab(new URLSearchParams(window.location.search).get("section"));
      if (next !== "compose") setItemConversionFocused(false);
      setSectionTab(next);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  });

  useEffect(() => {
    if (!operatorEmployeeId) return;
    let cancelled = false;
    const legacyDraftsPromise = api.listStockRequestDrafts(operatorEmployeeId);
    const ioDraftsPromise = api.listDrafts(operatorEmployeeId);

    void Promise.allSettled([legacyDraftsPromise, ioDraftsPromise])
      .then(([legacyResult, ioResult]) => {
        if (cancelled) return;
        const legacyCount = legacyResult.status === "fulfilled" ? legacyResult.value.length : 0;
        const ioCount = ioResult.status === "fulfilled" ? ioResult.value.length : 0;
        const n = legacyCount + ioCount;
        setCartCount(n);
        cartCountCache.set(operatorEmployeeId, n);
      });

    if (!urlDraftId || restoredUrlDraftRef.current === urlDraftId) {
      setUrlDraftPending(false);
      setUrlDraftRestoreError(null);
      return () => {
        cancelled = true;
      };
    }

    setUrlDraftPending(true);
    setUrlDraftRestoreError(null);
    void ioDraftsPromise
      .then((ioRows) => {
        if (cancelled) return;
        const matchingDraft = ioRows.find((draft) => draft.batch_id === urlDraftId);
        if (!matchingDraft) {
          setUrlDraftRestoreError("저장한 작업을 찾을 수 없습니다.");
          setUrlDraftPending(false);
          return;
        }
        restoredUrlDraftRef.current = urlDraftId;
        setRestoreIoDraft(matchingDraft);
        setRestoreNonce((value) => value + 1);
        setSectionTab("compose");
        setUrlDraftPending(false);
      })
      .catch(() => {
        if (cancelled) return;
        setUrlDraftRestoreError("저장한 작업을 불러오지 못했습니다.");
        setUrlDraftPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [operatorEmployeeId, panelRefreshNonce, revision, urlDraftId, urlDraftRestoreNonce]);

  useEffect(() => {
    if (!canSeeQueue) return;
    let active = true;
    api
      .countWarehouseQueue()
      .then(({ count }) => {
        if (!active) return;
        setWarehouseQueueCount(count);
        warehouseQueueCountCache.value = count;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canSeeQueue, panelRefreshNonce, revision]);

  useEffect(() => {
    if (!canSeeDeptQueue || !operatorEmployeeId) return;
    let active = true;
    api
      .countDepartmentQueue(operatorEmployeeId)
      .then(({ count }) => {
        if (!active) return;
        setDeptQueueCount(count);
        deptQueueCountCache.set(operatorEmployeeId, count);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canSeeDeptQueue, operatorEmployeeId, panelRefreshNonce, revision]);

  useEffect(() => {
    if (!canReceiveHandover || !operatorEmployeeId) return;
    let active = true;
    api
      .countHandoverInbox(operatorEmployeeId)
      .then(({ count }) => {
        if (active) setHandoverInboxCount(count);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canReceiveHandover, operatorEmployeeId, panelRefreshNonce, revision]);


  function handleLegacyDraftContinue(_draft: StockRequest) {
    setSectionTab("compose");
    onStatusChange("구형 장바구니는 새 입출고 화면에서 직접 복원되지 않습니다.");
  }

  function handleSectionTabChange(next: WarehouseSectionTab) {
    if (next !== "compose") setItemConversionFocused(false);
    setSectionTab(next);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "warehouse");
    if (next === "compose") {
      params.delete("section");
      params.delete("step");
    } else {
      params.set("section", next);
    }
    const query = params.toString();
    window.history.pushState(
      { ...(window.history.state || {}), warehouseSection: next },
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }

  const isComposeSection = sectionTab === "compose";
  const isWorkAreaSection = sectionTab === "cart" || sectionTab === "queue" || sectionTab === "dept-queue";
  const hideSectionTabs = isComposeSection && itemConversionFocused;

  return (
    <div className="flex h-full min-h-0 flex-1 min-w-0 overflow-x-hidden">
      <div
        data-testid="desktop-warehouse-content"
        className={`scrollbar-hide flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto overflow-x-hidden pl-0 pr-4 pt-0 ${isComposeSection ? "pb-0" : "pb-10"}`}
      >
        <WarehouseHeader loadFailure={loadFailure} />
        <div
          className={`sticky top-0 z-20 shrink-0 overflow-hidden bg-[var(--c-bg)] transition-[max-height,opacity,transform,margin] duration-200 ${
            hideSectionTabs ? "-mb-3 max-h-0 -translate-y-1 opacity-0" : "max-h-20 translate-y-0 opacity-100"
          }`}
          aria-hidden={hideSectionTabs}
        >
          <WarehouseSectionTabs
            active={sectionTab}
            onChange={handleSectionTabChange}
            showQueue={canSeeQueue}
            showDeptQueue={canSeeDeptQueue}
            showHandover={showHandover}
            cartCount={cartCount}
            queueCount={warehouseQueueCount}
            deptQueueCount={deptQueueCount}
            handoverInboxCount={handoverInboxCount}
          />
        </div>

        {!isComposeSection && (
          <div
            data-testid={isWorkAreaSection ? "warehouse-section-work-area" : undefined}
            className={isWorkAreaSection ? "flex min-h-0 flex-1 flex-col" : undefined}
          >
            <WarehouseDraftPanelTabs
              sectionTab={sectionTab}
              canSeeQueue={canSeeQueue}
              canSeeDeptQueue={canSeeDeptQueue}
              operator={operator}
              operatorEmployeeId={operator?.employee_id}
              employeeId={employeeId}
              refreshNonce={panelRefreshNonce}
              globalSearch={globalSearch}
              items={items}
              setItems={setItems}
              onContinueDraft={handleLegacyDraftContinue}
              onContinueIoDraft={(draft) => {
                setRestoreIoDraft(draft);
                setRestoreNonce((n) => n + 1);
                handleSectionTabChange("compose");
                persistWarehouseDraftUrl(
                  draft.batch_id,
                  draft.sub_type === "adjust_in"
                    || draft.sub_type === "adjust_out"
                    || draft.sub_type === "warehouse_adjust_in"
                    || draft.sub_type === "warehouse_adjust_out"
                    ? 3
                    : 4,
                );
              }}
              bumpRefresh={() => setPanelRefreshNonce((n) => n + 1)}
              onSubmitSuccess={onSubmitSuccess}
              resetDraftTracking={() => {}}
              onCartCountChange={(n) => {
                setCartCount(n);
                if (operatorEmployeeId) cartCountCache.set(operatorEmployeeId, n);
              }}
              onStartCompose={() => handleSectionTabChange("compose")}
            />
          </div>
        )}

        {isComposeSection && (
          <div className="min-h-0 flex-1">
            {urlDraftPending ? (
              <div className="flex h-full items-center justify-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                저장한 작업을 불러오는 중입니다.
              </div>
            ) : urlDraftRestoreError ? (
              <div className="flex h-full items-center justify-center px-4">
                <LoadFailureCard
                  prefix={urlDraftRestoreError}
                  message="현재 작업 위치를 유지했습니다."
                  retryLabel="다시 시도"
                  onRetry={() => setUrlDraftRestoreNonce((value) => value + 1)}
                />
              </div>
            ) : <IoComposeView
              globalSearch={globalSearch}
              operator={operator}
              employees={employees}
              items={items}
              productModels={productModels}
              setItems={setItems}
              preselectedItem={preselectedItem}
              restoreDraft={restoreIoDraft}
              restoreNonce={restoreNonce}
              restoreStep={urlRestoreStep}
              entryIntent={entryIntent}
              onStatusChange={(status) => {
                onStatusChange(status);
                setPanelRefreshNonce((n) => n + 1);
              }}
              onSubmitSuccess={() => {
                setPanelRefreshNonce((n) => n + 1);
                onSubmitSuccess?.();
              }}
              onItemConversionFocusChange={setItemConversionFocused}
              onDraftSaved={persistWarehouseDraftUrl}
            />}
          </div>
        )}
      </div>
    </div>
  );
}

function parseIoStep(raw: string | null): IoStep | undefined {
  const step = Number(raw);
  return step >= 1 && step <= 5 ? step as IoStep : undefined;
}

function persistWarehouseDraftUrl(batchId: string, step: IoStep): void {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "warehouse");
  url.searchParams.set("section", "compose");
  url.searchParams.set("step", String(step));
  url.searchParams.set("draftId", batchId);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
