"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

export interface QuantityInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> {
  value: string | number;
}

export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(
  function QuantityInput({ className = "", ...props }, ref) {
    return (
      <input
        {...props}
        ref={ref}
        type="number"
        className={`quantity-input ${className}`}
      />
    );
  },
);
