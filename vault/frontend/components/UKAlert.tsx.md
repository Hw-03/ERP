---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/components/UKAlert.tsx
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
# ... (이하 43줄 생략. 원본 참조)

````
