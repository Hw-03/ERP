import { DirectionCard } from "./IoWorkTypeStep";
import type { IoSubType } from "./types";

export function MaterialDirectionStep({ selected, onSelect }: {
  selected: IoSubType | null;
  onSelect: (subType: IoSubType) => void;
}) {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-4">
      <DirectionCard dir="in" prefixLabel="" active={selected === "receive_supplier"} onClick={() => onSelect("receive_supplier")} />
      <DirectionCard dir="out" prefixLabel="" active={selected === "outbound_supplier"} onClick={() => onSelect("outbound_supplier")} />
    </div>
  );
}
