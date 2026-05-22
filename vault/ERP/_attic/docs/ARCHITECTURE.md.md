---
type: file-explanation
source_path: "_attic/docs/ARCHITECTURE.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ARCHITECTURE.md — ARCHITECTURE.md 설명

## 이 파일은 무엇을 책임지나

`ARCHITECTURE.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `아키텍처 개요`
- `스택`
- `폴더 구조 (운영에 의미 있는 부분만)`
- `백엔드 레이어`
- `재고 3-bucket 모델`
- `주요 엔드포인트`
- `프론트 레이어`
- `입출고 wizard 흐름 (5단계)`
- `공용 UI 부품 (`_components/common/`)`
- `책임 분리 진행 상황 (2026-04-25 기준)`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 아키텍처 개요

이 문서는 다음 사람이 한 시간 안에 코드 구조를 머리에 넣을 수 있도록 쓴 짧은 안내서다.

## 스택

- 백엔드: Python 3.13 · FastAPI · SQLAlchemy · SQLite (WAL)
- 프론트엔드: Next.js 14 (App Router) · React · Tailwind · TypeScript strict

## 폴더 구조 (운영에 의미 있는 부분만)

```
ERP/
├── backend/
│   └── app/
│       ├── main.py                  # 라우터 등록, /health, CORS
│       ├── database.py              # SQLite + WAL, get_db
│       ├── models.py                # SQLAlchemy 모델 + 16 enum (621줄)
│       ├── schemas.py               # Pydantic 요청/응답 (40+ 모델)
│       ├── routers/
│       │   ├── inventory.py         # 입출고/이동/불량/CSV·XLSX (~810줄)
│       │   ├── items.py             # 품목 CRUD (~430줄)
│       │   ├── production.py        # 생산 입고 + BOM 자동 차감
│       │   ├── queue.py             # 큐 배치 생성/확정/취소
│       │   ├── bom.py / codes.py / employees.py / alerts.py
│       └── services/
│           ├── inventory.py         # 입출고 비즈니스 로직 (445줄, 12 함수)
│           ├── stock_math.py        # 재고 계산 일원화 (151줄)
│           ├── _tx.py               # commit_and_refresh / commit_only helper
│           ├── export_helpers.py    # CSV StreamingResponse helper
│           ├── bom.py / codes.py / queue.py / integrity.py
├── frontend/
│   ├── lib/api.ts                   # 백엔드 API 클라이언트
│   └── app/
│       ├── legacy/                  # 주 사용 화면(/legacy)
│       │   ├── _components/
│       │   │   ├── DesktopLegacyShell.tsx
│       │   │   ├── DesktopSidebar.tsx
│       │   │   ├── DesktopTopbar.tsx
│       │   │   ├── DesktopInventoryView.tsx       # 대시보드(재고) — ~308줄
│       │   │   ├── DesktopWarehouseView.tsx       # 입출고 wizard — ~492줄
│       │   │   ├── _warehouse_steps.tsx           # wizard 5단계 컴포넌트
│       │   │   ├── SelectedItemsPanel.tsx         # 4단계 수량 입력
│       │   │   ├── DesktopHistoryView.tsx         # 입출고 내역 — ~336줄
│       │   │   ├── DesktopAdminView.tsx           # 관리자 — ~830줄
│       │   │   ├── legacyUi.ts                    # LEGACY_COLORS · 헬퍼
│       │   │   ├── common/                        # 공용 부품 (배럴 + 6 부품)
│       │   │   │   ├── index.ts
│       │   │   │   ├── EmptyState.tsx · LoadFailureCard.tsx · LoadingSkeleton.tsx
│       │   │   │   └── StatusPill.tsx · ConfirmModal.tsx · ResultModal.tsx
│       │   │   ├── _warehouse_hooks/              # 입출고 hook 5종
│       │   │   │   ├── useWarehouseData.ts
│       │   │   │   ├── useWarehouseFilters.ts
│       │   │   │   ├── useWarehouseWizardState.ts
│       │   │   │   ├── useWarehouseScroll.ts
```
