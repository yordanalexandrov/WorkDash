import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { GLIDE, growFrom, morphTransform, reducedMotion, shrinkTo } from "../motion.js";

type SheetProps = {
  /** What the dialog is about, for screen readers. */
  label: string;
  /** The rect it grows out of: the card or row it opened from, as it was then. */
  from: DOMRectReadOnly;
  /** Set to shrink back and close; `onClosed` follows once it has. */
  closing: boolean;
  /** Where to shrink back to now; null when the source is gone, and it shrinks to `from`. */
  target(): DOMRectReadOnly | null;
  /** Nearly the whole window rather than the normal size; it glides from one to the other. */
  expanded: boolean;
  /** ⤢ / ⤡ asks to switch the size. */
  onToggleSize(): void;
  /** ✕ or a click on the shade asks to close. */
  onClose(): void;
  onClosed(): void;
  children: ComponentChildren;
};

const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

// Switching the size, the content fades out before the box glides and back in after it, so no text shows stretched.
const FADE_OUT = { duration: 100, easing: "linear", fill: "forwards" } as const;
const FADE_IN = { duration: 160, easing: "linear", fill: "backwards" } as const;

/**
 * A sheet over the page that grows out of the rect it opened from and shrinks back into it ("Detail sheet" in docs/design.md):
 * a shade behind it, ✕ with the focus on it, and Tab kept inside. ⤢ / ⤡ expand it to nearly the whole window and back.
 * It knows nothing of PRs; Esc and `f` are the page's shortcuts.
 */
export function Sheet({ label, from, closing, target, expanded, onToggleSize, onClose, onClosed, children }: SheetProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  // Whether the box is expanded: it follows `expanded` once the content has faded out. `before` is the rect it glides from.
  const [boxExpanded, setBoxExpanded] = useState(expanded);
  const before = useRef<DOMRectReadOnly | null>(null);
  const fading = useRef<Animation | null>(null);

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
    // A size switch still fading out does not happen: the sheet shrinks from where it is.
    fading.current?.cancel();
    fading.current = null;
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

  // A switch back before the content has faded out only brings it back.
  useLayoutEffect(() => {
    fading.current?.cancel();
    fading.current = null;
    if (expanded === boxExpanded || closing) return;
    const resize = () => {
      fading.current = null;
      before.current = sheet.current!.getBoundingClientRect();
      setBoxExpanded(expanded);
    };
    if (reducedMotion()) return resize();
    const fade = inner.current!.animate([{ opacity: 1 }, { opacity: 0 }], FADE_OUT);
    fading.current = fade;
    fade.finished.then(resize, () => {});
  }, [expanded]);

  useLayoutEffect(() => {
    const rect = before.current;
    before.current = null;
    if (!rect) return;
    const box = sheet.current!;
    const content = inner.current!;
    for (const animation of content.getAnimations()) animation.cancel();
    if (reducedMotion()) return;
    box.animate([{ transform: morphTransform(rect, box.getBoundingClientRect()) }, { transform: "none" }], {
      duration: GLIDE.duration,
      easing: GLIDE.easing,
    });
    content.animate([{ opacity: 0 }, { opacity: 1 }], { ...FADE_IN, delay: Math.round(GLIDE.duration * 0.6) });
  }, [boxExpanded]);

  const sizeButton = expanded ? { label: "Свий", glyph: "⤡" } : { label: "Разпъни", glyph: "⤢" };

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
      <div ref={sheet} class={boxExpanded ? "sheet expanded" : "sheet"} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={trap}>
        <div ref={inner} class="inner">
          <button ref={close} type="button" class="x" title="Затвори (Esc)" aria-label="Затвори" onClick={onClose}>
            ✕
          </button>
          <button
            type="button"
            class="size"
            title={`${sizeButton.label} (F)`}
            aria-label={sizeButton.label}
            aria-pressed={expanded}
            onClick={onToggleSize}
          >
            {sizeButton.glyph}
          </button>
          {children}
        </div>
      </div>
    </>
  );
}
