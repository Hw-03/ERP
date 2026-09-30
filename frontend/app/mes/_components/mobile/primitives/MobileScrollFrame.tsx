import type { ReactNode } from "react";
import styles from "./MobileScrollFrame.module.css";

/** Keep corner masks on the visible viewport, independently of the list's height. */
export function MobileScrollFrame({ children, roundTop = false }: { children: ReactNode; roundTop?: boolean }) {
  return (
    <div className="relative mx-3 flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={styles.viewport} data-testid="mobile-scroll-viewport">
        {children}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30" data-testid="mobile-scroll-frame">
        {roundTop && <>
          <span className="absolute left-0 top-0 h-5 w-5" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 19px, var(--c-bg) 20px)" }} />
          <span className="absolute right-0 top-0 h-5 w-5" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 19px, var(--c-bg) 20px)" }} />
        </>}
        <span className="absolute bottom-0 left-0 h-5 w-5" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 19px, var(--c-bg) 20px)" }} />
        <span className="absolute bottom-0 right-0 h-5 w-5" style={{ background: "radial-gradient(circle at 0 0, transparent 0 19px, var(--c-bg) 20px)" }} />
      </div>
    </div>
  );
}
