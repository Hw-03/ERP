---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useBarcodeScanner.ts
tags: [vault, code-note, c-tier]
---

# useBarcodeScanner — 바코드 스캔 (Native/ZXing fallback)

> [!summary] BarcodeDetector API (Chrome/Safari 17+) 우선. ZXing fallback. isSecureContext HTTP 차단

## 1. 역할

videoRef + mode(native/zxing/insecure/unsupported). camera/decoder 라이프사이클. error 상태.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_hooks/useBarcodeScanner.ts` ([[erp/frontend/app/legacy/_components/_hooks/useBarcodeScanner.ts|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/_hooks/useResource.ts|useResource]]
- [[erp/frontend/app/legacy/_components/_hooks/useFocusTrap.ts|useFocusTrap]]
