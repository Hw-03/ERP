---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopRightPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopRightPanel.tsx — DesktopRightPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopRightPanel.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopRightPanel`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

export function DesktopRightPanel({
  title,
  subtitle,
  headerBadge,
  children,
}: {
  title: string;
  subtitle?: string;
  headerBadge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside
      className="flex h-full min-h-0 w-[420px] shrink-0 flex-col overflow-hidden rounded-[32px] border px-5 py-5"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-4 px-1 pb-4 border-b" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[22px] font-black">{title}</div>
            {subtitle ? (
              <div className="mt-1.5 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {headerBadge ? <div className="shrink-0 pt-1">{headerBadge}</div> : null}
        </div>
      </div>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
```
