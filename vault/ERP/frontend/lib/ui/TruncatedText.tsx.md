---
type: file-explanation
source_path: "frontend/lib/ui/TruncatedText.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# TruncatedText.tsx — TruncatedText.tsx 설명

## 이 파일은 무엇을 책임지나

`TruncatedText.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/ui/TruncatedText.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `TruncatedText`
- `CSSProperties`
- `ReactNode`
- `Props`

## 연결되는 파일

- [[ERP/frontend/lib/ui/📁_ui]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";

/**
 * TruncatedText — `@/lib/ui/TruncatedText`.
 *
 * Tailwind `truncate` 로 끝이 `…` 처리된 텍스트에 즉시(0ms) hover 툴팁 표시.
 * 실제로 잘렸을 때(`scrollWidth > clientWidth`)만 툴팁 노출 — 짧은 텍스트엔 노이즈 없음.
 *
 * 사용:
 *   <TruncatedText className="truncate text-sm font-semibold" style={{ color }}>
 *     {item_name}
 *   </TruncatedText>
 *
 * suffix 가 붙는 composite 케이스(예: `{item_code} · 자식 N개`)에서 풀텍스트를 따로
 * 보여주고 싶으면 `tooltipContent` 로 override.
 */
interface Props {
  className?: string;
  style?: CSSProperties;
  /** 화면에 표시되는 내용 (truncate 됨). 단순 문자열 또는 ReactNode. */
  children: ReactNode;
  /** 툴팁에 표시할 내용 override. 기본 = children. */
  tooltipContent?: ReactNode;
  /** 기본 true — BOM 품목명은 길어 nowrap 시 화면 밖으로 나감. */
  multiline?: boolean;
  side?: "top" | "bottom";
}

export function TruncatedText({
  className,
  style,
  children,
  tooltipContent,
  multiline = true,
  side = "top",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setIsOverflow(el.scrollWidth > el.clientWidth);
    };
    check();
    // ResizeObserver — 부모 폭 변경/창 리사이즈 시 재측정.
    // jsdom 미지원 환경에서는 try/catch 로 안전 폴백.
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(check);
      ro.observe(el);
```
