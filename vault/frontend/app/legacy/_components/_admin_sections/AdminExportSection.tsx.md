---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/AdminExportSection.tsx
status: active
updated: 2026-04-27
source_sha: c61f4129f28c
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminExportSection.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/AdminExportSection.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2064` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_admin_sections|frontend/app/legacy/_components/_admin_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { FileDown } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";

type Props = {
  itemsExportUrl: string;
  transactionsExportUrl: string;
};

export function AdminExportSection({ itemsExportUrl, transactionsExportUrl }: Props) {
  return (
    <div className="overflow-y-auto">
      <div className="grid gap-4 xl:grid-cols-2">
        <div
          className="rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4 flex items-center gap-2 text-base font-bold">
            <FileDown className="h-4 w-4" /> 품목 엑셀
          </div>
          <p className="mb-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            현재 등록된 전체 품목을 엑셀 파일로 내보냅니다.
          </p>
          <a
            href={itemsExportUrl}
            download
            className="block w-full rounded-[18px] px-4 py-3 text-center text-sm font-semibold text-white"
            style={{ background: LEGACY_COLORS.green }}
          >
            품목 다운로드
          </a>
        </div>
        <div
          className="rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4 flex items-center gap-2 text-base font-bold">
            <FileDown className="h-4 w-4" /> 거래 엑셀
          </div>
          <p className="mb-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            최근 30일 입출고 거래 내역을 엑셀 파일로 내보냅니다.
          </p>
          <a
            href={transactionsExportUrl}
            download
            className="block w-full rounded-[18px] px-4 py-3 text-center text-sm font-semibold text-white"
            style={{ background: LEGACY_COLORS.green }}
          >
            최근 30일 거래 내역 다운로드
          </a>
        </div>
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
