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

- **시작 / 중지 스크립트**: 백엔드는 항상 `scripts/dev/start-backend.ps1` (`/health/live`로 프로세스 소유권 확인 + `/health/ready` 준비 완료 대기) 와 `scripts/dev/stop-backend.ps1` (포트 8011 PID 강제 종료 — dev) 를 사용한다. 백엔드 로그가 0줄이면 좀비 의심 — stop 후 start 로 재기동.
- **커밋 / 푸시는 명시 요청 시에만**: AI 가 자동으로 커밋·푸시하지 않는다. 커밋 메시지는 `YYYY-MM-DD area: 요약` 형식 (예: `2026-05-29 backend: 시리얼 부여 수정`).
- **검증 게이트**: 구현 중에는 관련 테스트만 반복하고, 커밋 전 저장소 루트에서 `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode smart -ChangeSet staged`를 실행한다. `staged`는 영향 계획의 범위이며 게이트는 현재 working tree에서 실행되므로, 정확한 staged 스냅샷 검증은 깨끗한 전용 worktree에서 한다. 문서 변경에는 Markdown 공백·유지 문서 링크 검사를 함께 실행한다. 검증 인프라 변경이나 명시적 전체 확인은 `-Mode full`, GitHub CI는 항상 전체 게이트를 사용한다.
- **DB 변경**: 서버 기동만으로 DB 가 바뀌면 안 됨. 스키마 변경·시드는 `cd backend && python bootstrap_db.py --all`.
- **동결 영역**: `frontend/app/mes/_components/_weekly_sections/` 와 `DesktopWeeklyReportView.tsx` 는 동결 (2026-05-24). 명시 요청 없으면 우회.
- **응답 규칙**: AI 는 한국어, 결론 먼저, 짧고 명확하게.

자세한 작업 규칙은 [CLAUDE.md](../CLAUDE.md) 참조.

## Get Started

1. **저장소 클론 + 의존성 설치** — `start.bat` 1회 실행으로 backend `pip install` + frontend `npm install` 자동 수행
2. **활성 화면 확인** — 브라우저에서 `http://localhost:3001/mes` 접속. 데스크톱은 사이드바 탭(대시보드·입출고·입출고 내역·출하·불량·창고 지도·보고서)과 하단 설정에서 흐름을 확인한다.
3. **문서 허브 1회 훑기** — [루트 README](../README.md) 문서 허브 섹션의 [ARCHITECTURE.md](docs/ARCHITECTURE.md), [GLOSSARY.md](docs/GLOSSARY.md), [ITEM_CODE_RULES.md](docs/ITEM_CODE_RULES.md), [REPO_LAYOUT.md](docs/REPO_LAYOUT.md)
4. **첫 작업 전 검증** — `verify_local.ps1 -Mode smart -PlanOnly`로 환경과 검증 계획 확인
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
