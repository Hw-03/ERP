"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

// BarcodeDetector is available in Chrome/Edge 83+ and Safari 17+.
// TypeScript doesn't ship these types by default, so we declare them.
interface BarcodeDetectorType {
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<{ rawValue: string; format: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorType;
  }
}

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
  const [supported] = useState(() => typeof window !== "undefined" && !!window.BarcodeDetector);

  useEffect(() => {
    if (!supported) return;

    let animFrameId = 0;
    let stream: MediaStream | null = null;
    let detector: BarcodeDetectorType | null = null;
    let stopped = false;

    async function start() {
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
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : "카메라를 열 수 없습니다.");
      }
    }

    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(animFrameId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported, onDetected, onClose]);

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

        {!supported ? (
          <div
            className="rounded-xl border px-4 py-6 text-center text-[13px]"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            이 브라우저는 BarcodeDetector API를 지원하지 않습니다.
            <br />
            Chrome 또는 Edge 최신 버전을 사용해 주세요.
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

        <div className="mt-3 text-center text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          QR코드, Code128, EAN-13, EAN-8, UPC-A, DataMatrix 지원
        </div>
      </div>
    </div>
  );
}
