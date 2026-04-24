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
          <div className="relative overflow-hidden rounded-xl" style={{ background: "#000" }}>
            {/* Live camera feed */}
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="aspect-video w-full object-cover"
            />

            {/* Scan frame overlay */}
            {!detected && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-44 w-64">
                  {/* Corner marks */}
                  {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                    <span
                      key={corner}
                      className="absolute h-8 w-8 border-2"
                      style={{
                        borderColor: LEGACY_COLORS.blue,
                        top: corner.startsWith("t") ? 0 : "auto",
                        bottom: corner.startsWith("b") ? 0 : "auto",
                        left: corner.endsWith("l") ? 0 : "auto",
                        right: corner.endsWith("r") ? 0 : "auto",
                        borderRight: corner.endsWith("l") ? "none" : undefined,
                        borderLeft: corner.endsWith("r") ? "none" : undefined,
                        borderBottom: corner.startsWith("t") ? "none" : undefined,
                        borderTop: corner.startsWith("b") ? "none" : undefined,
                      }}
                    />
                  ))}
                  {/* Scan line animation */}
                  <div
                    className="absolute left-2 right-2 h-px animate-[scan_2s_ease-in-out_infinite]"
                    style={{ background: LEGACY_COLORS.blue, boxShadow: `0 0 6px ${LEGACY_COLORS.blue}` }}
                  />
                </div>
              </div>
            )}

            {/* Detected success overlay */}
            {detected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "rgba(31,209,122,.18)" }}>
                <div className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.green }}>인식 완료</div>
                <div className="text-[15px] font-black">{detected}</div>
              </div>
            )}
          </div>
        )}

        {!detected && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleManualSubmit();
              }}
              placeholder="바코드 직접 입력"
              className="flex-1 rounded-lg border px-3 py-1.5 text-[13px] outline-none"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              className="rounded-lg border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
              style={{ background: LEGACY_COLORS.blue, borderColor: LEGACY_COLORS.blue, color: "#fff" }}
            >
              적용
            </button>
          </div>
        )}

        <div className="mt-3 text-center text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          QR코드, Code128, EAN-13, EAN-8, UPC-A, DataMatrix 지원
        </div>
      </div>
    </div>
  );
}
