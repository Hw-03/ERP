"use client";

import { useState } from "react";
import { Activity, Camera, Clock3, RefreshCw, Search, X } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";
import { BarcodeScannerModal } from "./BarcodeScannerModal";

export function DesktopTopbar({
  title,
  subtitle,
  search,
  onSearchChange,
  onRefresh,
  onToggleHistory,
  historyOpen,
  statusText,
}: {
  title: string;
  subtitle: string;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
  statusText: string;
}) {
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <>
      <header
        className="flex items-center gap-3 border-b px-6 py-3"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div className="min-w-0 flex-1">
          <div
            className="text-[9px] font-bold uppercase tracking-[0.2em]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {subtitle}
          </div>
          <div className="text-xl font-black leading-tight">{title}</div>
        </div>

        {/* Search + scanner */}
        <div
          className="flex min-w-[240px] items-center gap-2 rounded-xl border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="품목명, 코드, 바코드, 담당자"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: LEGACY_COLORS.text }}
          />
          {search ? (
            <button onClick={() => onSearchChange("")} className="shrink-0">
              <X className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />
            </button>
          ) : (
            <button
              onClick={() => setScannerOpen(true)}
              className="shrink-0 rounded-lg p-0.5 transition"
              title="바코드 / QR 스캔"
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = LEGACY_COLORS.blue; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ""; }}
            >
              <Camera className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: LEGACY_COLORS.s2 }}>
          <Clock3 className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          <div className="max-w-[160px] truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {statusText}
          </div>
        </div>

        <button
          onClick={onToggleHistory}
          className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition"
          style={{
            background: historyOpen ? "rgba(79,142,247,.16)" : LEGACY_COLORS.s2,
            borderColor: historyOpen ? "rgba(79,142,247,.35)" : LEGACY_COLORS.border,
            color: historyOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
          }}
        >
          <Activity className="h-3.5 w-3.5" />
          입출고 내역
        </button>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </header>

      {scannerOpen ? (
        <BarcodeScannerModal
          onDetected={(value) => onSearchChange(value)}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
    </>
  );
}
