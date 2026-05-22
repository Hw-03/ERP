---
type: file-explanation
source_path: "_attic/docs/regression-2026-04-26/README.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# README.md — README.md 설명

## 이 파일은 무엇을 책임지나

`README.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Phase 5 회귀 테스트 — 2026-04-26`
- `한 줄 요약`
- `단계별 결과`
- `P1 회귀 — `/api/inventory/transactions` 500`
- `증상`
- `근본 원인`
- `1줄 fix 제안 (미적용)`
- `backend/app/schemas.py:401`
- `네트워크 종합 (24건)`
- `콘솔 에러 (전체 세션)`

## 연결되는 파일

- [[ERP/_attic/docs/regression-2026-04-26/📁_regression-2026-04-26]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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

화면 자재 목록의 품목 코드 칸이 대부분 "-" 로 표시되는 것과 정합.

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
```
