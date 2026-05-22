---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/SubScreenHeader.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# SubScreenHeader.tsx — SubScreenHeader.tsx 설명

## 이 파일은 무엇을 책임지나

`SubScreenHeader.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `SubScreenHeader`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";
import { IconButton } from "./IconButton";

/**
 * 모바일 sub-screen sticky 헤더 — 뒤로가기 + 제목/부제 + 우측 옵션.
 * WeeklyReportScreen · PlaceholderScreen 공통.
 */
export function SubScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-3"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <IconButton icon={ArrowLeft} label="뒤로" size="md" onClick={onBack} />
      <div className="min-w-0 flex-1">
        {subtitle ? (
          <div
            className={`${TYPO.overline} font-bold uppercase tracking-[2px]`}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {subtitle}
          </div>
        ) : null}
        <div
          className={`${TYPO.title} truncate font-black`}
          style={{ color: LEGACY_COLORS.text }}
        >
          {title}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
```
