"use client";

import { Component, createRef, type HTMLAttributes, type ReactNode } from "react";
import { adminFadeDuration } from "../adminFadeDuration";

interface Props extends HTMLAttributes<HTMLDivElement> { selectionKey?: string; loading?: boolean; children: ReactNode }
interface Snapshot { node: HTMLDivElement; scroll: Array<{ index: number; top: number; left: number }> }

/** 변경 직전 DOM을 포착해 기존 내용을 페이드한다. 실제 폼과 카드 배경은 숨기지 않는다. */
export class AdminDetailViewport extends Component<Props, Record<string, never>, Snapshot | null> {
  private viewport = createRef<HTMLDivElement>();
  private overlay: HTMLDivElement | null = null;
  private animation: Animation | null = null;

  getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    const element = this.viewport.current;
    if (previous.selectionKey === this.props.selectionKey || previous.selectionKey === undefined || this.props.selectionKey === undefined || !element?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches || element.closest('[data-admin-entry-covered="true"]')) return null;
    const section = element.closest<HTMLElement>("[data-admin-section-reveal]");
    if (section && Number.parseFloat(getComputedStyle(section).opacity) < 1) return null;
    const node = element.cloneNode(true) as HTMLDivElement;
    node.style.padding = getComputedStyle(element).padding;
    node.removeAttribute("data-admin-detail-content");
    node.removeAttribute("data-scrollbar-rail-viewport");
    for (const child of [node, ...node.querySelectorAll("[id], [name], [for]")]) {
      child.removeAttribute("id");
      child.removeAttribute("name");
      // Snapshot labels must not become additional labels for the live form inputs.
      child.removeAttribute("for");
    }
    const scroll = [element, ...element.querySelectorAll<HTMLElement>("*")]
      .map((child, index) => ({ index, top: child.scrollTop || 0, left: child.scrollLeft || 0 }))
      .filter(({ top, left }) => top !== 0 || left !== 0);
    return { node, scroll };
  }

  componentDidUpdate(previous: Props, _state: Record<string, never>, snapshot: Snapshot | null): void {
    if (previous.selectionKey === this.props.selectionKey) return;
    this.clearOverlay();
    const element = this.viewport.current;
    if (!snapshot || !element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const overlay = snapshot.node;
    // 이전/다음 화면의 반투명 카드와 버튼이 중첩 합성되지 않게 바탕도 함께 페이드한다.
    // s1 itself has alpha in both themes; composite it over bg to make the snapshot opaque.
    overlay.style.backgroundColor = "var(--c-bg)";
    overlay.style.backgroundImage = "linear-gradient(var(--c-s1), var(--c-s1))";
    overlay.setAttribute("data-admin-detail-snapshot", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    // 상위 화면에 transform이 있어도 원본과 같은 부모 좌표계를 유지한다.
    Object.assign(overlay.style, { position: "absolute", inset: "auto", left: `${element.offsetLeft}px`, top: `${element.offsetTop}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", overflow: "hidden", pointerEvents: "none", zIndex: "10", animation: "none" });
    element.parentElement?.appendChild(overlay);
    const children = [overlay, ...overlay.querySelectorAll<HTMLElement>("*")];
    snapshot.scroll.forEach(({ index, top, left }) => { const child = children[index]; if (child) { child.scrollTop = top; child.scrollLeft = left; } });
    this.overlay = overlay;
    this.animation = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: adminFadeDuration(element, previous.loading && !this.props.loading ? "read" : "selection"), easing: "ease-out", fill: "forwards" });
    this.animation.onfinish = () => { if (this.overlay === overlay) this.clearOverlay(); };
  }

  componentWillUnmount(): void { this.clearOverlay(); }

  private clearOverlay(): void {
    this.animation?.cancel();
    this.animation = null;
    this.overlay?.remove();
    this.overlay = null;
  }

  render(): ReactNode {
    const { selectionKey: _selectionKey, loading: _loading, children, ...attributes } = this.props;
    return <div {...attributes} ref={this.viewport}>{children}</div>;
  }
}
