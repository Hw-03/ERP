---
type: file-explanation
source_path: "frontend/components/CategoryCard.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# CategoryCard.tsx — CategoryCard.tsx 설명

## 이 파일은 무엇을 책임지나

`CategoryCard.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/components/CategoryCard.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `CategoryCard`
- `ProcessTypeSummary`
- `ProcessTypeMeta`
- `ProcessTypeCardProps`

## 연결되는 파일

- [[ERP/frontend/components/📁_components]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
"use client";

import { type ProcessTypeSummary } from "@/lib/api";

interface ProcessTypeMeta {
  badge: string;
  border: string;
  dot: string;
}

function metaForCode(code: string): ProcessTypeMeta {
  const prefix = code[0] ?? "";
  switch (prefix) {
    case "T": return { badge: "bg-cyan-900/60 text-cyan-300",    border: "border-l-cyan-500",   dot: "bg-cyan-400" };
    case "H": return { badge: "bg-yellow-900/60 text-yellow-300", border: "border-l-yellow-500", dot: "bg-yellow-400" };
    case "V": return { badge: "bg-purple-900/60 text-purple-300", border: "border-l-purple-500", dot: "bg-purple-400" };
    case "N": return { badge: "bg-orange-900/60 text-orange-300", border: "border-l-orange-500", dot: "bg-orange-400" };
    case "A": return { badge: "bg-indigo-900/60 text-indigo-300", border: "border-l-indigo-500", dot: "bg-indigo-400" };
    case "P": return { badge: "bg-green-900/60 text-green-300",   border: "border-l-green-500",  dot: "bg-green-400" };
    default:  return { badge: "bg-slate-700 text-slate-200",      border: "border-l-slate-500",  dot: "bg-slate-400" };
  }
}

interface ProcessTypeCardProps {
  data: ProcessTypeSummary;
  isAlert?: boolean;
}

export default function CategoryCard({ data, isAlert = false }: ProcessTypeCardProps) {
  const meta = metaForCode(data.process_type_code);
  const totalQty = Number(data.total_quantity);

  const cardClassName = isAlert
    ? "rounded-xl border border-red-800/60 border-l-4 border-l-red-500 bg-red-950/40 p-5 shadow-lg"
    : `rounded-xl border border-slate-700/60 border-l-4 ${meta.border} bg-slate-800 p-5 shadow-lg`;

  return (
    <div
      className={`${cardClassName} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-base font-bold ${meta.badge}`}
              >
                {data.process_type_code}
              </span>
              {isAlert && (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-base text-red-400">
                  확인 필요
                </span>
              )}
            </div>
```
