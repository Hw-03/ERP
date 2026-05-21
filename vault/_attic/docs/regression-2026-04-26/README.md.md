---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/regression-2026-04-26/README.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# README.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/regression-2026-04-26/README.md]]

## 원본 첫 줄 (또는 메타)

```
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
```
