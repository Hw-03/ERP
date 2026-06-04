/**
 * 인수인계서 도메인 타입 — `@/lib/api/types/handover`.
 */

export type HandoverStatus = "draft" | "submitted" | "received";

export interface HandoverLine {
  line_id: string;
  item_id: string;
  item_name_snapshot: string;
  mes_code_snapshot: string | null;
  quantity: number;
}

export interface Handover {
  handover_id: string;
  handover_code: string | null;
  status: HandoverStatus;
  author_employee_id: string;
  author_name: string;
  from_department: string;
  to_department: string;
  title: string;
  process_content: string | null;
  product_name: string | null;
  doc_date: string | null;
  analysis_text: string | null;
  notes: string | null;
  received_by_employee_id: string | null;
  received_by_name: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
  lines: HandoverLine[];
}

export interface HandoverLineCreate {
  item_id: string;
  quantity: number;
}

export interface HandoverCreatePayload {
  author_employee_id: string;
  to_department: string;
  title: string;
  process_content?: string | null;
  product_name?: string | null;
  doc_date?: string | null;
  analysis_text?: string | null;
  notes?: string | null;
  lines: HandoverLineCreate[];
}

export interface HandoverReceivePayload {
  actor_employee_id: string;
  pin: string;
}
