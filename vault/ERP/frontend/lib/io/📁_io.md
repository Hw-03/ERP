---
type: folder-note
source_path: "frontend/lib/io"
importance: normal
layer: frontend
graph: hub
updated: 2026-06-24
project: DEXCOWIN MES
---

# 📁 io

## 이 폴더는 뭐예요?

입출고(IO) 화면 전용 **라벨 사전**입니다. "입고", "출고", "불량 격리" 같은 한글 표시가 화면 전체에서 일관되게 나오도록 단일 출처를 제공합니다.

## 주요 파일

| 파일 | 내용 |
|------|------|
| `glossary.ts` | 입출고 라벨 상수 + 헬퍼 함수 전체 |

## glossary.ts 주요 내용

| 상수 | 역할 |
|------|------|
| `WORK_TYPE_LABEL` | receive, warehouse_io, process, defect 등 작업 유형 한글 |
| `SUB_TYPE_LABEL` | receive_supplier, warehouse_to_dept, dept_to_warehouse, defect_quarantine 등 세부 유형 한글 |
| `TRANSACTION_TYPE_LABEL` | DB 거래 유형 한글 |
| `REQUEST_TYPE_LABEL` | 결재 요청 큐 유형 한글 |
| `BUCKET_LABEL` | warehouse, production, defective, none 위치 한글 |
| `SHIP_RULE` | PF 품목 + 창고 외부 이동 → "출하" 해석 규칙 |
| `interpretShipLabel()` | TransactionType + SHIP_RULE 조합으로 최종 라벨 결정 |

## 건드릴 때 조심할 점

- `SUB_TYPE_LABEL`의 키 값은 백엔드 `TransactionTypeEnum`과 정확히 일치해야 합니다. 불일치하면 화면에 라벨이 없는 빈칸이 뜹니다.
- `SHIP_RULE` 조건(PF 품목 + 창고 외부 이동)을 바꾸면 출하 라벨 해석이 달라집니다.

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/📁__warehouse_v2]] — 이 사전을 사용하는 입출고 V2 UI
- [[ERP/backend/app/models/stock_request.py]] — 백엔드 TransactionTypeEnum 원천
