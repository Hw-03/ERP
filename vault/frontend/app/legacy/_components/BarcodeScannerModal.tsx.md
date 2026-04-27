---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/BarcodeScannerModal.tsx
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
  const [manualInput, setManualInput] = useState("");

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
    formatCheckDone.current = true;
    if (!window.BarcodeDetector?.getSupportedFormats) {
      setMode("zxing");
      return;
    }
    void window.BarcodeDetector.getSupportedFormats()
      .then((formats) => {
        const required = ["qr_code", "code_128", "ean_13"];
        if (!required.every((f) => formats.includes(f))) setMode("zxing");
      })
      .catch(() => setMode("zxing"));
  }, [mode]);

  useEffect(() => {
    if (mode === "unsupported" || mode === "insecure") return;

    let stopped = false;

    if (mode === "native") {
      let animFrameId = 0;
      let stream: MediaStream | null = null;
      let detector: BarcodeDetectorType | null = null;

      const startNative = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          if (!videoRef.current || stopped) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          detector = new window.BarcodeDetector!({
            formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "data_matrix"],
          });

          const tick = async () => {
            if (stopped || !videoRef.current || !detector) return;
            if (videoRef.current.readyState >= 2) {
              try {
                const results = await detector.detect(videoRef.current);
                if (results.length > 0 && !stopped) {
                  stopped = true;
                  setDetected(results[0].rawValue);
                  setTimeout(() => {
                    onDetected(results[0].rawValue);
                    onClose();
                  }, 600);
                  return;
                }
              } catch {
                // frame decode error — skip
              }
            }
            animFrameId = requestAnimationFrame(() => void tick());
          };
          animFrameId = requestAnimationFrame(() => void tick());
        } catch {
          if (!stopped) setError("카메라 스캔을 시작하지 못했습니다. 카메라 권한을 허용했는지 확인해 주세요.");
        }
      };

      void startNative();

      return () => {
        stopped = true;
        cancelAnimationFrame(animFrameId);
        stream?.getTracks().forEach((t) => t.stop());
      };
    }

    // ZXing fallback path
    const startZxing = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (stopped || !videoRef.current) return;

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, err) => {
            if (stopped) return;
            if (result) {
              stopped = true;
              const text = result.getText();
              setDetected(text);
              zxingControlsRef.current?.stop();
              setTimeout(() => {
                onDetected(text);
                onClose();
              }, 600);
            }
            // NotFoundException per frame은 정상 — 무시
            void err;
          }
        );
        zxingControlsRef.current = controls;
      } catch {
        if (!stopped) setError("카메라 스캔을 시작하지 못했습니다. 카메라 권한을 허용했는지 확인해 주세요.");
      }
    };
    void startZxing();

    return () => {
      stopped = true;
      zxingControlsRef.current?.stop();
      zxingControlsRef.current = null;
    };
  }, [mode, onDetected, onClose]);

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
            className="rounded-xl border px-4 py-6 text-center text-[13px]"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            카메라 API를 사용할 수 없습니다.
          </div>
        ) : mode === "insecure" ? (
          <div
            className="rounded-xl border px-4 py-6 text-center text-[13px]"
            style={{ background: "rgba(242,95,92,.08)", borderColor: "rgba(242,95,92,.3)", color: LEGACY_COLORS.red }}
          >
            카메라 스캔은 HTTPS 또는 localhost 환경에서만 사용할 수 있습니다. 현재 접속 주소에서는 카메라 권한을 사용할 수 없습니다.
          </div>
        ) : error ? (
          <div
            className="rounded-xl border px-4 py-6 text-center text-[13px]"
            style={{ background: "rgba(242,95,92,.08)", borderColor: "rgba(242,95,92,.3)", color: LEGACY_COLORS.red }}
          >
            {error}
          </div>
        ) : (
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
