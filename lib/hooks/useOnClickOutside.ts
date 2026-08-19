import { useEffect, type RefObject } from "react";

/**
 * Fires `onOutside` when a pointer-down lands outside `ref`'s element.
 * Shared by every popover/dropdown in the app (settings, preferences,
 * update panels, Add Custom Field) so they close on an outside click
 * instead of staying open until the trigger button is clicked again.
 *
 * Listens on "pointerdown" rather than "click" so the close happens before
 * whatever was clicked underneath reacts to its own click handler — and
 * since the trigger button lives inside `ref`'s element alongside the
 * popover content, a click on the trigger itself is correctly seen as
 * "inside" and doesn't fight with the button's own open/close toggle.
 */
export function useOnClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(e: PointerEvent) {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      onOutside();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [ref, onOutside, enabled]);
}
