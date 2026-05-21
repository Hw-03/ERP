---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/login/OperatorLoginCard.tsx
tags: [vault, code-note, auto-generated, stub]
---

# OperatorLoginCard.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/login/OperatorLoginCard.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

/**
 * 작업자 식별용 PIN 로그인 카드 — 단일 카드 구조.
 *
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 * 실제 보안 인증이 아닌 식별용.
 */

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Loader2, Lock, RotateCcw } from "lucide-react";
import { api, type Employee } from "@/lib/api";
import { setCurrentOperator, type Operator } from "./useCurrentOperator";
import { useLoginEmployees } from "./useLoginEmployees";
import { EmployeeCombobox } from "./EmployeeCombobox";

interface OperatorLoginCardProps {
  onLogin: () => void;
}

const PIN_LENGTH = 4;

export function OperatorLoginCard({ onLogin }: OperatorLoginCardProps) {
  const employees = useLoginEmployees();
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

```
