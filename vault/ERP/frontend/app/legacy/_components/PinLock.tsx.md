---
type: file-explanation
source_path: "frontend/app/legacy/_components/PinLock.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# PinLock.tsx — PinLock.tsx 설명

## 이 파일은 무엇을 책임지나

`PinLock.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `PinLock`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useMemo, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "삭제"];

export function PinLock({ onUnlocked }: { onUnlocked: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const dots = useMemo(() => Array.from({ length: 4 }), []);

  const verify = async (pinToVerify: string) => {
    try {
      setLoading(true);
      await api.verifyAdminPin(pinToVerify);
      onUnlocked(pinToVerify);
    } catch {
      setError(true);
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const addDigit = (value: string) => {
    if (!value || loading || pin.length >= 4) return;
    const next = pin + value;
    setPin(next);
    setError(false);
    if (next.length === 4) void verify(next);
  };

  const removeDigit = () => {
    if (loading) return;
    setPin((current) => current.slice(0, -1));
    setError(false);
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center px-6 pt-6">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[22px]" style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)`, color:...
        <LockKeyhole className="h-8 w-8" />
      </div>

      <div className="text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
          Admin Access
        </div>
        <div className="mt-2 text-2xl font-black">관리자 잠금 해제</div>
        <div className="mt-2 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
```
