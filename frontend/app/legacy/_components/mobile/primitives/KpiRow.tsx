"use client";

import clsx from "clsx";

export function KpiRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx("flex gap-2", className)}>{children}</div>;
}
