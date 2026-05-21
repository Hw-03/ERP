"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

type Tone = "danger" | "warning";

const TONE_COLOR: Record<Tone, string> = {
  danger: LEGACY_COLORS.red as string,
  warning: LEGACY_COLORS.yellow as string,
};

/**
 * 모바일 inline 에러 박스. message 가 falsy 면 null.
 * 사용처가 별도 조건부 렌더링 안 해도 되도록 빈 메시지를 자체 처리.
 */
export function ErrorAlert({
  message,
  tone = "danger",
  className,
}: {
  message: string | null | undefined;
  tone?: Tone;
  className?: string;
}) {
  if (!message) return null;
  const color = TONE_COLOR[tone];
  return (
    <div
      role="alert"
      className={clsx(TYPO.caption, "rounded-[10px] px-3 py-2", className)}
      style={{
        background: `${color}18`,
        color,
      }}
    >
      {message}
    </div>
  );
}
