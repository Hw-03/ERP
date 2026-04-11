"use client";

import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { useState } from "react";

interface UKAlertProps {
  count: number;
  onDismiss?: () => void;
}

export default function UKAlert({ count, onDismiss }: UKAlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || count === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="animate-fade-in border border-red-600/60 bg-red-950/50 rounded-xl p-4 mb-6 shadow-lg shadow-red-900/20">
      <div className="flex items-start gap-3">
        {/* 아이콘 */}
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse-slow">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-red-300 font-semibold text-sm">
              미분류 자재 경고
            </h3>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold">
              {count}
            </span>
          </div>

          <p className="text-red-400/80 text-sm mt-1">
            카테고리가 <span className="font-mono font-bold text-red-300 bg-red-900/40 px-1.5 py-0.5 rounded">UK (Unknown)</span>으로
            분류된 품목이 <strong className="text-red-200">{count}개</strong> 있습니다.
            즉시 확인하여 올바른 카테고리로 재지정해 주세요.
          </p>

          <p className="text-red-500/70 text-xs mt-1.5">
            미분류 품목은 BOM 역전개 및 생산 입고 처리 시 오류를 유발할 수 있습니다.
          </p>

          <div className="flex items-center gap-3 mt-3">
            <a
              href="?category=UK"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-300
                         hover:text-red-200 bg-red-500/10 hover:bg-red-500/20
                         border border-red-600/40 px-3 py-1.5 rounded-lg transition-colors"
            >
              미분류 품목 보기
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <span className="text-red-600/50 text-xs">
              품목 관리에서 카테고리를 재지정할 수 있습니다.
            </span>
          </div>
        </div>

        {/* 닫기 */}
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
