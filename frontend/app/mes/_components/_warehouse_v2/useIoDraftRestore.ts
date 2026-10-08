/**
 * 임시저장(draft) 복원 effect 추출.
 *
 * IoComposeView 에 인라인되어 있던 draftToRestore → state 복원 useEffect 를
 * 공통 입력과 URL 단계를 복원하고, 원자재 업체의 활성 상태를 다시 확인한다.
 *
 * 공유 ref(restoredDraftRef/autosaveBatchIdRef)는 autosave/submit 경로와
 * 공유되므로 IoComposeView 가 소유하고 주입한다.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { api, type IoBatch, type IoBundle, type IoLine } from "@/lib/api";
import { deptIoDirectionOf, exclusionNoteFor, isMaterialWorkType, isValidTubeMaterialItem } from "./ioWorkType";
import type { useIoWorkState } from "./useIoWorkState";
import type { IoStep } from "./useIoWorkState";

type IoWorkStateApi = ReturnType<typeof useIoWorkState>;

type GetAvailable = (line: IoLine) => number | null;

function isOutgoingLine(line: IoLine): boolean {
  return (
    line.direction === "out" ||
    line.direction === "move" ||
    line.direction === "defective" ||
    (line.direction === "adjust" &&
      (line.from_bucket === "warehouse" || line.from_bucket === "production"))
  );
}

export function refreshInternalUseBomShortages(
  bundles: IoBundle[],
  getAvailable: GetAvailable,
): IoBundle[] {
  let changed = false;
  const next = bundles.map((bundle) => {
    let bundleChanged = false;
    const lines = bundle.lines.map((line) => {
      if (bundle.source_kind !== "bom_parent" || line.origin !== "bom_auto") {
        return line;
      }
      const available = getAvailable(line);
      if (available === null) return line;
      const shortage =
        line.included && isOutgoingLine(line)
          ? Math.max(0, Number(line.quantity) - available)
          : 0;
      if (shortage === line.shortage) return line;
      bundleChanged = true;
      changed = true;
      return { ...line, shortage };
    });
    return bundleChanged ? { ...bundle, lines } : bundle;
  });
  return changed ? next : bundles;
}

export function restoreInternalUseBundles(
  batch: IoBatch,
  getAvailable?: GetAvailable,
): IoBundle[] {
  if (
    batch.work_type !== "internal_use" ||
    batch.sub_type !== "internal_use_out"
  ) {
    return batch.bundles;
  }
  return batch.bundles.map((bundle) => {
    const mode =
      bundle.source_kind === "bom_parent" &&
      bundle.internal_use_bom_mode === undefined
        ? "children_only"
        : bundle.internal_use_bom_mode;
    return {
      ...bundle,
      internal_use_bom_mode: mode,
      source_location:
        bundle.source_location ??
        (bundle.lines.some((line) => line.from_bucket === "production")
          ? "department"
          : "warehouse"),
      lines: bundle.lines.map((line) => {
        const selected =
          line.selected ?? (line.bom_stock_exempt ? false : line.included);
        if (
          bundle.source_kind !== "bom_parent" ||
          line.origin !== "bom_auto" ||
          line.bom_expected == null
        ) {
          return { ...line, selected };
        }
        const expected = Number(line.bom_expected) || 0;
        const stockExempt = Boolean(line.bom_stock_exempt);
        const noChange = mode !== "parent_and_children" && !selected && !stockExempt;
        const quantity = noChange ? 0 : expected;
        const included = stockExempt
          ? false
          : mode === "parent_and_children" && !selected
            ? true
            : selected;
        const available = getAvailable?.(line) ?? null;
        const shortage =
          included && isOutgoingLine(line) && available !== null
            ? Math.max(0, quantity - available)
            : 0;
        return {
          ...line,
          quantity,
          included,
          selected,
          edited: false,
          shortage,
          exclusion_note: stockExempt
            ? line.exclusion_note
            : !selected
              ? mode === "parent_and_children"
                ? "소속 부서 재입고"
                : "변동 없음"
              : null,
        };
      }),
    };
  });
}

/** 오래된 창고 입출고 초안의 제외 상태를 현재 수량 규칙으로 맞춘다. */
export function normalizeWarehouseIoDraftBundles(bundles: IoBundle[]): IoBundle[] {
  return bundles.map((bundle) => ({
    ...bundle,
    lines: bundle.lines.map((line) => {
      if (line.included && Number(line.quantity) > 0) return line;
      return {
        ...line,
        quantity: 0,
        included: false,
        edited: line.origin === "bom_auto" ? true : line.edited,
        shortage: 0,
        exclusion_note: exclusionNoteFor("warehouse_to_dept", line.origin, false),
      };
    }),
  }));
}

export function useIoDraftRestore(params: {
  draftToRestore: IoBatch | null | undefined;
  employeeId?: string;
  /** '이어서 하기' 클릭마다 증가하는 토큰. 같은 draft(batch_id 불변)를 다시 골라도
   *  nonce 가 바뀌면 복원이 재발동한다. */
  restoreNonce?: number;
  restoredDraftRef: MutableRefObject<string | null>;
  /** 마지막으로 복원을 발동시킨 nonce. 같은 nonce 재실행(strict mode 등) 은 1회로 흡수. */
  restoredNonceRef: MutableRefObject<number | null>;
  autosaveBatchIdRef: MutableRefObject<string | null>;
  state: IoWorkStateApi;
  onStatusChange: (status: string) => void;
  restoreStep?: IoStep;
  canRestore?: boolean;
  getAvailable?: GetAvailable;
  inventorySnapshot?: unknown;
}) {
  const {
    draftToRestore,
    employeeId,
    restoreNonce,
    restoredDraftRef,
    restoredNonceRef,
    autosaveBatchIdRef,
    state,
    onStatusChange,
    restoreStep,
    canRestore = true,
    getAvailable,
    inventorySnapshot,
  } = params;
  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  useEffect(() => {
    if (!draftToRestore) return;
    const nonce = restoreNonce ?? null;
    // 같은 nonce 로의 재실행은 1회만. nonce 가 없으면(레거시) batch_id 변화 기준으로 폴백.
    if (nonce !== null) {
      if (restoredNonceRef.current === nonce) return;
    } else if (restoredDraftRef.current === draftToRestore.batch_id) {
      return;
    }
    restoredNonceRef.current = nonce;
    restoredDraftRef.current = draftToRestore.batch_id;
    if (!canRestore) {
      onStatusChange("권한이 없는 작업 유형의 임시저장은 불러올 수 없습니다.");
      return;
    }
    autosaveBatchIdRef.current = draftToRestore.batch_id;
    state.setWorkType(draftToRestore.work_type);
    state.setSubType(draftToRestore.sub_type);
    if (
      draftToRestore.work_type === "process" ||
      draftToRestore.work_type === "warehouse_adjust"
    ) {
      const dir = deptIoDirectionOf(draftToRestore.sub_type);
      state.setDeptIoDirectionRaw(dir);
    }
    state.setFromDepartment(draftToRestore.from_department || state.fromDepartment);
    state.setToDepartment(draftToRestore.to_department || state.toDepartment);
    state.setReferenceNo(draftToRestore.reference_no || "");
    state.setNotes(draftToRestore.notes || "");
    state.setReasonCategory(draftToRestore.reason_category ?? "", draftToRestore.reason_category_id ?? null);
    state.setSupplier(
      draftToRestore.supplier_id
        ? { supplier_id: draftToRestore.supplier_id, name: draftToRestore.supplier_name_snapshot ?? "" }
        : null,
    );
    const restoredBundles = restoreInternalUseBundles(draftToRestore, getAvailable);
    state.setBundles(
      draftToRestore.work_type === "warehouse_io"
        ? normalizeWarehouseIoDraftBundles(restoredBundles)
        : restoredBundles,
    );
    state.goTo(restoreStep ?? 4);
    onStatusChange(
      draftToRestore.department_routes_normalized
        ? "품목코드 기준으로 부서 경로를 자동 갱신했습니다."
        : "임시저장 작업을 불러왔습니다.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToRestore?.batch_id, restoreNonce, canRestore]);

  // 업체 화면을 거치지 않는 복원도 활성 업체를 확인한다. URL 단계 변경으로 재복원하지 않는다.
  useEffect(() => {
    if (!canRestore || !draftToRestore || !isMaterialWorkType(draftToRestore.work_type)) return;
    let cancelled = false;
    state.setSupplierSelectionReady(false);
    const targetStep = restoreStep ?? 4;
    const scope = draftToRestore.work_type === "tube_material" ? "tube" : "warehouse";
    const itemIds = scope === "tube" ? [...new Set(draftToRestore.bundles.flatMap((bundle) => [bundle.source_item_id, ...bundle.lines.filter((line) => line.included).map((line) => line.item_id)]).filter((id): id is string => Boolean(id)))] : [];
    void Promise.all([
      api.listSuppliers(employeeId ?? draftToRestore.requester_employee_id, true, scope),
      Promise.all(itemIds.map((id) => api.getItem(id))),
    ]).then(([suppliers, restoredItems]) => {
      if (cancelled || latestStateRef.current.workType !== draftToRestore.work_type || latestStateRef.current.selectedSupplierId !== (draftToRestore.supplier_id ?? null)) return;
      const supplier = suppliers.find((row) => row.supplier_id === draftToRestore.supplier_id && row.is_active && (row.scope ?? "warehouse") === scope);
      state.setSupplier(supplier ?? null);
      state.setSupplierSelectionReady(true);
      if (!supplier) {
        state.goTo(2);
        onStatusChange("활성 공급업체를 다시 선택하세요.");
      } else if (scope === "tube" && (restoredItems.some((item) => !isValidTubeMaterialItem(item)) || draftToRestore.bundles.some((bundle) => bundle.source_kind !== "direct_item"))) {
        state.setBundles([]);
        state.goTo(3);
        onStatusChange("사용 가능한 튜브 원자재를 다시 선택하세요.");
      } else if (latestStateRef.current.step === 2 || latestStateRef.current.step === targetStep) {
        state.goTo(targetStep);
      }
    }).catch((error: unknown) => {
      if (cancelled || latestStateRef.current.workType !== draftToRestore.work_type) return;
      state.goTo(2);
      onStatusChange(error instanceof Error ? error.message : "공급업체 정보를 확인하지 못했습니다.");
    });
    return () => { cancelled = true; };
    // restoreStep/state는 URL·복원 렌더마다 바뀌어도 최초 복원 요청만 유지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToRestore?.batch_id, restoreNonce, canRestore, employeeId]);

  useEffect(() => {
    if (
      !canRestore ||
      !draftToRestore ||
      draftToRestore.work_type !== "internal_use" ||
      draftToRestore.sub_type !== "internal_use_out" ||
      restoredDraftRef.current !== draftToRestore.batch_id ||
      !getAvailable
    ) {
      return;
    }
    state.setBundles((bundles) =>
      refreshInternalUseBomShortages(bundles, getAvailable),
    );
    // 재고 스냅샷이 늦게 준비될 때 부족분만 갱신한다. state/getAvailable은 렌더마다
    // 바뀔 수 있어 의존성에 넣지 않고, 실제 재고 스냅샷 변경을 실행 신호로 사용한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToRestore?.batch_id, restoreNonce, canRestore, inventorySnapshot]);
}
