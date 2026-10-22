/** CP1 정적 계약 검사. tsc --noEmit으로만 검사하며 실행하지 않는다. */
import type { IoReservedDraftPayload } from "../types/io";
import type { AdminWorkReservationCancelPayload, WorkInventoryEffect } from "../types/work-reservations";
import type { StockRequestRevertPayload } from "../types/stock-requests";

declare function acceptsDraft(payload: IoReservedDraftPayload): void;
declare function acceptsCancel(payload: AdminWorkReservationCancelPayload): void;
declare function acceptsEffect(effect: WorkInventoryEffect): void;
declare function acceptsRevert(payload: StockRequestRevertPayload): void;

acceptsRevert({ actor_employee_id: "employee-1", pin: "test", expected_revision: 7 });
// @ts-expect-error 요청 수정도 연결 작업의 관측 버전을 반드시 전달한다.
acceptsRevert({ actor_employee_id: "employee-1", pin: "test" });

const base = { requester_employee_id: "employee-1", work_type: "process" as const, sub_type: "produce" as const, bundles: [] };
acceptsDraft({ ...base, client_request_id: "create-1" });
acceptsDraft({ ...base, batch_id: "batch-1", expected_revision: 7 });
// @ts-expect-error 기존 작업 수정은 버전이 필수다.
acceptsDraft({ ...base, batch_id: "batch-1" });
// @ts-expect-error 신규 생성은 안정된 생성 키가 필수다.
acceptsDraft(base);
// @ts-expect-error 신규 생성에 기존 작업 버전을 혼합하지 않는다.
acceptsDraft({ ...base, client_request_id: "create-1", expected_revision: 7 });
acceptsCancel({ expected_revision: 7, reason: "작업 취소" });
// @ts-expect-error 취소는 버전과 사유가 모두 필수다.
acceptsCancel({ reason: "작업 취소" });
const item = { item_id: "item-1", item_name: "가상 부품", mes_code: null, unit: "EA",
  effect_id: "effect-1", operation_line_id: "line-1", bundle_id: "bundle-1", quantity: 1 };
acceptsEffect({ ...item, kind: "move", from: { bucket: "warehouse", department: null }, to: { bucket: "production", department: "조립" } });
// @ts-expect-error 불량 출발은 신규 작업 예약 대상이 아니다.
acceptsEffect({ ...item, kind: "out", from: { bucket: "defective", department: "조립" }, to: null });
// @ts-expect-error 입고 효과는 출발 셀을 가지지 않는다.
acceptsEffect({ ...item, kind: "in", from: { bucket: "warehouse", department: null }, to: { bucket: "production", department: "조립" } });
