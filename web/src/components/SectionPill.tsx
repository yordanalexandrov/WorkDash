/** A dot and a word in the accent of the row's section (or of how a closed PR ended); the dot is what pulses. */
export function SectionPill({ accent, label, title }: { accent: string; label: string; title?: string }) {
  return (
    <span class="sec" style={{ "--accent": accent }} title={title}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
