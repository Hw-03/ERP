import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DependencyList,
  type MutableRefObject,
} from "react";
import type { IoSubmitResponse, Item } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import type { IoBundle } from "./types";
import type { IoSubType, IoWorkType } from "./types";
import { approvalKind, ioDepartmentPayload } from "./ioWorkType";
import {
  buildInternalUseBomPreviewTarget,
  hasUnselectedInternalUseBomMode,
  isInternalUseBomBundle,
} from "./internalUseBom";

export interface IoOperationRefs {
  generation: MutableRefObject<number>;
  contentRevision: MutableRefObject<number>;
}

type OperationVersion = readonly [generation: number, contentRevision: number];

export function useIoComposeOperationState(
  contentDependencies: DependencyList,
  restoredDraftId: string | undefined,
  restoreNonce: number | undefined,
) {
  const [pullSelected, setPullSelected] = useState<Set<string>>(() => new Set());
  const [pulling, setPulling] = useState(false);
  const pullingRef = useRef(false);
  const refs: IoOperationRefs = {
    generation: useRef(0),
    contentRevision: useRef(0),
  };

  useLayoutEffect(() => {
    refs.contentRevision.current += 1;
    // 의존성은 두 작성 화면이 넘기는 실제 작업 내용 목록이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pullSelected, ...contentDependencies]);

  useEffect(() => {
    refs.generation.current += 1;
  }, [refs.generation, restoredDraftId, restoreNonce]);

  useEffect(() => () => {
    refs.generation.current += 1;
  }, [refs.generation]);

  function togglePull(lineId: string) {
    setPullSelected((previous) => {
      const next = new Set(previous);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function bumpGeneration() {
    refs.generation.current += 1;
  }

  return [
    pullSelected,
    setPullSelected,
    togglePull,
    pulling,
    setPulling,
    pullingRef,
    refs,
    bumpGeneration,
  ] as const;
}

export function captureIoOperation(refs: IoOperationRefs): OperationVersion {
  return [refs.generation.current, refs.contentRevision.current];
}

export function isCurrentIoOperation(
  refs: IoOperationRefs,
  [generation, contentRevision]: OperationVersion,
): boolean {
  return refs.generation.current === generation
    && refs.contentRevision.current === contentRevision;
}

export async function saveCompositionDraft(
  refs: IoOperationRefs,
  waitForIdle: () => Promise<void>,
  getBundles: () => IoBundle[],
  save: (bundles: IoBundle[]) => Promise<{ batch_id: string }>,
  retainBatchId: (batchId: string) => void,
): Promise<string | null> {
  const version = captureIoOperation(refs);
  await waitForIdle();
  if (!isCurrentIoOperation(refs, version)) return null;
  const bundles = getBundles();
  if (bundles.length === 0) return null;
  try {
    const response = await save(bundles);
    if (refs.generation.current !== version[0]) return null;
    retainBatchId(response.batch_id);
    return isCurrentIoOperation(refs, version) ? response.batch_id : null;
  } catch (error) {
    if (!isCurrentIoOperation(refs, version)) return null;
    throw error;
  }
}

export async function runWarehousePull(
  refs: IoOperationRefs,
  pullingRef: MutableRefObject<boolean>,
  setPulling: (pulling: boolean) => void,
  itemIds: string[],
  saveOriginalDraft: () => Promise<string | null>,
  previewItem: (itemId: string) => Promise<IoBundle[]>,
  complete: (savedDraftId: string, bundles: IoBundle[]) => void,
): Promise<void> {
  if (pullingRef.current || itemIds.length === 0) return;
  const version = captureIoOperation(refs);
  pullingRef.current = true;
  setPulling(true);
  try {
    const savedDraftId = await saveOriginalDraft();
    if (!savedDraftId || !isCurrentIoOperation(refs, version)) return;
    const bundles: IoBundle[] = [];
    for (const itemId of itemIds) {
      bundles.push(...await previewItem(itemId));
      if (!isCurrentIoOperation(refs, version)) return;
    }
    complete(savedDraftId, bundles);
  } catch (error) {
    if (!isCurrentIoOperation(refs, version)) return;
    throw error;
  } finally {
    pullingRef.current = false;
    setPulling(false);
  }
}

export async function refreshInternalUseBundle(
  bundleId: string,
  options: Parameters<typeof buildInternalUseBomPreviewTarget>[1],
  employeeId: string,
  workType: IoWorkType,
  subType: IoSubType,
  fromDepartment: string,
  toDepartment: string,
  getBundles: () => IoBundle[],
  runLocked: (bundleId: string, work: () => Promise<void>) => Promise<unknown>,
  preview: (options: {
    employeeId: string;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    target: ReturnType<typeof buildInternalUseBomPreviewTarget>;
  }) => Promise<{ bundles: IoBundle[] }>,
  commit: (bundles: IoBundle[]) => void,
  setError: (message: string | null) => void,
): Promise<void> {
  const bundle = getBundles().find((row) => row.bundle_id === bundleId);
  if (subType !== "internal_use_out" || !bundle || !isInternalUseBomBundle(bundle)) return;
  await runLocked(bundleId, async () => {
    setError(null);
    try {
      const departments = ioDepartmentPayload(subType, fromDepartment, toDepartment);
      const replacement = (await preview({
        employeeId,
        workType,
        subType,
        fromDepartment: departments.fromDepartment,
        toDepartment: departments.toDepartment,
        target: buildInternalUseBomPreviewTarget(bundle, options),
      })).bundles[0];
      if (!replacement) throw new Error("사용출고 BOM 미리보기 결과가 없습니다.");
      commit(getBundles().map((row) => row.bundle_id === bundleId ? replacement : row));
    } catch (error) {
      setError(error instanceof Error ? error.message : "사용출고 BOM 재계산에 실패했습니다.");
    }
  });
}

async function submitComposition(
  subType: IoSubType,
  fromDepartment: string,
  bundles: IoBundle[],
  draftIdRef: MutableRefObject<string | null>,
  deleteDraft: (draftId: string) => Promise<void>,
  submit: (bundles: IoBundle[]) => Promise<IoSubmitResponse>,
): Promise<{ response: IoSubmitResponse; title: string }> {
  if (draftIdRef.current) {
    const staleId = draftIdRef.current;
    draftIdRef.current = null;
    try {
      await deleteDraft(staleId);
    } catch {
      // 이미 없거나 권한이 변동되어도 본 제출은 계속한다.
    }
  }
  try {
    const fallbackKind = approvalKind(subType, bundles, fromDepartment);
    const response = await submit(bundles);
    const requests = response.stock_requests ?? [];
    const responseKind = requests[0]?.approval_kind ?? fallbackKind;
    const title = response.requires_approval
      ? subType === "internal_use_out" && requests.length > 1
        ? "위치별 결재 요청 완료"
        : responseKind === "department"
          ? "부서 결재 요청 완료"
          : "창고 결재 요청 완료"
      : "입출고 반영 완료";
    return { response, title };
  } catch (error) {
    if (error instanceof ApiError && error.isUnavailable) {
      throw new Error("서버가 다른 작업을 처리 중입니다. 잠시 후 다시 시도하세요.");
    }
    throw error;
  }
}

export async function runCompositionSubmit(
  employeeId: string,
  subType: IoSubType,
  fromDepartment: string,
  waitForIdle: () => Promise<void>,
  getBundles: () => IoBundle[],
  draftIdRef: MutableRefObject<string | null>,
  deleteDraft: (draftId: string) => Promise<void>,
  submit: (bundles: IoBundle[]) => Promise<IoSubmitResponse>,
  setError: (message: string) => void,
  goTo: (step: 4) => void,
  setResult: (result: { kind: "success" | "error"; title: string; message: string }) => void,
  reset: () => void,
  resetFilters: () => void,
  onStatusChange: (message: string) => void,
  refreshItems: () => Promise<Item[]>,
  setItems: (items: Item[]) => void,
  onSubmitSuccess?: () => void,
): Promise<void> {
  if (!employeeId) {
    setError("작업자를 선택하세요.");
    return;
  }
  await waitForIdle();
  const bundles = getBundles();
  if (subType === "internal_use_out" && hasUnselectedInternalUseBomMode(bundles)) {
    setError("각 BOM 묶음의 차감 방식을 선택하세요.");
    goTo(4);
    return;
  }
  try {
    const { response, title } = await submitComposition(
      subType,
      fromDepartment,
      bundles,
      draftIdRef,
      deleteDraft,
      submit,
    );
    setResult({ kind: "success", title, message: response.message });
    reset();
    resetFilters();
    onStatusChange(response.message);
    try {
      setItems(await refreshItems());
    } catch {
      // 제출은 성공했으므로 후속 목록 갱신 실패는 무시한다.
    }
    onSubmitSuccess?.();
  } catch (error) {
    const message = error instanceof Error ? error.message : "제출 중 오류가 발생했습니다.";
    setResult({ kind: "error", title: "제출 실패", message });
  }
}
