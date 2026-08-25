"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
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
import type { IoStep } from "../../_warehouse_v2/useIoWorkState";
import {
  clearWarehouseDraftRestore,
  parseWarehouseStep,
  persistWarehouseDraftUrl,
} from "../../_warehouse_v2/warehouseDraftUrl";
import { MobileIoComposeWizard } from "../warehouse/MobileIoComposeWizard";
import { MobileDirtyLeaveSheet } from "../warehouse/MobileDirtyLeaveSheet";
import { AsyncState } from "../primitives/AsyncState";
import panelStyles from "./mobileWarehousePanels.module.css";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { LEGACY_COLORS } from "@/lib/mes/color";

// 인수인계 수신 부서 — DesktopWarehouseView 와 동일 도메인 상수(미export 라 동일값 복제).
const HANDOVER_RECEIVE_DEPTS = ["고압", "진공"];

// 탭 전환 remount 사이 직전 카운트 보존 (세션 내 메모리 캐시) — DesktopWarehouseView 와 동일.
const cartCountCache = new Map<string, number>();
const warehouseQueueCountCache = { value: 0 };
const deptQueueCountCache = new Map<string, number>();

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
}) {
  const revision = useRealtimeRevision();
  const { employees, items, productModels, loadFailure, setItems } = useWarehouseData({
    globalSearch,
    onStatusChange,
  });

  const operator = typeof window !== "undefined" ? readCurrentOperator() : null;
  const [employeeId, setEmployeeId] = useState<string>(operator?.employee_id ?? "");
  const urlDraftId = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("draftId");
  const urlRestoreStep = typeof window === "undefined"
    ? undefined
    : parseWarehouseStep(new URLSearchParams(window.location.search).get("step"));
  const [sectionTab, setSectionTab] = useState<WarehouseSectionTab>("compose");
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
  // '이어서 하기' 클릭마다 증가 — 같은 draft 재선택에도 복원이 재발동하도록.
  const [restoreNonce, setRestoreNonce] = useState(0);
  const [composeStep, setComposeStep] = useState(1);
  const showSectionTabs = !(sectionTab === "compose" && composeStep >= 2);
  const [sectionTabsMounted, setSectionTabsMounted] = useState(showSectionTabs);
  const [handoverInboxCount, setHandoverInboxCount] = useState(0);
  // D2 — compose 작성 중(담은 묶음 있음) 다른 섹션 이탈 가드.
  const [composeDirty, setComposeDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<WarehouseSectionTab | null>(null);
  // 항목 16 — flush ref 는 상위(MobileShell)가 내려주면 공유, 없으면 로컬 사용(섹션 가드 단독 동작 보장).
  const localFlushRef = useRef<(() => Promise<void>) | null>(null);
  const flushDraftRef = externalFlushRef ?? localFlushRef;

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
  // 인수인계: 작성(튜브) 또는 인수 확인(받는 부서 소속)이면 탭 노출 — 데스크톱 동일. 결재권자는 제외.
  const canReceiveHandover = HANDOVER_RECEIVE_DEPTS.includes(operator?.department ?? "");
  const showHandover = (operator?.department ?? "") === "튜브" || canReceiveHandover;

  useEffect(() => {
    if (operator && employeeId === "") setEmployeeId(operator.employee_id);
  }, [operator, employeeId]);

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

  // compose 에서 작성 중인데 다른 섹션으로 이동하려 하면 확인 시트로 가드.
  function handleSectionChange(next: WarehouseSectionTab) {
    if (sectionTab === "compose" && next !== "compose" && composeDirty) {
      setPendingTab(next);
      return;
    }
    setSectionTab(next);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col px-3 pt-3">
        <WarehouseHeader loadFailure={loadFailure} />
        {sectionTabsMounted && (
          <div
            aria-hidden={!showSectionTabs}
            className={showSectionTabs ? "wt wo" : "wt wc"}
          >
            <WarehouseSectionTabs
              active={sectionTab}
              onChange={handleSectionChange}
              showQueue={canSeeQueue}
              showDeptQueue={canSeeDeptQueue}
              showHandover={showHandover}
              cartCount={cartCount}
              queueCount={warehouseQueueCount}
              deptQueueCount={deptQueueCount}
              handoverInboxCount={handoverInboxCount}
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {sectionTab === "compose" ? urlDraftPending ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            저장한 작업을 불러오는 중입니다.
          </div>
        ) : urlDraftRestoreError ? (
          <div role="alert" className="h-full overflow-y-auto px-4 py-6">
            <AsyncState
              loading={false}
              error={`${urlDraftRestoreError} 현재 작업 위치를 유지했습니다.`}
              onRetry={() => setUrlDraftRestoreNonce((value) => value + 1)}
            >
              {null}
            </AsyncState>
          </div>
        ) : (
          <MobileIoComposeWizard
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
            onDirtyChange={setComposeDirty}
            flushDraftRef={flushDraftRef}
            onStepChange={setComposeStep}
            onStatusChange={(status) => {
              onStatusChange(status);
              setPanelRefreshNonce((n) => n + 1);
            }}
            onSubmitSuccess={() => {
              setPanelRefreshNonce((n) => n + 1);
              onSubmitSuccess?.();
            }}
            onDraftSaved={(batchId, step, persistInUrl) => {
              if (persistInUrl === false) {
                clearWarehouseDraftRestore(batchId, setRestoreIoDraft, restoredUrlDraftRef);
                return;
              }
              persistWarehouseDraftUrl(batchId, step);
            }}
          />
        ) : (
          <div className={`h-full overflow-y-auto px-3 pb-6 ${panelStyles.touchScope}`}>
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
                setSectionTab("compose");
                persistWarehouseDraftUrl(draft.batch_id, defaultDraftStep(draft));
              }}
              bumpRefresh={() => setPanelRefreshNonce((n) => n + 1)}
              onSubmitSuccess={onSubmitSuccess}
              resetDraftTracking={() => {}}
              onCartCountChange={(n) => {
                setCartCount(n);
                if (operatorEmployeeId) cartCountCache.set(operatorEmployeeId, n);
              }}
            />
          </div>
        )}
      </div>

      <MobileDirtyLeaveSheet
        open={pendingTab !== null}
        onCancel={() => setPendingTab(null)}
        onConfirm={() => {
          flushDraftRef.current?.(); // 700ms 디바운스 창의 마지막 변경까지 즉시 저장
          const next = pendingTab;
          setPendingTab(null);
          setComposeDirty(false);
          if (next) setSectionTab(next);
        }}
        onDiscard={() => {
          // 항목 3-4 — 저장(flush) 없이 섹션 이동. compose 위저드는 언마운트되어 작성 내용이 폐기된다.
          const next = pendingTab;
          setPendingTab(null);
          setComposeDirty(false);
          if (next) setSectionTab(next);
        }}
      />
    </div>
  );
}

function defaultDraftStep(draft: IoBatch): IoStep {
  return draft.sub_type === "adjust_in"
    || draft.sub_type === "adjust_out"
    || draft.sub_type === "warehouse_adjust_in"
    || draft.sub_type === "warehouse_adjust_out"
    ? 3
    : 4;
}
