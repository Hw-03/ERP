import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/lib/api/types";
import { NotificationDialog } from "../NotificationDialog";

function notification(overrides: Partial<AppNotification> & { display_body?: string | null } = {}): AppNotification {
  return {
    notification_id: "n-1", recipient_employee_id: "e-1", type: "approval_request",
    title: "새 결재 요청", body: "김영희 · warehouse_to_dept · 볼트 · 총 3개",
    target_tab: null, target_section: null, related_request_id: null,
    is_read: false, created_at: "2026-07-01T01:00:00Z", ...overrides,
  } as AppNotification;
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    items: [notification()], unread: 1, filter: "all" as const,
    onFilterChange: vi.fn(), onClose: vi.fn(), onItemClick: vi.fn(), onMarkAll: vi.fn(),
    onDeleteItem: vi.fn(), onDeleteRead: vi.fn(), hasRead: false,
    loginPopupEnabled: false, onToggleLoginPopup: vi.fn(), ...overrides,
  };
}

afterEach(() => { document.body.style.overflow = ""; });

describe("NotificationDialog", () => {
  it("전환되어 주소가 제거된 읽은 결재 알림은 클릭을 막고 기록과 삭제는 유지한다", () => {
    const p = props({ items: [notification({ is_read: true, related_request_id: "fallback-request" })], unread: 0 });
    render(<NotificationDialog {...p} />);
    const row = screen.getByRole("button", { name: /새 결재 요청/ });
    expect(row).toBeDisabled();
    expect(screen.getByText("볼트 · 총 3개")).toBeInTheDocument();
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(p.onItemClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "알림 삭제" })).toBeEnabled();
  });

  it("미읽음 필터 조회 중에도 이미 받은 전체 수량은 유지한다", () => {
    render(<NotificationDialog {...props({ items: [], unread: 1, unreadKnown: true, filter: "unread", loading: true, hasData: false })} />);
    expect(screen.getByText("읽지 않은 알림 1건")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "알림 목록 불러오는 중" })).toBeInTheDocument();
  });

  it("body 포털과 고정 대화상자를 쓰고 내부 클릭은 닫지 않는다", () => {
    const p = props();
    const { container } = render(<NotificationDialog {...p} />);
    const dialog = screen.getByRole("dialog", { name: "알림" });
    expect(container).toBeEmptyDOMElement();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.parentElement).toHaveClass("fixed", "z-[260]");
    expect(dialog).toHaveClass("max-w-[640px]", "rounded-[24px]");
    fireEvent.click(dialog);
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement!);
    expect(p.onClose).toHaveBeenCalledOnce();
  });

  it("닫기와 Escape를 처리하고 이전 포커스 및 body overflow를 복원한다", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    document.body.style.overflow = "scroll";
    const p = props();
    const { unmount } = render(<NotificationDialog {...p} />);
    expect(screen.getByRole("button", { name: "알림 닫기" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onClose).toHaveBeenCalledOnce();
    unmount();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("scroll");
    opener.remove();
  });

  it("Tab과 Shift+Tab을 대화상자 안에서 순환시킨다", () => {
    const visible = vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
    render(<NotificationDialog {...props({ hasRead: true })} />);
    const close = screen.getByRole("button", { name: "알림 닫기" });
    const last = screen.getByRole("button", { name: "읽은 알림 삭제" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    visible.mockRestore();
  });

  it("포커스한 행이 삭제되거나 배경으로 이동하면 팝업 안으로 포커스를 돌린다", () => {
    const p = props();
    const { rerender } = render(<NotificationDialog {...p} />);
    screen.getByRole("button", { name: "알림 삭제" }).focus();
    rerender(<NotificationDialog {...p} items={[]} />);
    const close = screen.getByRole("button", { name: "알림 닫기" });
    expect(close).toHaveFocus();
    const backgroundButton = document.createElement("button");
    document.body.appendChild(backgroundButton);
    backgroundButton.focus();
    expect(close).toHaveFocus();
    backgroundButton.remove();
  });

  it("현재 목록이 미읽음뿐이어도 오래된 읽은 알림 삭제를 제공한다", () => {
    render(<NotificationDialog {...props({ hasRead: false })} />);
    expect(screen.getByRole("button", { name: "읽은 알림 삭제" })).toBeEnabled();
  });

  it("탭을 키보드로 전환하고 선택 탭만 tab 순서에 넣는다", () => {
    const p = props();
    render(<NotificationDialog {...p} />);
    const all = screen.getByRole("tab", { name: "전체" });
    const unread = screen.getByRole("tab", { name: "안 읽음" });
    expect(all).toHaveAttribute("aria-selected", "true");
    expect(all).toHaveAttribute("tabindex", "0");
    expect(unread).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(all, { key: "ArrowRight" });
    expect(p.onFilterChange).toHaveBeenCalledWith("unread");
    fireEvent.click(unread);
    expect(p.onFilterChange).toHaveBeenCalledWith("unread");
  });

  it("알림 행과 삭제 버튼을 따로 두고 콜백에 원본 알림을 전달한다", () => {
    const p = props();
    render(<NotificationDialog {...p} />);
    const row = screen.getByRole("button", { name: /새 결재 요청/ });
    const remove = screen.getByRole("button", { name: "알림 삭제" });
    expect(row.contains(remove)).toBe(false);
    expect(screen.getByText("김영희")).toBeInTheDocument();
    expect(screen.queryByText("김영희 · 창고 → 부서")).not.toBeInTheDocument();
    expect(screen.getByText("볼트 · 총 3개")).toBeInTheDocument();
    expect(screen.getByText("2026년 07월 01일 10시 00분")).toBeInTheDocument();
    fireEvent.click(row);
    expect(p.onItemClick).toHaveBeenCalledWith(p.items[0]);
    fireEvent.click(remove);
    expect(p.onDeleteItem).toHaveBeenCalledWith("n-1");
  });

  it("이력 업무명과 대표 품목 요약을 표시하고 작성자를 제목 오른쪽으로 옮긴다", () => {
    const item = {
      ...notification({ body: "김영희 · warehouse_to_dept · SR-2026-1", display_body: "김영희 · 창고 → 부서 · 볼트 3개 · 너트 5개 · 총 8개" }),
      display_summary: { requester_name: "김영희", operation_label: "창고 입출고", item_name: "볼트", additional_item_count: 1 },
    };
    render(<NotificationDialog {...props({ items: [item] })} />);
    const title = screen.getByText("창고 입출고");
    expect(title).toHaveClass("text-xl");
    expect(title.parentElement).toHaveClass("min-h-10", "items-center");
    const metadata = screen.getByText("김영희").parentElement;
    expect(metadata?.parentElement).toBe(title.parentElement);
    expect(metadata).toContainElement(screen.getByText("2026년 07월 01일 10시 00분"));
    expect(screen.getByText("볼트")).toBeInTheDocument();
    expect(screen.getByText("외 1품목")).toBeInTheDocument();
    expect(screen.getByText("결재 요청")).toBeInTheDocument();
    expect(screen.queryByText("새 결재 요청")).not.toBeInTheDocument();
    expect(screen.queryByText(/SR-2026-1|총 8개|볼트 3개/)).not.toBeInTheDocument();
  });

  it("안 읽음 필터에서도 서버가 준 항목을 그대로 표시하고 인수인계 본문을 보존한다", () => {
    const item = notification({ notification_id: "n-2", title: "새 인수인계 도착", body: "고압→진공 · 인수 문서", is_read: true });
    render(<NotificationDialog {...props({ filter: "unread", items: [item], unread: 0 })} />);
    expect(screen.getByText("인수 문서", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /새 인수인계 도착/ })).toBeInTheDocument();
  });

  it("상태별 행동 버튼과 로그인 팝업 스위치를 제어한다", () => {
    const p = props({ hasRead: true });
    const { rerender } = render(<NotificationDialog {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "모두 읽음" }));
    fireEvent.click(screen.getByRole("button", { name: "읽은 알림 삭제" }));
    fireEvent.click(screen.getByRole("switch", { name: "로그인 팝업" }));
    expect(p.onMarkAll).toHaveBeenCalledOnce();
    expect(p.onDeleteRead).toHaveBeenCalledOnce();
    expect(p.onToggleLoginPopup).toHaveBeenCalledOnce();
    rerender(<NotificationDialog {...props({ unread: 0, hasRead: false, actionsPending: true, loginPopupUpdating: true })} />);
    expect(screen.getByRole("button", { name: "모두 읽음" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "읽은 알림 삭제" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "로그인 팝업" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /새 결재 요청/ })).toBeDisabled();
  });

  it("초기 로딩과 초기 실패 중에는 빈 안내를 숨기고 재시도를 제공한다", () => {
    const { rerender } = render(<NotificationDialog {...props({ items: [], loading: true, hasData: false })} />);
    expect(screen.getByRole("status", { name: "알림 목록 불러오는 중" })).toBeInTheDocument();
    expect(screen.queryByText("알림이 없습니다.")).not.toBeInTheDocument();
    const retry = vi.fn();
    rerender(<NotificationDialog {...props({ items: [], error: "조회 실패", hasData: false, onRetry: retry })} />);
    expect(screen.queryByText("알림이 없습니다.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("갱신 실패 중 기존 항목 및 성공한 빈 상태를 유지한다", () => {
    const { rerender } = render(<NotificationDialog {...props({ error: "갱신 실패", hasData: true })} />);
    expect(screen.getByText("새 결재 요청")).toBeInTheDocument();
    expect(screen.getByText(/갱신 실패/)).toBeInTheDocument();
    rerender(<NotificationDialog {...props({ items: [], unread: 0, error: "갱신 실패", hasData: true, filter: "unread" })} />);
    expect(screen.getByText("읽지 않은 알림이 없습니다.")).toBeInTheDocument();
  });

  it("작업 오류를 알리고 현재 필터의 빈 상태를 표시한다", () => {
    render(<NotificationDialog {...props({ items: [], unread: 0, actionError: "삭제 실패", filter: "all" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("삭제 실패");
    expect(screen.getByText("알림이 없습니다.")).toBeInTheDocument();
  });
});
