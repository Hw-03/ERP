"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { OPERATOR_CHANGE_EVENT, readCurrentOperator, type Operator } from "./useCurrentOperator";
import { OPERATOR_IDLE_MS, readOperatorActivity, writeOperatorActivity, type OperatorActivity } from "./operatorActivity";

const ACTIVITY_EVENTS = ["pointerdown", "touchstart", "touchmove", "keydown", "wheel", "input", "click"];
const GUARDED_EVENTS = [...ACTIVITY_EVENTS, "pointerup", "pointercancel", "mousedown", "mouseup", "touchend", "keyup", "focusin"];

interface IdleOperatorConfirmation {
  operator: Operator | null;
  dialogRef: RefObject<HTMLDialogElement | null>;
  continueAsOperator: () => void;
}

/** Captures before application shortcuts; expiry is checked before accepting activity. */
export function useIdleOperatorConfirmation(enabled: boolean): IdleOperatorConfirmation {
  const [operator, setOperator] = useState<Operator | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const enabledRef = useRef(false);
  const requiredRef = useRef<Operator | null>(null);
  const checkRef = useRef<() => Operator | null>(() => null);

  useLayoutEffect(() => {
    enabledRef.current = enabled;
    checkRef.current();
  }, [enabled]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let suppressClick = false;

    const arm = (activity: OperatorActivity): void => {
      clearTimeout(timer);
      timer = setTimeout(check, Math.max(1, activity.lastActivityAt + OPERATOR_IDLE_MS - Date.now()));
    };

    function check(): Operator | null {
      clearTimeout(timer);
      const current = enabledRef.current ? readCurrentOperator() : null;
      if (!current) {
        requiredRef.current = null;
        setOperator(null);
        return null;
      }
      const activity = readOperatorActivity(current.employee_id);
      if (!activity || activity.confirmationRequired || Date.now() - activity.lastActivityAt >= OPERATOR_IDLE_MS) {
        requiredRef.current = current;
        if (!activity?.confirmationRequired) {
          writeOperatorActivity({ employeeId: current.employee_id, lastActivityAt: activity?.lastActivityAt ?? Date.now(), confirmationRequired: true });
        }
        setOperator((previous) => previous?.employee_id === current.employee_id
          && previous.name === current.name && previous.department === current.department ? previous : current);
      } else {
        requiredRef.current = null;
        setOperator(null);
        arm(activity);
      }
      return current;
    }

    const block = (event: Event): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const guard = (event: Event): void => {
      if (!enabledRef.current) return;
      // Keep underlying notification focus handlers from reclaiming modal focus.
      if (event.type === "focusin") {
        if (requiredRef.current) event.stopImmediatePropagation();
        return;
      }
      const wasRequired = requiredRef.current !== null;
      const current = check();
      if (!requiredRef.current) {
        if (current && ACTIVITY_EVENTS.includes(event.type)) {
          const activity = { employeeId: current.employee_id, lastActivityAt: Date.now(), confirmationRequired: false };
          writeOperatorActivity(activity);
          arm(activity);
        }
        return;
      }
      if (!wasRequired) {
        suppressClick = event.type !== "click";
        block(event);
        return;
      }
      const inside = event.target instanceof Node && dialogRef.current?.contains(event.target);
      if (inside && ["pointerdown", "touchstart", "keydown"].includes(event.type)) suppressClick = false;
      if (event.type === "click" && suppressClick) {
        suppressClick = false;
        block(event);
        return;
      }
      if (!inside) {
        block(event);
        return;
      }
      if (event instanceof KeyboardEvent) {
        event.stopImmediatePropagation();
        // Native modal Tab can leave for browser chrome; wrap its two action buttons.
        if (event.type === "keydown" && event.key === "Tab") {
          const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
          const first = buttons?.[0];
          const last = buttons?.[buttons.length - 1];
          if (first && last && ((!event.shiftKey && document.activeElement === last)
            || (event.shiftKey && document.activeElement !== last))) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          }
        }
        // Native button activation remains available without background shortcuts.
        if (event.key === "Escape" || ((event.key === "Enter" || event.key === " ")
          && !(event.target instanceof HTMLButtonElement))) event.preventDefault();
      }
    };

    const onVisibility = (): void => { if (document.visibilityState === "visible") check(); };
    checkRef.current = check;
    for (const name of GUARDED_EVENTS) window.addEventListener(name, guard, { capture: true, passive: false });
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    window.addEventListener(OPERATOR_CHANGE_EVENT, check);
    document.addEventListener("visibilitychange", onVisibility);
    check();
    return () => {
      clearTimeout(timer);
      checkRef.current = () => null;
      for (const name of GUARDED_EVENTS) window.removeEventListener(name, guard, true);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener(OPERATOR_CHANGE_EVENT, check);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const continueAsOperator = useCallback((): void => {
    const current = readCurrentOperator();
    if (!current || current.employee_id !== requiredRef.current?.employee_id) return;
    writeOperatorActivity({ employeeId: current.employee_id, lastActivityAt: Date.now(), confirmationRequired: false });
    checkRef.current();
  }, []);

  return { operator, dialogRef, continueAsOperator };
}
