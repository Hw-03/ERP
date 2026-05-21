---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/PinLock.tsx
status: active
updated: 2026-04-27
source_sha: 505b3f976a54
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# PinLock.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/PinLock.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `4141` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useMemo, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "./legacyUi";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "삭제"];

export function PinLock({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const dots = useMemo(() => Array.from({ length: 4 }), []);

  const verify = async (pinToVerify: string) => {
    try {
      setLoading(true);
      await api.verifyAdminPin(pinToVerify);
      onUnlocked();
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
# ... (이하 80줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
