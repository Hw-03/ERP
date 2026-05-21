---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/login/OperatorLoginCard.tsx
tags: [vault, code-note, b-tier]
---

# OperatorLoginCard.tsx — 작업자 PIN 로그인 카드

> [!summary] 역할
> 직원 선택 + 4자리 PIN → 검증 API. 검증 성공 시 setCurrentOperator() + onLogin() 콜백.

## 1. 이 파일의 역할
- OperatorLoginCardProps: { onLogin: () => void }
- selected: Employee | null (EmployeeCombobox에서 선택)
- pin: 숫자만 (regex 필터링), 4자리 고정
- api.verifyEmployeePin(employee_id, pin) 호출 → Operator 저장
- canSubmit = !!selected && pin.length===4 && !loading

## 2. 실제 원본 위치
`frontend/app/legacy/_components/login/OperatorLoginCard.tsx` — 약 120줄

## 3. 주요 import
```typescript
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Loader2, Lock, RotateCcw } from "lucide-react";
import { api, type Employee } from "@/lib/api";
import { setCurrentOperator, type Operator } from "./useCurrentOperator";
import { useLoginEmployees } from "./useLoginEmployees";
import { EmployeeCombobox } from "./EmployeeCombobox";
```

## 4. 어디서 쓰이는지
- MesLoginGate의 form phase
- Employee 로그인 (작업자 선택 + PIN)

## 5. ⚠️ 위험 포인트
- **PIN은 4자리만 허용** — 1-3자리 입력 후 제출 불가 (UX: "남은 자리 수" 표시 권장)
- handlePinChange에서 non-digit 제거 (regex /\D/g) — 복붙 시 자동 정제
- verifyEmployeePin 응답은 full Employee 객체 → Operator 필드 매핑 (필드 누락 시 주의)
- error state는 submit 실패 시만 표시 (PIN 변경하면 clear)

## 6. 수정 전 체크
- selected=null → submit 버튼 disabled 확인
- pin="123" → canSubmit=false 확인
- pin="1234" → submit 버튼 enabled 확인
- submit 후 로딩 스피너 표시 확인
