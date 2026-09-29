import { DirectionCard } from "./IoWorkTypeStep";
import type { IoSubType } from "./types";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import presentation from "../mobile/mobilePresentation.module.css";

export function MaterialDirectionStep({ selected, onSelect, mobilePresentation = false }: {
  selected: IoSubType | null;
  onSelect: (subType: IoSubType) => void;
  mobilePresentation?: boolean;
}) {
  if (mobilePresentation) {
    return (
      <div className={presentation.twoChoices}>
        {([
          { subType: "receive_supplier", label: "입고", icon: ArrowDownToLine },
          { subType: "outbound_supplier", label: "출고", icon: ArrowUpFromLine },
        ] as const).map(({ subType, label, icon: Icon }) => (
          <button
            key={subType}
            type="button"
            aria-pressed={selected === subType}
            onClick={() => onSelect(subType)}
            className={presentation.directionChoice}
            style={{
              borderColor: selected === subType ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              background: selected === subType ? tint(LEGACY_COLORS.blue, 10) : LEGACY_COLORS.s2,
              color: selected === subType ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
            }}
          >
            <span className={presentation.choiceIcon} style={{ color: subType === "outbound_supplier" ? LEGACY_COLORS.red : LEGACY_COLORS.blue }} aria-hidden="true"><Icon /></span>
            {label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-4">
      <DirectionCard dir="in" prefixLabel="" active={selected === "receive_supplier"} onClick={() => onSelect("receive_supplier")} />
      <DirectionCard dir="out" prefixLabel="" active={selected === "outbound_supplier"} onClick={() => onSelect("outbound_supplier")} />
    </div>
  );
}
