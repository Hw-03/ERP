---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopPinLock.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopPinLock.tsx — DesktopPinLock.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopPinLock.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopPinLock`
- `CSSProperties`
- `StyleWithVars`
- `KeyDef`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, Delete, Loader2, LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

type KeyDef =
  | { kind: "digit"; value: string }
  | { kind: "back" }
  | { kind: "clear" };

const KEYS: KeyDef[] = [
  { kind: "digit", value: "1" },
  { kind: "digit", value: "2" },
  { kind: "digit", value: "3" },
  { kind: "digit", value: "4" },
  { kind: "digit", value: "5" },
  { kind: "digit", value: "6" },
  { kind: "digit", value: "7" },
  { kind: "digit", value: "8" },
  { kind: "digit", value: "9" },
  { kind: "back" },
  { kind: "digit", value: "0" },
  { kind: "clear" },
];

const PIN_LENGTH = 4;

export function DesktopPinLock({
  onUnlocked,
  onCancel,
}: {
  onUnlocked: (pin: string) => void;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [shakeNonce, setShakeNonce] = useState(0);

  const dots = useMemo(() => Array.from({ length: PIN_LENGTH }), []);

  const verify = async (pinToVerify: string) => {
    try {
      setLoading(true);
      await api.verifyAdminPin(pinToVerify);
      onUnlocked(pinToVerify);
    } catch {
      setError(true);
      setPin("");
      setShakeNonce((n) => n + 1);
    } finally {
```
