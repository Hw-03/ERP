---
type: file-explanation
source_path: "frontend/app/legacy/_components/_hooks/useBarcodeScanner.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useBarcodeScanner.ts — useBarcodeScanner.ts 설명

## 이 파일은 무엇을 책임지나

`useBarcodeScanner.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useBarcodeScanner`
- `ScannerMode`
- `BarcodeDetectorType`
- `Window`
- `UseBarcodeScannerResult`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_hooks/📁__hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

/**
 * Round-13 (#6) — BarcodeScannerModal 의 카메라 + decoder 라이프사이클 hook.
 *
 * Native BarcodeDetector (Chrome/Edge 83+, Safari 17+) 우선, 미지원 시 ZXing fallback.
 * isSecureContext 체크로 HTTP 접속 차단.
 */

interface BarcodeDetectorType {
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<{ rawValue: string; format: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new(options?: { formats: string[] }): BarcodeDetectorType;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

export type ScannerMode = "native" | "zxing" | "insecure" | "unsupported";

export interface UseBarcodeScannerResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  mode: ScannerMode;
  error: string | null;
  detected: string | null;
  setDetected: (v: string | null) => void;
}

export function useBarcodeScanner(
  onDetected: (value: string) => void,
  onClose: () => void,
): UseBarcodeScannerResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const formatCheckDone = useRef(false);

  const [mode, setMode] = useState<ScannerMode>(() => {
    if (typeof window === "undefined") return "unsupported";
    if (!window.isSecureContext) return "insecure";
    if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
    if (window.BarcodeDetector) return "native";
    return "zxing";
  });

  // Verify BarcodeDetector actually supports required formats; downgrade to zxing if not.
  useEffect(() => {
    if (mode !== "native" || formatCheckDone.current) return;
```
