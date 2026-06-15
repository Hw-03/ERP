# Welcome to DEXCOWIN MES

## How We Use Claude

Based on Hw-03's usage over the last 30 days (23 sessions):

Work Type Breakdown:
  Build Feature   █████████░░░░░░░░░░░  44%
  Plan / Design   ██████░░░░░░░░░░░░░░  31%
  Improve Quality ███░░░░░░░░░░░░░░░░░  13%
  Write Docs      █░░░░░░░░░░░░░░░░░░░   6%
  Prototype       █░░░░░░░░░░░░░░░░░░░   6%

Top Skills & Commands:
  /compact                        ████████████████████  54x/month
  /grill-me                       ████░░░░░░░░░░░░░░░░  10x/month
  /model                          ██░░░░░░░░░░░░░░░░░░   5x/month
  /improve-codebase-architecture  ░░░░░░░░░░░░░░░░░░░░   1x/month

Top MCP Servers:
  playwright  ████████████████████  763 calls

## Your Setup Checklist

### Codebases
- [ ] erp — github.com/hw-03/erp

### MCP Servers to Activate
- [ ] playwright — 브라우저 자동화 및 UI 테스트. Claude Code MCP 설정에서 playwright 서버를 추가하세요.

### Skills to Know About
- /compact — 컨텍스트가 길어지면 요약 후 새 창으로 전환. 긴 세션에서 필수 (월 54회 사용).
- /grill-me — 설계·방향 결정 전 AI가 질문을 던져 꼼꼼히 검토. 월 10회 사용.
- /model — 작업 중 모델(Haiku / Sonnet / Opus) 실시간 전환.
- /improve-codebase-architecture — 아키텍처 개선 기회 분석 및 리팩토링 방향 제안.

## Team Tips

- **시작 / 중지 스크립트**: 백엔드는 항상 `scripts/dev/start-backend.ps1` (좀비 워커 자동 정리 + /health/live 확인) 와 `scripts/dev/stop-backend.ps1` (포트 8010 PID 강제 종료) 를 사용한다. 백엔드 로그가 0줄이면 좀비 의심 — stop 후 start 로 재기동.
- **커밋 / 푸시는 명시 요청 시에만**: AI 가 자동으로 커밋·푸시하지 않는다. 커밋 메시지는 `YYYY-MM-DD area: 요약` 형식 (예: `2026-05-29 backend: 시리얼 부여 수정`).
- **검증 게이트**: 커밋 전 `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1` 통과. backend pytest / frontend lint·tsc·vitest / next build / OpenAPI drift 5게이트.
- **DB 변경**: 서버 기동만으로 DB 가 바뀌면 안 됨. 스키마 변경·시드는 `cd backend && python bootstrap_db.py --all`.
- **동결 영역**: `frontend/app/legacy/_components/_weekly_sections/` 와 `DesktopWeeklyReportView.tsx` 는 동결 (2026-05-24). 명시 요청 없으면 우회.
- **응답 규칙**: AI 는 한국어, 결론 먼저, 짧고 명확하게.

자세한 작업 규칙은 [CLAUDE.md](CLAUDE.md) 참조.

## Get Started

1. **저장소 클론 + 의존성 설치** — `start.bat` 1회 실행으로 backend `pip install` + frontend `npm install` 자동 수행
2. **활성 화면 확인** — 브라우저에서 `http://localhost:3000/legacy` 접속 (입출고 / 내역 / 관리자 / 대시보드)
3. **문서 허브 1회 훑기** — [README.md](README.md) 문서 허브 섹션의 [_attic/docs/ARCHITECTURE.md](_attic/docs/ARCHITECTURE.md), [_attic/docs/GLOSSARY.md](_attic/docs/GLOSSARY.md), [_attic/docs/ITEM_CODE_RULES.md](_attic/docs/ITEM_CODE_RULES.md), [_attic/docs/REPO_LAYOUT.md](_attic/docs/REPO_LAYOUT.md)
4. **첫 작업 전 검증** — `verify_local.ps1` 한 번 돌려 환경 정상 확인
5. **Claude Code 세션 시작** — CLAUDE.md 규칙대로 작업 시작

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
