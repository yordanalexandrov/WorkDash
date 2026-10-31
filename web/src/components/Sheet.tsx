import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { growFrom, reducedMotion, shrinkTo } from "../motion.js";

type SheetProps = {
  /** What the dialog is about, for screen readers. */
  label: string;
  /** The rect it grows out of: the card or row it opened from, as it was then. */
  from: DOMRectReadOnly;
  /** Set to shrink back and close; `onClosed` follows once it has. */
  closing: boolean;
  /** Where to shrink back to now; null when the source is gone, and it shrinks to `from`. */
  target(): DOMRectReadOnly | null;
  /** ✕ or a click on the shade asks to close. */
  onClose(): void;
  onClosed(): void;
  children: ComponentChildren;
};

const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * A sheet over the page that grows out of the rect it opened from and shrinks back into it ("Detail sheet" in docs/design.md):
 * a shade behind it, ✕ with the focus on it, and Tab kept inside. It knows nothing of PRs; Esc is the page's shortcut.
 */
export function Sheet({ label, from, closing, target, onClose, onClosed, children }: SheetProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    close.current?.focus({ preventScroll: true });
    if (reducedMotion()) return;
    growFrom(sheet.current!, from);
    inner.current!.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], {
      duration: 200,
      delay: 120,
      easing: "linear",
      fill: "backwards",
    });
    shade.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "linear" });
  }, []);

  useLayoutEffect(() => {
    if (!closing) return;
    if (!reducedMotion()) {
      inner.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "linear", fill: "forwards" });
      shade.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: "linear", fill: "forwards" });
    }
    let mounted = true;
    void shrinkTo(sheet.current!, target() ?? from).then(() => mounted && onClosed());
    return () => {
      mounted = false;
    };
  }, [closing]);

  // Tab and Shift+Tab go round the sheet's own controls.
  const trap = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const items = [...sheet.current!.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheet.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <div ref={shade} class="backdrop" aria-hidden="true" onClick={onClose} />
      <div ref={sheet} class="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={trap}>
        <div ref={inner} class="inner">
          <button ref={close} type="button" class="x" title="Затвори (Esc)" aria-label="Затвори" onClick={onClose}>
            ✕
          </button>
          {children}
        </div>
      </div>
    </>
  );
}
