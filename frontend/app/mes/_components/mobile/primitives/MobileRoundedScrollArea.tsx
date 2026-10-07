import type { ReactNode } from "react";
import clsx from "clsx";

/** 고정된 네 모서리 안에서 스크롤하며, 탭바의 8px와 합쳐 하단 간격을 12px로 유지한다. */
export function MobileRoundedScrollArea({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <div data-testid="mobile-rounded-scroll-frame" className="mx-3 mb-1 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[20px]">
      <div className={clsx("scrollbar-hide flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto", className)}>
        {children}
      </div>
    </div>
  );
}
