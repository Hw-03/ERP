---
type: file-explanation
source_path: "frontend/app/legacy/_components/BarcodeScannerModal.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BarcodeScannerModal.tsx — BarcodeScannerModal.tsx 설명

## 이 파일은 무엇을 책임지나

`BarcodeScannerModal.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BarcodeScannerModal`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useBarcodeScanner } from "./_hooks/useBarcodeScanner";

export function BarcodeScannerModal({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const { videoRef, mode, error, detected, setDetected } = useBarcodeScanner(onDetected, onClose);
  const [manualInput, setManualInput] = useState("");

  function handleManualSubmit() {
    const value = manualInput.trim();
    if (!value) return;
    setDetected(value);
    setTimeout(() => {
      onDetected(value);
      onClose();
    }, 600);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="relative w-full max-w-[480px] rounded-2xl border p-4 shadow-2xl"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[15px] font-black">
              <Camera className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
              바코드 / QR 스캔
            </div>
            <div className="mt-0.5 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
              카메라를 바코드에 가져다 대면 자동으로 인식합니다.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border p-1.5"
            style={{ borderColor: LEGACY_COLORS.border }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {mode === "unsupported" ? (
          <div
```
