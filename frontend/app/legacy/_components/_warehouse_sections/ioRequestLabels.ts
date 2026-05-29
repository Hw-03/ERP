/** 입출고 요청 유형 표시 라벨 — DraftCartItemRow / WarehouseQueueRow / MyRequestRow 공용.
 *  단일 사전은 `frontend/lib/io/glossary.ts` (P0-1). 본 파일은 backward-compat re-export. */
import { REQUEST_TYPE_LABEL as _GLOSSARY_REQUEST_TYPE_LABEL } from "@/lib/io/glossary";

export const REQUEST_TYPE_LABEL: Record<string, string> = _GLOSSARY_REQUEST_TYPE_LABEL;
