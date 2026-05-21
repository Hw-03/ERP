---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/BarcodeScannerModal.tsx
tags: [vault, code-note, frontend, b-tier]
---

# BarcodeScannerModal — 바코드/QR 스캔 모달

> [!summary] 역할
> 카메라로 바코드/QR 감지. 수동 입력 fallback.

## 1. 이 파일의 역할

모달 스타일 바코드 스캐너. useBarcodeScanner hook으로 video ref + 감지 로직 관리. detected 상태 표시, 수동 입력 필드(manualInput) 제공. onDetected 콜백으로 감지 값 전달, onClose로 모달 종료.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/BarcodeScannerModal.tsx` ([[erp/frontend/app/legacy/_components/BarcodeScannerModal.tsx|원본]])

## 3. 주요 import

- React: `useState`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `useBarcodeScanner` from `./_hooks/useBarcodeScanner`
- Icons: `Camera`, `X` from lucide-react

## 4. 어디서 쓰이는지

- 입출고, 재고 페이지에서 품목 바코드 검색
- 부모: 바코드 검색 조건부 렌더

## 5. ⚠️ 위험 포인트

> [!warning] 카메라 권한 필수 — 거부 시 에러 처리
> detected 상태 200ms 딜레이 후 onDetected — 시각 피드백

## 6. 수정 전 체크

- [ ] useBarcodeScanner 로직 (mode, error) 핸들링
- [ ] manualInput trim() 후 validation
