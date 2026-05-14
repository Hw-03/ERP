#!/bin/bash
# DEXCOWIN MES — Multi-Agent Launcher

SESSION="mes-agents"
PROJECT="/mnt/c/ERP"

# 기존 세션 있으면 제거
tmux kill-session -t $SESSION 2>/dev/null

# 메인 세션 생성 (CEO 관제탑)
tmux new-session -d -s $SESSION -x 220 -y 55
tmux send-keys -t $SESSION "cd $PROJECT && claude" Enter

# 오른쪽 영역 — Frontend 에이전트
tmux split-window -t $SESSION -h -p 50
tmux send-keys -t $SESSION "cd $PROJECT && claude" Enter

# Frontend 아래 — Backend 에이전트
tmux split-window -t $SESSION -v -p 50
tmux send-keys -t $SESSION "cd $PROJECT && claude" Enter

# CEO 아래 — QA 에이전트
tmux select-pane -t $SESSION.0
tmux split-window -t $SESSION -v -p 35
tmux send-keys -t $SESSION "cd $PROJECT && claude" Enter

# CEO 팬 선택 (왼쪽 상단)
tmux select-pane -t $SESSION.0

echo ""
echo "✓ DEXCOWIN MES 에이전트 팀 준비 완료"
echo ""
echo "팬 배치:"
echo "  [0] CEO 관제탑    → docs/agents/ceo.md 역할 참고"
echo "  [1] Frontend      → docs/agents/frontend.md 역할 참고"
echo "  [2] Backend       → docs/agents/backend.md 역할 참고"
echo "  [3] QA            → docs/agents/qa.md 역할 참고"
echo ""
echo "공유 회의록: docs/agents/meeting.md"
echo ""
echo "접속 중..."
sleep 1

tmux attach -t $SESSION
