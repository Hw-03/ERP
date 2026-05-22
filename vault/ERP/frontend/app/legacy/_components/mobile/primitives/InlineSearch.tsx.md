---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/InlineSearch.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# InlineSearch.tsx — InlineSearch.tsx 설명

## 이 파일은 무엇을 책임지나

`InlineSearch.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `InlineSearch`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

/**
 * 한글 IME 안정화: composition 중에는 외부 onChange 를 호출하지 않고
 * compositionend 에서 한 번만 보내 입력 글자마다 부모 리렌더로 input 이 잘리는 문제 방지.
 * 외부 value 변경은 composition 중일 때만 무시(외부 리셋이 입력을 덮어쓰는 것 방지),
 * 평소에는 즉시 반영.
 */
export function InlineSearch({
  value,
  onChange,
  placeholder = "검색",
  className,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const composingRef = useRef(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (composingRef.current) return;
    if (draft !== value) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draft 동기화는 외부 value 변경 시만
  }, [value]);

  const handleChange = (next: string) => {
    setDraft(next);
    if (!composingRef.current) onChange(next);
  };

  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-[14px] border px-3",
        className,
      )}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <Search size={16} color={LEGACY_COLORS.muted} strokeWidth={2} />
      <input
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onCompositionStart={() => {
```
