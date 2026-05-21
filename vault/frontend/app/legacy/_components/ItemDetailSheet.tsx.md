---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/ItemDetailSheet.tsx
status: active
updated: 2026-04-27
source_sha: 571af59de9dc
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# ItemDetailSheet.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/ItemDetailSheet.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `12540` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 326줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useEffect, useState } from "react";
import { api, type Item, type TransactionLog } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import {
  LEGACY_COLORS,
  erpCodeDeptBadge,
  formatNumber,
  getStockState,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

type ActionMode = "ADJUST" | "RECEIVE" | "SHIP";

export function ItemDetailSheet({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: (updated: Item) => void;
}) {
  const [mode, setMode] = useState<ActionMode>("ADJUST");
  const [qty, setQty] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<TransactionLog[]>([]);

  useEffect(() => {
    if (!item) return;
    setMode("ADJUST");
# ... (이하 185줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
