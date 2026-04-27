---
type: code-note
project: ERP
layer: frontend
source_path: frontend/components/UKAlert.tsx
status: active
updated: 2026-04-27
source_sha: d4fd28353b75
tags:
  - erp
  - frontend
  - source-file
  - tsx
---

# UKAlert.tsx

> [!summary] 역할
> 원본 프로젝트의 `UKAlert.tsx` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/components/UKAlert.tsx`
- Layer: `frontend`
- Kind: `source-file`
- Size: `2885` bytes

## 연결

- Parent hub: [[frontend/components/components|frontend/components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````tsx
"use client";

import Link from "next/link";
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
    <div className="mb-6 rounded-xl border border-red-600/60 bg-red-950/50 p-4 shadow-lg shadow-red-900/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/20">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-red-300">미분류 품목 경고</h3>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {count}
            </span>
          </div>

          <p className="mt-1 text-sm text-red-400/80">
            카테고리가{" "}
            <span className="rounded bg-red-900/40 px-1.5 py-0.5 font-bold text-red-300">
              UK (Unknown)
            </span>
            로 남아 있는 품목이 <strong className="text-red-200">{count}건</strong> 있습니다.
            올바른 공정 카테고리로 분류해 주세요.
          </p>

          <p className="mt-1.5 text-xs text-red-500/70">
            미분류 품목은 BOM 구성, 생산 입고, 재고 분석 흐름에서 오류를 만들 수 있습니다.
          </p>

          <div className="mt-3 flex items-center gap-3">
            <Link
              href="/inventory?category=UK"
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-600/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-200"
            >
              미분류 품목 보기
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <span className="text-xs text-red-600/50">
              품목 리스트에서 카테고리와 재고를 함께 정리할 수 있습니다.
            </span>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 text-red-600 transition-colors hover:text-red-400"
          aria-label="경고 닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
