/**
 * 임시저장(draft) 복원 effect 추출.
 *
 * IoComposeView 에 인라인되어 있던 draftToRestore → state 복원 useEffect 를
 * 그대로 옮긴 것. 부수효과·실행 시점·의존성 배열은 원본과 동일하다.
 *
 * 공유 ref(restoredDraftRef/autosaveBatchIdRef)는 autosave/submit 경로와
 * 공유되므로 IoComposeView 가 소유하고 주입한다.
 */
import { useEffect, type MutableRefObject } from "react";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api";
import { deptIoDirectionOf } from "./ioWorkType";
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

export function useIoDraftRestore(params: {
  draftToRestore: IoBatch | null | undefined;
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
  getAvailable?: GetAvailable;
  inventorySnapshot?: unknown;
}) {
  const {
    draftToRestore,
    restoreNonce,
    restoredDraftRef,
    restoredNonceRef,
    autosaveBatchIdRef,
    state,
    onStatusChange,
    restoreStep,
    getAvailable,
    inventorySnapshot,
  } = params;

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
    state.setBundles(restoreInternalUseBundles(draftToRestore, getAvailable));
    state.goTo(restoreStep ?? 4);
    onStatusChange("임시저장 작업을 불러왔습니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToRestore?.batch_id, restoreNonce]);

  useEffect(() => {
    if (
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
  }, [draftToRestore?.batch_id, restoreNonce, inventorySnapshot]);
}
