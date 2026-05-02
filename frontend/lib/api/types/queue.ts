/**
 * Queue 도메인 타입 — `@/lib/api/types/queue`.
 * Round-10A (#2) 본문 이전.
 */

export type QueueBatchType = "PRODUCE" | "DISASSEMBLE" | "RETURN";
export type QueueBatchStatus = "OPEN" | "CONFIRMED" | "CANCELLED";
export type QueueLineDirection = "IN" | "OUT" | "SCRAP" | "LOSS";

export interface QueueLine {
  line_id: string;
  batch_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  direction: QueueLineDirection;
  quantity: number;
  bom_expected: number | null;
  reason: string | null;
  process_stage: string | null;
  included: boolean;
  created_at: string;
}

export interface QueueBatch {
  batch_id: string;
  batch_type: QueueBatchType;
  status: QueueBatchStatus;
  owner_employee_id: string | null;
  owner_name: string | null;
  parent_item_id: string | null;
  parent_item_name: string | null;
  parent_quantity: number | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  lines: QueueLine[];
}
