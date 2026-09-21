import { LEGACY_COLORS } from "@/lib/mes/color";

const BLOCK_STYLE = { background: LEGACY_COLORS.s3 };
const CARD_STYLE = { background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border };

export function MesViewportSkeleton() {
  return (
    <div
      className="flex h-screen w-full gap-3 overflow-hidden p-3"
      style={{ background: LEGACY_COLORS.bg }}
      role="status"
      aria-busy="true"
      aria-label="DEXCOWIN MES 화면 준비 중"
    >
      <aside
        data-testid="viewport-skeleton-sidebar"
        className="hidden h-full w-[76px] shrink-0 flex-col items-center gap-4 rounded-[20px] border px-3 py-5 lg:flex"
        style={CARD_STYLE}
      >
        <Pulse className="h-10 w-10 rounded-[12px]" />
        {Array.from({ length: 7 }, (_, index) => (
          <Pulse key={index} className="h-10 w-10 rounded-[12px]" />
        ))}
      </aside>
      <main data-testid="viewport-skeleton-content" className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex h-14 shrink-0 items-center justify-between rounded-[16px] border px-4" style={CARD_STYLE}>
          <Pulse className="h-6 w-36 rounded" />
          <Pulse className="h-9 w-24 rounded-[10px]" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-[82px] rounded-[16px] border p-4 lg:h-[100px]" style={CARD_STYLE}>
              <Pulse className="h-5 w-2/3 rounded" />
              <Pulse className="mt-3 h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
        <div className="h-[46px] shrink-0 rounded-[14px] border lg:h-[58px]" style={CARD_STYLE} />
        <div className="min-h-0 flex-1 rounded-[16px] border p-4" style={CARD_STYLE}>
          <Pulse className="h-10 w-full rounded-[10px]" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Pulse key={index} className="h-10 w-full rounded-[8px]" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function Pulse({ className }: { className: string }) {
  return <div className={`motion-safe:animate-pulse ${className}`} style={BLOCK_STYLE} />;
}
