---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/BarcodeScannerModal.tsx
status: active
updated: 2026-04-27
source_sha: 18cdc558d667
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# BarcodeScannerModal.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/BarcodeScannerModal.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `11651` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 302줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import { LEGACY_COLORS } from "./legacyUi";

// BarcodeDetector is available in Chrome/Edge 83+ and Safari 17+.
// TypeScript doesn't ship these types by default, so we declare them.
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

type ScannerMode = "native" | "zxing" | "insecure" | "unsupported";

export function BarcodeScannerModal({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const formatCheckDone = useRef(false);
# ... (이하 185줄 생략. 원본 참조)

````
