/**
 * 입출고 BOM 비례 동기화 — 순수 함수.
 *
 * IoComposeView 의 IoBundleCart 핸들러(onToggleLine/onQuantityChange/
 * onBundleQuantityChange)에 인라인되어 있던 bundles 재계산 로직을 그대로
 * 추출한 것. 알고리즘은 원본과 바이트 동일하며 부수효과가 없다.
 *
 * getAvailable 은 IoComposeView 클로저(현재 items 의존)이므로 인자로 주입한다.
 */
import type { IoBundle, IoLine, IoSubType } from "./types";
import { exclusionNoteFor, isBomForced } from "./ioWorkType";

type GetAvailable = (line: IoLine) => number | null;
const BOM_STOCK_EXEMPT_NOTE = "BOM 재고 미반영";

function isBomStockExempt(line: IoLine): boolean {
  return line.origin === "bom_auto" && Boolean(line.bom_stock_exempt);
}

function expectedBomChildQuantity(bundle: IoBundle, line: IoLine, parentQuantity: number): number {
  const bundleQuantity = Number(bundle.quantity) || 0;
  const initialExpected = Number(line.bom_expected) || 0;
  if (bundleQuantity <= 0) return 0;
  return parentQuantity * (initialExpected / bundleQuantity);
}

/** 출발 재고를 차감하는 라인만 부족 여부를 계산한다. */
function shortageForQuantity(line: IoLine, quantity: number, available: number | null): number {
  if (line.from_bucket === "none" || available === null) return 0;
  return Math.max(0, quantity - available);
}

/**
 * 라인 체크 토글. 부모(direct) 토글이면 같은 묶음의 활성 bom_auto 자식도 함께 토글.
 * (IoComposeView onToggleLine 의 setBundles updater 원본)
 */
export function applyToggleLine(
  bundles: IoBundle[],
  bundleId: string,
  lineId: string,
  subType: IoSubType,
  getAvailable: GetAvailable,
): IoBundle[] {
  return bundles.map((bundle) => {
    if (bundle.bundle_id !== bundleId) return bundle;
    const target = bundle.lines.find((l) => l.line_id === lineId);
    if (!target) return bundle;
    if (isBomStockExempt(target)) return bundle;
    const isForcedBomChild =
      isBomForced(subType) &&
      target.origin === "bom_auto" &&
      target.bom_expected != null &&
      Number(target.bom_expected) > 0;
    if (isForcedBomChild) {
      const newIncluded = !target.included;
      return {
        ...bundle,
        lines: bundle.lines.map((line) =>
          line.line_id === lineId
            ? {
                ...line,
                quantity: newIncluded ? 1 : 0,
                included: newIncluded,
                edited: !newIncluded,
                shortage: 0,
                exclusion_note: exclusionNoteFor(subType, line.origin, newIncluded),
              }
            : line,
        ),
      };
    }
    const isParentToggle = target.origin === "direct";
    const newIncluded = !target.included;
    return {
      ...bundle,
      lines: bundle.lines.map((line) => {
        const shouldSync =
          line.line_id === lineId ||
          (isParentToggle &&
            line.origin === "bom_auto" &&
            !isBomStockExempt(line) &&
            line.bom_expected != null &&
            Number(line.bom_expected) > 0);
        if (!shouldSync) return line;
        const avail = getAvailable(line);
        return {
          ...line,
          included: newIncluded,
          shortage: newIncluded
            ? shortageForQuantity(line, line.quantity, avail)
            : 0,
          exclusion_note: exclusionNoteFor(subType, line.origin, newIncluded),
        };
      }),
    };
  });
}

/**
 * 라인 수량 변경. 상위(direct) 변경 시 같은 묶음의 bom_auto 자식을 비례 재계산
 * 재고 미반영 또는 미편집 자식만 비례 동기화한다. 그 외는 단순 갱신.
 * (IoComposeView onQuantityChange 의 setBundles updater 원본)
 */
export function applyLineQuantityChange(
  bundles: IoBundle[],
  bundleId: string,
  lineId: string,
  quantity: number,
  shortage: number,
  subType: IoSubType,
  getAvailable: GetAvailable,
): IoBundle[] {
  return bundles.map((bundle) => {
    if (bundle.bundle_id !== bundleId) return bundle;
    const target = bundle.lines.find((l) => l.line_id === lineId);
    if (!target) return bundle;
    // 상위(direct) 수량 변경 → 같은 bundle 내 미편집 bom_auto 하위만 비례 재계산.
    // 직접 편집한 하위는 상위 변경에도 보존하며, 상위가 0이면 모두 초기화한다.
    if (target.origin === "direct") {
      const parentIncluded = quantity > 0;
      return {
        ...bundle,
        lines: bundle.lines.map((line) => {
          if (line.line_id === lineId) {
            // 수량 0 → 자동 체크 해제 (qty=0 included 라인은 hasInvalidQuantity 로 submit 차단됨)
            return {
              ...line,
              quantity,
              shortage,
              included: parentIncluded,
              edited: false,
              exclusion_note: parentIncluded ? line.exclusion_note : exclusionNoteFor(subType, line.origin, false),
            };
          }
          if (
            line.origin === "bom_auto" &&
            line.bom_expected != null &&
            Number(line.bom_expected) > 0 &&
            (isBomStockExempt(line) || quantity === 0 || !line.edited)
          ) {
            const childQty = expectedBomChildQuantity(bundle, line, quantity);
            if (isBomStockExempt(line)) {
              return {
                ...line,
                quantity: childQty,
                shortage: 0,
                included: false,
                edited: false,
                exclusion_note: BOM_STOCK_EXEMPT_NOTE,
              };
            }
            const childAvail = getAvailable(line);
            const childIncluded = childQty > 0;
            const childShortage =
              !childIncluded
                ? 0
                : shortageForQuantity(line, childQty, childAvail);
            return {
              ...line,
              quantity: childQty,
              shortage: childShortage,
              included: childIncluded,
              edited: false,
              exclusion_note: childIncluded ? line.exclusion_note : exclusionNoteFor(subType, line.origin, false),
            };
          }
          return line;
        }),
      };
    }
    if (isBomStockExempt(target)) return bundle;
    // 그 외 (단품/수동): 기존 단순 업데이트 + qty 0 자동 체크 해제
    return {
      ...bundle,
      lines: bundle.lines.map((line) => {
        if (line.line_id !== lineId) return line;
        const nowIncluded = quantity > 0;
        return {
          ...line,
          quantity,
          shortage: nowIncluded ? shortage : 0,
          included: nowIncluded,
          exclusion_note: nowIncluded ? line.exclusion_note : exclusionNoteFor(subType, line.origin, false),
          edited:
            line.bom_expected !== null
              ? Math.abs(
                quantity - expectedBomChildQuantity(
                  bundle,
                  line,
                  Number(bundle.lines.find((candidate) => candidate.origin === "direct")?.quantity) || 0,
                ),
              ) > 0.0001
              : line.origin === "manual" || line.edited,
        };
      }),
    };
  });
}

/**
 * 묶음 기준수량 변경. 부모 라인 없는 BOM 묶음(창고 입출고)에서 미편집 자식을
 * per-unit 비례 재계산.
 * (IoComposeView onBundleQuantityChange 의 setBundles updater 원본)
 */
export function applyBundleQuantityChange(
  bundles: IoBundle[],
  bundleId: string,
  newQty: number,
  subType: IoSubType,
  getAvailable: GetAvailable,
): IoBundle[] {
  return bundles.map((bundle) => {
    if (bundle.bundle_id !== bundleId) return bundle;
    // 부모 라인이 없는 BOM 묶음(창고 입출고) — 기준 수량 변경 시 미편집 자식 라인을
    // 원본 per-unit 비례로 재계산. bom_expected 는 preview 시점(parent_qty=1) 값이라
    // 그대로 per-unit ratio 로 사용 가능.
    return {
      ...bundle,
      quantity: newQty,
      lines: bundle.lines.map((line) => {
        if (
          line.origin === "bom_auto" &&
          line.bom_expected != null &&
          Number(line.bom_expected) > 0 &&
          (isBomStockExempt(line) || newQty === 0 || !line.edited)
        ) {
          // bundle.quantity 는 stepper 의 현재값이라 호출마다 바뀐다.
          // preview(parent_qty=1)의 bom_expected 를 1개당 기준으로 직접 곱한다.
          const childQty = newQty * Number(line.bom_expected);
          if (isBomStockExempt(line)) {
            return {
              ...line,
              quantity: childQty,
              shortage: 0,
              included: false,
              edited: false,
              exclusion_note: BOM_STOCK_EXEMPT_NOTE,
            };
          }
          const childAvail = getAvailable(line);
          const childIncluded = childQty > 0;
          const childShortage =
            !childIncluded
              ? 0
              : shortageForQuantity(line, childQty, childAvail);
          return {
            ...line,
            quantity: childQty,
            shortage: childShortage,
            included: childIncluded,
            edited: false,
            exclusion_note: childIncluded ? line.exclusion_note : exclusionNoteFor(subType, line.origin, false),
          };
        }
        return line;
      }),
    };
  });
}
