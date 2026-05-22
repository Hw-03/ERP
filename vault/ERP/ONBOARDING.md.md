---
type: file-explanation
source_path: "ONBOARDING.md"
importance: normal
layer: meta
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ONBOARDING.md — AI/팀원 온보딩 보조 문서

## 이 파일은 무엇을 책임지나

새 작업자가 Claude Code 환경을 어떻게 쓰는지 안내하는 문서입니다.

## 업무 흐름에서의 의미

제품 기능 문서라기보다는 협업 환경 안내에 가깝습니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Welcome to DEXCOWIN MES`
- `How We Use Claude`
- `Your Setup Checklist`
- `Codebases`
- `MCP Servers to Activate`
- `Skills to Know About`
- `Team Tips`
- `Get Started`

## 연결되는 파일

- [[ERP/📁_ERP]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```md
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

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.
```
