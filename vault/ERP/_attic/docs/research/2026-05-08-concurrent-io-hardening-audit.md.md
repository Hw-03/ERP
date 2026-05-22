---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-08-concurrent-io-hardening-audit.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-08-concurrent-io-hardening-audit.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-08-concurrent-io-hardening-audit.md]]

## 원본 첫 줄 (또는 메타)

```
# 동시성 취약점 감사 보고서
**작성일**: 2026-05-08  
**대상**: DEXCOWIN MES 백엔드 — 30명 동시 입출고 운영 안정성 보강

---

## 요약

로컬 내부망 서버에서 30명이 동시에 재고 입출고/요청/승인 작업을 수행할 때 발생할 수 있는 데이터 정합성 취약점을 분석하고, 수정 방안을 적용했다.

---

## 발견된 취약점

| 위치 | 취약점 | 심각도 | 상태 |
|------|--------|--------|------|
| `inventory.py`: `reserve()` | Check-then-act — SELECT → avail check → UPDATE 사이 락 없음 | 🔴 High | ✅ 수정 |
| `inventory.py`: 모든 쓰기 함수 | `get_or_create_inventory()` 공유로 stale read 가능 | 🔴 High | ✅ 수정 |
| `stock_requests.py`: `_generate_request_code` | count+1 방식 → 동시 생성 시 request_code 중복 | 🔴 High | ✅ 수정 |
| `stock_requests.py`: `approve_request` | 상태 검증 후 재고 이동 사이 갭 — 이중 승인 가능 | 🔴 High | ✅ 수정 |
| `inventory.py`: `_sync_total()` | item_id로 inv 재조회 → stale read 가능 | 🟠 Medium | ✅ 수정 |
| `production.py`: BOM 검증 | 사전 avail 검증 → 실제 차감 사이 TOCTOU 갭 | 🟠 Medium | ✅ 수정 |
| `DraftsListPanel.tsx` | 삭제 버튼 loading 상태 없음 — 더블클릭 중복 요청 | 🟡 Low | ✅ 수정 |
| API 레이어 | 409/503 status 코드 미전달 | 🟡 Low | ✅ 수정 |

```
