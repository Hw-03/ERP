"use client";
import { ReadFailure } from "../../common/ReadState";
import { MobileIoRestoreSkeleton } from "../warehouse/MobileIoRestoreSkeleton";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { api, type IoBatch, type Item, type StockRequest } from "@/lib/api";
import { isDepartmentApprover } from "../../_warehouse_steps";
import { useWarehouseData } from "../../_warehouse_hooks/useWarehouseData";
import { WarehouseHeader } from "../../_warehouse_sections/WarehouseHeader";
import {
  WarehouseSectionTabs,
  type WarehouseSectionTab,
} from "../../_warehouse_sections/WarehouseSectionTabs";
import { WarehouseDraftPanelTabs } from "../../_warehouse_sections/WarehouseDraftPanelTabs";
import { readCurrentOperator } from "../../login/useCurrentOperator";
import type { IoEntryIntent } from "../../_warehouse_v2/types";
import {
  clearWarehouseDraftRestore,
  parseWarehouseStep,
  persistWarehouseDraftUrl,
} from "../../_warehouse_v2/warehouseDraftUrl";
import { MobileIoComposeWizard } from "../warehouse/MobileIoComposeWizard";
import { MobileDirtyLeaveSheet } from "../warehouse/MobileDirtyLeaveSheet";
import panelStyles from "./mobileWarehousePanels.module.css";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { LEGACY_COLORS } from "@/lib/mes/color";

// 인수인계 수신 부서 — DesktopWarehouseView 와 동일 도메인 상수(미export 라 동일값 복제).
const HANDOVER_RECEIVE_DEPTS = ["고압", "진공"];

// 탭 전환 remount 사이 직전 카운트 보존 (세션 내 메모리 캐시) — DesktopWarehouseView 와 동일.
const cartCountCache = new Map<string, number>();
const warehouseQueueCountCache = { value: 0, loaded: false };
const deptQueueCountCache = new Map<string, number>();
const asResearchQueueCountCache = new Map<string, number>();

/**
 * 입출고 모바일 화면.
 *
 * DesktopWarehouseView 의 데이터/권한/섹션 오케스트레이션을 그대로 따르되,
 * compose 섹션을 모바일 풀스크린 위저드(MobileIoComposeWizard)로 교체해
 * 393px 에서도 품목 선택~제출이 가능하게 한다. queue/cart/부서대기 섹션은
 * 기존 WarehouseDraftPanelTabs 를 재사용한다.
 */
export function MobileWarehouseScreen({
  globalSearch,
  onStatusChange,
  preselectedItem,
  entryIntent,
  onSubmitSuccess,
  onComposeDirtyChange,
  flushDraftRef: externalFlushRef,
  endEditingRef,
  notificationSection,
  targetRequestId,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  preselectedItem?: Item | null;
  entryIntent?: IoEntryIntent | null;
  onSubmitSuccess?: () => void;
  // 항목 16 — 하단 네비 이탈 가드용. compose 작성 중 여부를 상위(MobileShell)에 보고하고,
  // 상위가 이탈 직전 draft flush 를 호출할 수 있게 ref 를 공유받는다.
  onComposeDirtyChange?: (dirty: boolean) => void;
  flushDraftRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** 탭 이동이 확정되면 이전 저장·복원 응답과 자동 복원 연결을 종료한다. */
  endEditingRef?: MutableRefObject<(() => void) | null>;
  notificationSection?: string | null;
  targetRequestId?: string | null;
}) {
  const revision = useRealtimeRevision();
  const { employees, items, productModels, loadFailure, setItems, itemsLoading, itemsLoadError, itemsHasData, retryItems } = useWarehouseData({
    globalSearch,
    onStatusChange,
  });

  const operator = typeof window !== "undefined" ? readCurrentOperator() : null;
  const resolveNotificationSection = (section: string | null | undefined): WarehouseSectionTab => {
    if (section === "queue") {
      const role = operator?.warehouse_role ?? "none";
      return role === "primary" || role === "deputy" ? section : "compose";
    }
    if (section === "dept-queue") return isDepartmentApprover(operator) ? section : "compose";
    if (section === "as-research-queue") return operator?.as_research_approver ? section : "compose";
    if (section === "handover") {
      const dept = operator?.department ?? "";
      return dept === "튜브" || HANDOVER_RECEIVE_DEPTS.includes(dept) ? section : "compose";
    }
    return section === "cart" || section === "mine" ? section : "compose";
  };
  const [employeeId, setEmployeeId] = useState<string>(operator?.employee_id ?? "");
  const urlDraftId = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("draftId");
  const urlRestoreStep = typeof window === "undefined"
    ? undefined
    : parseWarehouseStep(new URLSearchParams(window.location.search).get("step"));
  const [sectionTab, setSectionTab] = useState<WarehouseSectionTab>(() => resolveNotificationSection(notificationSection));
  const [inboxOpen, setInboxOpen] = useState(false);
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
  const [asResearchQueueCount, setAsResearchQueueCount] = useState(() => {
    const eid = operator?.employee_id ?? "";
    return eid ? asResearchQueueCountCache.get(eid) ?? 0 : 0;
  });
  const [restoreIoDraft, setRestoreIoDraft] = useState<IoBatch | null>(null);
  const [urlDraftPending, setUrlDraftPending] = useState(() => Boolean(urlDraftId));
  const [urlDraftRestoreError, setUrlDraftRestoreError] = useState<string | null>(null);
  const [urlDraftRestoreNonce, setUrlDraftRestoreNonce] = useState(0);
  const restoredUrlDraftRef = useRef<string | null>(null);
  // '이어서 하기' 클릭마다 증가 — 같은 draft 재선택에도 복원이 재발동하도록.
  const [restoreNonce, setRestoreNonce] = useState(0);
  const [composeStep, setComposeStep] = useState(1);
  const showSectionTabs = !(sectionTab === "compose" && composeStep >= 2);
  const [sectionTabsMounted, setSectionTabsMounted] = useState(showSectionTabs);
  const [handoverInboxCount, setHandoverInboxCount] = useState(0);
  const [loadedCounts, setLoadedCounts] = useState<WarehouseSectionTab[]>(() => {
    const eid = operator?.employee_id ?? "";
    return [cartCountCache.has(eid) ? "cart" : null, warehouseQueueCountCache.loaded ? "queue" : null, deptQueueCountCache.has(eid) ? "dept-queue" : null, asResearchQueueCountCache.has(eid) ? "as-research-queue" : null].filter((tab): tab is WarehouseSectionTab => tab !== null);
  });
  const countEmployeeRef = useRef(operator?.employee_id ?? employeeId);
  const [failedCounts, setFailedCounts] = useState<WarehouseSectionTab[]>([]);
  // D2 — compose 작성 중(담은 묶음 있음) 다른 섹션 이탈 가드.
  const [composeDirty, setComposeDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<WarehouseSectionTab | null>(null);
  // 항목 16 — flush ref 는 상위(MobileShell)가 내려주면 공유, 없으면 로컬 사용(섹션 가드 단독 동작 보장).
  const localFlushRef = useRef<(() => Promise<void>) | null>(null);
  const flushDraftRef = externalFlushRef ?? localFlushRef;
  const mountedRef = useRef(false);
  const editingGenerationRef = useRef(0);
  const editingGeneration = editingGenerationRef.current;

  const endEditing = useCallback((): void => {
    editingGenerationRef.current += 1;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === "warehouse") {
      for (const key of ["section", "step", "draftId"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    restoredUrlDraftRef.current = null;
    setRestoreIoDraft(null);
    setUrlDraftPending(false);
    setUrlDraftRestoreError(null);
    setRestoreNonce((value) => value + 1);
    setComposeStep(1);
    setComposeDirty(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (endEditingRef) endEditingRef.current = endEditing;
    return () => {
      mountedRef.current = false;
      if (endEditingRef) endEditingRef.current = null;
    };
  }, [endEditing, endEditingRef]);

  const isCurrentEditing = (): boolean => mountedRef.current && editingGenerationRef.current === editingGeneration;

  // 작성 중 여부를 상위로 보고 → 하단 네비 탭 이탈 가드에 사용.
  useEffect(() => {
    onComposeDirtyChange?.(composeDirty);
  }, [composeDirty, onComposeDirtyChange]);

  useEffect(() => {
    if (showSectionTabs) {
      setSectionTabsMounted(true);
      return;
    }
    const timeoutId = setTimeout(() => setSectionTabsMounted(false), 200);
    return () => clearTimeout(timeoutId);
  }, [showSectionTabs]);

  const operatorEmployeeId = operator?.employee_id ?? employeeId;
  const canSeeQueue =
    (operator?.warehouse_role ?? "none") === "primary" ||
    (operator?.warehouse_role ?? "none") === "deputy";
  const canSeeDeptQueue = isDepartmentApprover(operator);
  const canSeeAsResearchQueue = operator?.as_research_approver === true;
  // Keep a role refresh from leaving an already open approval section blank.
  useEffect(() => {
    if (!((sectionTab === "queue" && !canSeeQueue)
      || (sectionTab === "dept-queue" && !canSeeDeptQueue)
      || (sectionTab === "as-research-queue" && !canSeeAsResearchQueue))) return;
    setSectionTab("compose");
    setInboxOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("section");
    url.searchParams.delete("stockRequestId");
    window.history.replaceState({ ...window.history.state, warehouseSection: "compose" }, "", `${url.pathname}${url.search}${url.hash}`);
  }, [sectionTab, canSeeQueue, canSeeDeptQueue, canSeeAsResearchQueue]);
  // 인수인계: 작성(튜브) 또는 인수 확인(받는 부서 소속)이면 탭 노출 — 데스크톱 동일. 결재권자는 제외.
  const canReceiveHandover = HANDOVER_RECEIVE_DEPTS.includes(operator?.department ?? "");
  const showHandover = (operator?.department ?? "") === "튜브" || canReceiveHandover;

  useEffect(() => {
    if (countEmployeeRef.current === operatorEmployeeId) return;
    countEmployeeRef.current = operatorEmployeeId;
    setCartCount(cartCountCache.get(operatorEmployeeId) ?? 0);
    setDeptQueueCount(deptQueueCountCache.get(operatorEmployeeId) ?? 0);
    setAsResearchQueueCount(asResearchQueueCountCache.get(operatorEmployeeId) ?? 0);
    setHandoverInboxCount(0);
    setFailedCounts([]);
    setLoadedCounts([
      ...(cartCountCache.has(operatorEmployeeId) ? ["cart" as const] : []),
      ...(warehouseQueueCountCache.loaded ? ["queue" as const] : []),
      ...(deptQueueCountCache.has(operatorEmployeeId) ? ["dept-queue" as const] : []),
      ...(asResearchQueueCountCache.has(operatorEmployeeId) ? ["as-research-queue" as const] : []),
    ]);
  }, [operatorEmployeeId]);

  useEffect(() => {
    if (operator && employeeId === "") setEmployeeId(operator.employee_id);
  }, [operator, employeeId]);

  useEffect(() => {
    if (notificationSection) {
      setSectionTab(resolveNotificationSection(notificationSection));
      setInboxOpen(false);
    }
    // notificationSection 이 바뀔 때만 외부 알림 목적지를 적용한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationSection]);

  useEffect(() => {
    if (!operatorEmployeeId) return;
    let cancelled = false;
    const generation = editingGenerationRef.current;
    setFailedCounts((tabs) => tabs.filter((tab) => tab !== "cart"));
    const legacyDraftsPromise = api.listStockRequestDrafts(operatorEmployeeId);
    const ioDraftsPromise = api.listDrafts(operatorEmployeeId);

    void Promise.allSettled([legacyDraftsPromise, ioDraftsPromise])
      .then(([legacyResult, ioResult]) => {
        if (cancelled) return;
        if (legacyResult.status !== "fulfilled" || ioResult.status !== "fulfilled") {
          setFailedCounts((tabs) => [...tabs.filter((tab) => tab !== "cart"), "cart"]);
          return;
        }
        const legacyCount = legacyResult.value.length;
        const ioCount = ioResult.value.length;
        const n = legacyCount + ioCount;
        setCartCount(n);
        cartCountCache.set(operatorEmployeeId, n);
        setLoadedCounts((tabs) => tabs.includes("cart") ? tabs : [...tabs, "cart"]);
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
        if (cancelled || generation !== editingGenerationRef.current) return;
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
        if (cancelled || generation !== editingGenerationRef.current) return;
        setUrlDraftRestoreError("저장한 작업을 불러오지 못했습니다.");
        setUrlDraftPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [operatorEmployeeId, panelRefreshNonce, revision, urlDraftId, urlDraftRestoreNonce]);

  useEffect(() => {
    if (!canSeeQueue) return;
    setFailedCounts((tabs) => tabs.filter((tab) => tab !== "queue"));
    let active = true;
    api
      .countWarehouseQueue()
      .then(({ count }) => {
        if (!active) return;
        setWarehouseQueueCount(count);
        warehouseQueueCountCache.value = count;
        warehouseQueueCountCache.loaded = true;
        setLoadedCounts((tabs) => tabs.includes("queue") ? tabs : [...tabs, "queue"]);
      })
      .catch(() => { if (active) setFailedCounts((tabs) => [...tabs.filter((tab) => tab !== "queue"), "queue"]); });
    return () => {
      active = false;
    };
  }, [canSeeQueue, panelRefreshNonce, revision]);

  useEffect(() => {
    if (!canSeeDeptQueue || !operatorEmployeeId) return;
    setFailedCounts((tabs) => tabs.filter((tab) => tab !== "dept-queue"));
    let active = true;
    api
      .countDepartmentQueue(operatorEmployeeId)
      .then(({ count }) => {
        if (!active) return;
        setDeptQueueCount(count);
        deptQueueCountCache.set(operatorEmployeeId, count);
        setLoadedCounts((tabs) => tabs.includes("dept-queue") ? tabs : [...tabs, "dept-queue"]);
      })
      .catch(() => { if (active) setFailedCounts((tabs) => [...tabs.filter((tab) => tab !== "dept-queue"), "dept-queue"]); });
    return () => {
      active = false;
    };
  }, [canSeeDeptQueue, operatorEmployeeId, panelRefreshNonce, revision]);

  useEffect(() => {
    if (!canSeeAsResearchQueue || !operatorEmployeeId) return;
    setFailedCounts((tabs) => tabs.filter((tab) => tab !== "as-research-queue"));
    let active = true;
    api.countAsResearchQueue(operatorEmployeeId)
      .then(({ count }) => {
        if (!active) return;
        setAsResearchQueueCount(count);
        asResearchQueueCountCache.set(operatorEmployeeId, count);
        setLoadedCounts((tabs) => tabs.includes("as-research-queue") ? tabs : [...tabs, "as-research-queue"]);
      })
      .catch(() => { if (active) setFailedCounts((tabs) => [...tabs.filter((tab) => tab !== "as-research-queue"), "as-research-queue"]); });
    return () => { active = false; };
  }, [canSeeAsResearchQueue, operatorEmployeeId, panelRefreshNonce, revision]);

  useEffect(() => {
    if (!canReceiveHandover || !operatorEmployeeId) return;
    setFailedCounts((tabs) => tabs.filter((tab) => tab !== "handover"));
    let active = true;
    api
      .countHandoverInbox(operatorEmployeeId)
      .then(({ count }) => {
        if (active) {
          setHandoverInboxCount(count);
          setLoadedCounts((tabs) => tabs.includes("handover") ? tabs : [...tabs, "handover"]);
        }
      })
      .catch(() => { if (active) setFailedCounts((tabs) => [...tabs.filter((tab) => tab !== "handover"), "handover"]); });
    return () => {
      active = false;
    };
  }, [canReceiveHandover, operatorEmployeeId, panelRefreshNonce, revision]);


  function handleLegacyDraftContinue(_draft: StockRequest) {
    setSectionTab("compose");
    onStatusChange("구형 장바구니는 새 입출고 화면에서 직접 복원되지 않습니다.");
  }

  // compose 에서 작성 중인데 다른 섹션으로 이동하려 하면 확인 시트로 가드.
  function handleSectionChange(next: WarehouseSectionTab) {
    if (sectionTab === "compose" && next !== "compose" && composeDirty) {
      setPendingTab(next);
      return;
    }
    if (sectionTab === "compose" && next !== "compose") endEditing();
    setSectionTab(next);
    setInboxOpen(false);
  }

  const sectionTabsProps = {
    unavailableCounts: failedCounts.filter((tab) => !loadedCounts.includes(tab)),
    loadingCounts: (["cart", ...(canSeeQueue ? ["queue"] : []), ...(canSeeDeptQueue ? ["dept-queue"] : []), ...(canSeeAsResearchQueue ? ["as-research-queue"] : []), ...(canReceiveHandover ? ["handover"] : [])] as WarehouseSectionTab[]).filter((tab) => countEmployeeRef.current !== operatorEmployeeId || (!loadedCounts.includes(tab) && !failedCounts.includes(tab))),
    mobilePresentation: true,
    active: sectionTab,
    onChange: handleSectionChange,
    showQueue: canSeeQueue,
    showDeptQueue: canSeeDeptQueue,
    showAsResearchQueue: canSeeAsResearchQueue,
    showHandover,
    cartCount,
    queueCount: warehouseQueueCount,
    deptQueueCount,
    asResearchQueueCount,
    handoverInboxCount,
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative z-20 flex shrink-0 flex-col px-3">
        <WarehouseHeader loadFailure={loadFailure} />
        {sectionTabsMounted && (
          <div
            aria-hidden={!showSectionTabs}
            className={showSectionTabs ? "wt wo" : "wt wc"}
            style={loadFailure ? undefined : { marginTop: 0 }}
          >
            <WarehouseSectionTabs
              {...sectionTabsProps}
              mobileInboxOpen={inboxOpen}
              onMobileInboxOpen={() => setInboxOpen(true)}
            />
          </div>
        )}
      </div>

      {inboxOpen && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-2">
          <WarehouseSectionTabs {...sectionTabsProps} mobileInboxView />
        </div>
      )}
      <div hidden={inboxOpen} className={inboxOpen ? "hidden" : "min-h-0 flex-1 overflow-hidden"}>
        {sectionTab === "compose" ? urlDraftPending ? (
          <MobileIoRestoreSkeleton />
        ) : urlDraftRestoreError ? (
          <div className="h-full overflow-y-auto px-4 py-6">
            <ReadFailure
              message={`${urlDraftRestoreError} 현재 작업 위치를 유지했습니다.`}
              onRetry={() => setUrlDraftRestoreNonce((value) => value + 1)}
            />
          </div>
        ) : (
          <MobileIoComposeWizard
            itemsLoading={itemsLoading}
            itemsLoadError={itemsLoadError}
            itemsHasData={itemsHasData}
            onRetryItems={retryItems}
            globalSearch={globalSearch}
            operator={operator}
            employees={employees}
            items={items}
            productModels={productModels}
            setItems={setItems}
            preselectedItem={editingGeneration === 0 ? preselectedItem : null}
            restoreDraft={restoreIoDraft}
            restoreNonce={restoreNonce}
            restoreStep={urlRestoreStep}
            entryIntent={editingGeneration === 0 ? entryIntent : null}
            onDirtyChange={(dirty) => { if (isCurrentEditing()) setComposeDirty(dirty); }}
            flushDraftRef={flushDraftRef}
            onStepChange={(step) => { if (isCurrentEditing()) setComposeStep(step); }}
            onStatusChange={(status) => {
              if (!isCurrentEditing()) return;
              onStatusChange(status);
              setPanelRefreshNonce((n) => n + 1);
            }}
            onSubmitSuccess={() => {
              if (!isCurrentEditing()) return;
              setPanelRefreshNonce((n) => n + 1);
              onSubmitSuccess?.();
            }}
            onDraftSaved={(batchId, step, persistInUrl) => {
              if (!isCurrentEditing()) return;
              if (persistInUrl === false) {
                clearWarehouseDraftRestore(batchId, setRestoreIoDraft, restoredUrlDraftRef);
                return;
              }
              persistWarehouseDraftUrl(batchId, step);
            }}
          />
        ) : (
          <div className={`h-full overflow-y-auto px-3 pt-2 ${panelStyles.touchScope}`}>
            <WarehouseDraftPanelTabs
              layout="mobile"
              sectionTab={sectionTab}
              canSeeQueue={canSeeQueue}
              canSeeDeptQueue={canSeeDeptQueue}
              canSeeAsResearchQueue={canSeeAsResearchQueue}
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
                setSectionTab("compose");
                persistWarehouseDraftUrl(draft.batch_id, 4);
              }}
              bumpRefresh={() => setPanelRefreshNonce((n) => n + 1)}
              onSubmitSuccess={onSubmitSuccess}
              resetDraftTracking={() => {}}
              onCartCountChange={(n) => {
                setCartCount(n);
                if (operatorEmployeeId) cartCountCache.set(operatorEmployeeId, n);
              }}
              targetRequestId={targetRequestId}
            />
          </div>
        )}
      </div>

      <MobileDirtyLeaveSheet
        open={pendingTab !== null}
        onCancel={() => setPendingTab(null)}
        onConfirm={async () => {
          try {
            await flushDraftRef.current?.();
          } catch {
            return;
          }
          const next = pendingTab;
          endEditing();
          setPendingTab(null);
          setComposeDirty(false);
          if (next) { setSectionTab(next); setInboxOpen(false); }
        }}
        onDiscard={() => {
          endEditing();
          const next = pendingTab;
          setPendingTab(null);
          setComposeDirty(false);
          if (next) { setSectionTab(next); setInboxOpen(false); }
        }}
      />
    </div>
  );
}
