---
type: file-explanation
source_path: "frontend/components/UKAlert.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# UKAlert.tsx — UKAlert.tsx 설명

## 이 파일은 무엇을 책임지나

`UKAlert.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/components/UKAlert.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `UKAlert`
- `UKAlertProps`

## 연결되는 파일

- [[ERP/frontend/components/📁_components]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
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
```
