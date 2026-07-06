import type { ReactNode } from "react";

export const MOBILE_FRAME_WIDTH = 430;
export const TABLET_FRAME_WIDTH = 720;
export const MOBILE_FRAME_REFERENCE_HEIGHT = 932;

export function MobileViewportFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-[var(--c-bg)]">
      <div className="mx-auto h-full w-full max-w-[430px] overflow-hidden md:max-w-[720px]">
        {children}
      </div>
    </div>
  );
}
