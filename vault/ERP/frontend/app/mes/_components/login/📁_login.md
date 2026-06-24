# 📁 login

## 이 폴더는 뭐예요?

MES 로그인 게이트 UI입니다. 직원이 PIN을 입력해 인증하는 화면이 여기 있습니다.

## 주요 파일

| 파일 | 역할 |
|------|------|
| `MesLoginGate.tsx` | 로그인 완료 전/후 라우팅 게이트 |
| `OperatorLoginCard.tsx` | PIN 입력 카드 UI |
| `EmployeeCombobox.tsx` | 직원 선택 콤보박스 |
| `useCurrentOperator.ts` | 현재 로그인한 직원 상태 |
| `useLoginEmployees.ts` | 직원 목록 페칭 |

## 언제 여기를 보나요?

- 로그인 화면 UI를 수정할 때
- PIN 인증 흐름이 이상할 때

## 관련 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/pin_auth.py.md]] — PIN 인증 서비스
- [[ERP/frontend/lib/auth/📁_auth.md]] — 인증 공용 로직
