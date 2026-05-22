---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/PinLock.tsx
tags: [vault, code-note, frontend, b-tier]
---

# PinLock — PIN 잠금 해제 UI

> [!summary] 역할
> 숫자 패드로 PIN 입력. 4자리 자동 검증. 관리자 잠금 해제.

## 1. 이 파일의 역할

PIN 입력 UI. 1-9, 0, 삭제 버튼 그리드. pin.length 4 도달 시 자동 api.verifyAdminPin() 검증. error 표시(빨강), loading 중 입력 차단. onUnlocked 콜백으로 PIN 전달.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/PinLock.tsx` ([[erp/frontend/app/legacy/_components/PinLock.tsx|원본]])

## 3. 주요 import

- React: `useMemo`, `useState`
- `api` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- Icon: `LockKeyhole` from lucide-react

## 4. 어디서 쓰이는지

- 관리자 권한 잠금 해제
- DesktopPinLock 컴포넌트 (desktop view)

## 5. ⚠️ 위험 포인트

> [!warning] PIN 4자리 자동 검증 — 너무 빨라 혼동 가능
> error 시 pin 초기화 — 재입력 유도

## 6. 수정 전 체크

- [ ] api.verifyAdminPin 응답 포맷 변경 시 onUnlocked 콜백 인자 확인
- [ ] KEYS 배열 순서(0 위치) 검증
