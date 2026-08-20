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
import type { IoBatch, IoBundle } from "@/lib/api";
import { deptIoDirectionOf } from "./ioWorkType";
import type { useIoWorkState } from "./useIoWorkState";
import type { IoStep } from "./useIoWorkState";

type IoWorkStateApi = ReturnType<typeof useIoWorkState>;

export function restoreInternalUseBundles(batch: IoBatch): IoBundle[] {
  if (
    batch.work_type !== "internal_use" ||
    batch.sub_type !== "internal_use_out"
  ) {
    return batch.bundles;
  }
  return batch.bundles.map((bundle) => ({
    ...bundle,
    internal_use_bom_mode:
      bundle.source_kind === "bom_parent" &&
      bundle.internal_use_bom_mode === undefined
        ? "children_only"
        : bundle.internal_use_bom_mode,
    source_location:
      bundle.source_location ??
      (bundle.lines.some((line) => line.from_bucket === "production")
        ? "department"
        : "warehouse"),
    lines: bundle.lines.map((line) => ({
      ...line,
      selected:
        line.selected ?? (line.bom_stock_exempt ? false : line.included),
    })),
  }));
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
    state.setBundles(restoreInternalUseBundles(draftToRestore));
    state.goTo(
      restoreStep
        ?? (draftToRestore.sub_type === "adjust_in"
          || draftToRestore.sub_type === "adjust_out"
          || draftToRestore.sub_type === "warehouse_adjust_in"
          || draftToRestore.sub_type === "warehouse_adjust_out"
          ? 3
          : 4),
    );
    onStatusChange("임시저장 작업을 불러왔습니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToRestore?.batch_id, restoreNonce]);
}
