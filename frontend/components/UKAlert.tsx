"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, X } from "lucide-react";

interface UKAlertProps {
  count: number;
  onDismiss?: () => void;
}

export default function UKAlert({ count, onDismiss }: UKAlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || count === 0) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="animate-fade-in border border-red-600/60 bg-red-950/50 rounded-xl p-4 mb-6 shadow-lg shadow-red-900/20">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse-slow">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-red-300 font-semibold text-sm">
              미분류 품목 경고
            </h3>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold">
              {count}
            </span>
          </div>

          <p className="text-red-400/80 text-sm mt-1">
            카테고리가{" "}
            <span className="font-mono font-bold text-red-300 bg-red-900/40 px-1.5 py-0.5 rounded">
              UK (Unknown)
            </span>
            로 남아 있는 품목이 <strong className="text-red-200">{count}건</strong>{" "}
            있습니다. 빠르게 확인해서 올바른 공정 카테고리로 분류해 주세요.
          </p>

          <p className="text-red-500/70 text-xs mt-1.5">
            미분류 품목은 BOM 전개, 생산입고, 재고 분석 흐름에서 오류를 만들 수
            있습니다.
          </p>

          <div className="flex items-center gap-3 mt-3">
            <a
              href="?category=UK"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-600/40 px-3 py-1.5 rounded-lg transition-colors"
            >
              미분류 품목 보기
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <span className="text-red-600/50 text-xs">
              품목 관리 화면에서 카테고리를 수정할 수 있게 연결할 예정입니다.
            </span>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-red-600 hover:text-red-400 transition-colors p-1"
          aria-label="경고 닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
