/**
 * '창고에서 가져오기' 순수 로직.
 *
 * 생산(produce) 4단계에서 재고가 부족한 라인(included && shortage>0)을 모아
 * 창고 반출(warehouse_to_dept) 새 작업의 대상 item_id 목록으로 변환한다.
 *
 * - 선택(line_id 집합)이 비어 있으면 부족 라인 전체가 대상.
 * - 선택이 있으면 그 line_id 들 중 실제 부족 라인만 대상.
 * - 같은 item_id 는 1회로 dedupe (중복 반출 방지).
 *
 * UI 와 분리해 단위 테스트 가능하게 둔다.
 */
import type { IoBundle } from "./types";

/** included && shortage>0 인 라인들. */
export function shortageLines(bundles: IoBundle[]) {
  return bundles
    .flatMap((bundle) => bundle.lines)
    .filter((line) => line.included && line.shortage > 0);
}

/**
 * 부족 라인의 item_id 를 dedupe 해 반환.
 * @param selectedLineIds 선택된 line_id 집합. 비어 있으면 부족 라인 전체 대상.
 */
export function collectShortageItemIds(
  bundles: IoBundle[],
  selectedLineIds?: ReadonlySet<string>,
): string[] {
  const lines = shortageLines(bundles);
  const targets =
    selectedLineIds && selectedLineIds.size > 0
      ? lines.filter((line) => selectedLineIds.has(line.line_id))
      : lines;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of targets) {
    if (seen.has(line.item_id)) continue;
    seen.add(line.item_id);
    result.push(line.item_id);
  }
  return result;
}
