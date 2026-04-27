---
type: code-note
project: ERP
layer: docs
source_path: docs/regression-2026-04-26/README.md
status: active
updated: 2026-04-27
source_sha: 1c6273bbd9ec
tags:
  - erp
  - docs
  - documentation
  - md
---

# README.md

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/regression-2026-04-26/README.md`
- Layer: `docs`
- Kind: `documentation`
- Size: `2990` bytes

## 연결

- Parent hub: [[docs/regression-2026-04-26/regression-2026-04-26|docs/regression-2026-04-26]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

````markdown
# Phase 5 회귀 테스트 — 2026-04-26

브랜치: `feat/erp-overhaul` (HEAD: `3a4108e`)
도구: Playwright MCP
검증자: Claude Code (Opus 4.7)

## 한 줄 요약
**6/7 통과, 1건 P1 회귀 발견** — `GET /api/inventory/transactions` 가 항상 500 (응답 모델 nullability 결함).

## 단계별 결과

| # | 시나리오 | 결과 | 캡처 |
|---|---|---|---|
| 1 | `/legacy` 접속 + 콘솔 error 0 (데스크톱 1440x900) | ✅ | [01_legacy_desktop.png](01_legacy_desktop.png) |
| 2 | dept wizard 5단계 (튜브 → 정하늘 → 부서 입고 → 데코가이드 ASS'Y×1 → 확정) | ✅ | [02_step5_confirm.png](02_step5_confirm.png) |
| 3 | 입출고 내역 직전 거래 표시 | ❌ | — (API 500) |
| 4 | BOM Where-Used 카드 (Phase 5 신규 UI) | ✅ | [04_bom_where_used.png](04_bom_where_used.png) |
| 5 | 관리자 5섹션(모델/품목/직원/출하묶음/BOM) 첫 화면 렌더 | ✅ | [05_admin_landing.png](05_admin_landing.png) |
| 6a | Topbar pill 시각 깨짐 | ✅ | [06a_topbar_pill.png](06a_topbar_pill.png) |
| 6b | CompletionFlyout 시각 깨짐 | ⚠️ | 노출 시간 1.5s 로 스틸 캡처 미수, 흐름 자체는 성공 |

## P1 회귀 — `/api/inventory/transactions` 500

### 증상
- 모바일 입출고 이력 화면 진입 시 "조건에 맞는 거래가 없습니다" 표시
- 실제 거래는 생성됨 — POST `/api/inventory/receive` 는 **201 Created** 정상
- GET `/api/inventory/transactions?limit=100&skip=0` 만 항상 **500**
- 백엔드 응답: `{"code":"INTERNAL","message":"응답 데이터 검증 실패(서버 측 오류)"}`

### 근본 원인
[`backend/app/schemas.py:401`](../../backend/app/schemas.py#L401) `TransactionLogResponse.erp_code: str` (Optional 아님)
↔ DB의 일부 `Item.erp_code` 가 `null`
→ `routers/inventory/transactions.py:99-115` 응답 매핑에서 Pydantic 검증 실패

화면 자재 목록의 ERP코드 칸이 대부분 "-" 로 표시되는 것과 정합.

### 1줄 fix 제안 (미적용)
```python
# backend/app/schemas.py:401
erp_code: Optional[str]
```

또는 router 측 매핑에서 `erp_code=item.erp_code or ""`.

## 네트워크 종합 (24건)
- 200 OK: 22
- 201 Created: 1 (POST `/api/inventory/receive`)
- **500: 2** (모두 `/api/inventory/transactions`)
- 4xx: 0

## 콘솔 에러 (전체 세션)
- 0건 (데스크톱 진입 시) → 2건 (history 진입 시 동일 500 원인)

## 적용한 viewport 매트릭스
- Phase A: 1440x900 (데스크톱) — `/legacy` 진입, Topbar, 관리자 5섹션, BOM Where-Used
- Phase B: 430x900 (모바일) — dept wizard 5단계, 입출고 이력

## 사용한 PIN
관리자 잠금: `0000` (백엔드 `DEFAULT_ADMIN_PIN` 그대로)

## 평가 (대한민국 SMB 25명 잣대)
**약 69 / 100** — "한 부서 일상 업무 투입 직전". 위 1줄 fix + PIN 강제 변경 두 가지만 적용하면 78~80점 도달.

자세한 항목별 채점은 commit message 참조.
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
