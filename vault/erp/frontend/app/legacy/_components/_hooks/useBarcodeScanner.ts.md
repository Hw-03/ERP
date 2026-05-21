---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useBarcodeScanner.ts
tags: [vault, code-note, b-tier]
---

# useBarcodeScanner.ts — 바코드 스캔 카메라 + 디코더 라이프사이클 훅

> [!summary] 역할
> BarcodeScannerModal의 카메라 권한 요청 + Native BarcodeDetector vs ZXing fallback 선택. isSecureContext 체크로 HTTPS 강제.

## 1. 이 파일의 역할
- ScannerMode: "native" | "zxing" | "insecure" | "unsupported"
- useBarcodeScanner(onDetected, onClose) — 카메라 스트림 + 디코더 초기화
- Native BarcodeDetector (Chrome/Edge 83+, Safari 17+) 우선, 미지원 시 ZXing fallback
- isSecureContext 체크 → HTTP 차단 (insecure 모드)

## 2. 실제 원본 위치
`frontend/app/legacy/_components/_hooks/useBarcodeScanner.ts` — 약 120줄

## 3. 주요 import
```typescript
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
```

## 4. 어디서 쓰이는지
- BarcodeScannerModal 컴포넌트: videoRef 연결 + detected 상태 추적
- 품목/거래 입력 화면: 바코드 자동 입력

## 5. ⚠️ 위험 포인트
- **BarcodeDetector는 비표준 API** — TypeScript declare global로 타입 추가 (진화 중)
- ZXing fallback 시 번들 크기 증가 (약 80KB gzipped)
- getUserMedia 권한 거부 → error 상태로 유지 (재시도 UI 필요)
- Safari 17+ 미만에서는 ZXing 필수 (old Safari 미지원)

## 6. 수정 전 체크
- isSecureContext=true 환경에서 mode="native" 또는 "zxing" 확인
- BarcodeDetector 미지원 환경에서 mode="zxing" fallback 확인
- videoRef.current에 <video> 요소 연결 확인
