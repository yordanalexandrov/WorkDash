import type { Badge } from "../badges.js";

export function BadgeView({ badge }: { badge: Badge }) {
  return (
    <span class={`badge ${badge.kind}`} title={badge.title}>
      {badge.text}
    </span>
  );
}
