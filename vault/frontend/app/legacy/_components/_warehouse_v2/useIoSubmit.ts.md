---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoSubmit.ts
tags: [vault, code-note, auto-generated, stub]
---

# useIoSubmit.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_v2/useIoSubmit.ts]]

## 원본 첫 줄

```
import { useRef, useState } from "react";
import { api, type IoBundle, type IoSubType, type IoWorkType } from "@/lib/api";
import { ApiError } from "@/lib/api-core";

// crypto.randomUUID 는 보안 컨텍스트(HTTPS / localhost)에서만 정의됨.
// LAN IP (http://192.168.x.x) 같은 비보안 origin 에서는 undefined → 제출 실패. 동일 형식의 UUID v4 폴백 제공.
function makeClientRequestId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function useIoSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const clientRequestIdRef = useRef<string | null>(null);

  async function submit(payload: {
    employeeId: string;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
```
