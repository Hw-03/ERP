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

  return { videoRef, mode, error, detected, setDetected };
}
