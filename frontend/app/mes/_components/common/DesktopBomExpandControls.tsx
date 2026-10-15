import type { ReactElement } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

type Props = {
  hasCollapsedItems: boolean;
  hasExpandedItems: boolean;
  onExpand: () => void;
  onCollapse: () => void;
};

const buttonClassName = "h-8 rounded-[10px] border px-3 text-xs font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]";
const buttonStyle = { borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 };

/** 두 데스크톱 BOM 화면의 펼치기·접기 버튼을 같은 순서와 모양으로 표시한다. */
export function DesktopBomExpandControls({ hasCollapsedItems, hasExpandedItems, onExpand, onCollapse }: Props): ReactElement {
  return <>
    <button type="button" onClick={onExpand} disabled={!hasCollapsedItems} className={buttonClassName} style={buttonStyle}>
      모두 펼치기
    </button>
    <button type="button" onClick={onCollapse} disabled={!hasExpandedItems} className={buttonClassName} style={buttonStyle}>
      모두 접기
    </button>
  </>;
}
