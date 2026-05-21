---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/login/MesLoginGate.tsx
tags: [vault, code-note, b-tier]
---

# MesLoginGate.tsx — 로그인 게이트 (인트로 애니메이션 + 폼)

> [!summary] 역할
> 초기 인증 상태 확인. localStorage에 Operator 있으면 통과, 아니면 intro → form 순서. 로고 scale/translate 애니메이션.

## 1. 이 파일의 역할
- GatePhase: "loading" | "intro" | "form" | "authed"
- LogoState: "center" | "above-card"
- SHRINK_TRANSFORM: scale(0.333) translateY(...) 로고 축소 이동
- prefers-reduced-motion 존중 (애니메이션 스킵, 즉시 form/authed)

## 2. 실제 원본 위치
`frontend/app/legacy/_components/login/MesLoginGate.tsx` — 약 150줄

## 3. 주요 import
```typescript
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { OperatorLoginCard } from "./OperatorLoginCard";
import { clearCurrentOperator, getStoredBootId, readCurrentOperator } from "./useCurrentOperator";
```

## 4. 어디서 쓰이는지
- 앱 최상단: 모든 protected 라우트 래퍼
- Operator 인증 상태 확인/토큰 갱신

## 5. ⚠️ 위험 포인트
- **로고 위치 계산이 복잡** — CSS transform 수동 계산 (viewport/card 높이 의존). 반응형 변경 시 재계산 필수
- timersRef.current로 timer 관리 — cleanup 시 clearTimeout 호출 필수 (memory leak 방지)
- readCurrentOperator() 호출 후 API 호출 (부팅 토큰 갱신?) — 로직 확인 필수

## 6. 수정 전 체크
- localStorage에 operator 없을 때 phase="form" 확인
- ESC 또는 logout 후 phase="intro" 확인
- prefers-reduced-motion 환경에서 animation 스킵 확인
