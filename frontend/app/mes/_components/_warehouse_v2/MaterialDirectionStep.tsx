import Image from "next/image";
import { DirectionCard } from "./IoWorkTypeStep";
import type { IoSubType } from "./types";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import presentation from "../mobile/mobilePresentation.module.css";

export function MaterialDirectionStep({ selected, onSelect, mobilePresentation = false, tube = false }: {
  selected: IoSubType | null;
  onSelect: (subType: IoSubType) => void;
  mobilePresentation?: boolean;
  tube?: boolean;
}) {
  const receive: IoSubType = tube ? "tube_receive_supplier" : "receive_supplier";
  const outbound: IoSubType = tube ? "tube_outbound_supplier" : "outbound_supplier";
  if (mobilePresentation) {
    return (
      <div className={presentation.twoChoices}>
        {([
          { subType: receive, label: "입고", direction: "in" },
          { subType: outbound, label: "출고", direction: "out" },
        ] as const).map(({ subType, label, direction }) => {
          const active = selected === subType;
          const color = direction === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
          return (
            <button
              key={subType}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(subType)}
              className={`${presentation.directionChoice} ${presentation.illustratedChoice}`}
              style={{
                background: tint(color, active ? 16 : 7),
                borderColor: active ? color : tint(color, 25),
                borderWidth: active ? 2 : 1,
                color: active ? color : LEGACY_COLORS.text,
              }}
            >
              <span>{label}</span>
              <Image
                src={`/images/warehouse/dexray-stock-${direction}.webp`}
                alt=""
                width={840}
                height={560}
                unoptimized
                loading="eager"
                className={presentation.choiceArt}
                draggable={false}
              />
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-4">
      <DirectionCard dir="in" prefixLabel="" active={selected === receive} onClick={() => onSelect(receive)} />
      <DirectionCard dir="out" prefixLabel="" active={selected === outbound} onClick={() => onSelect(outbound)} />
    </div>
  );
}
