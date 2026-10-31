import { initials } from "../marks.js";
import { textHue } from "../palette.js";

/** A round avatar with the login's initials; `class` adds e.g. a review dot ("rv ok") or the dashed "ask" ring. */
export function Avatar({ login, class: extra, title }: { login: string; class?: string; title?: string }) {
  return (
    <span class={extra ? `av ${extra}` : "av"} style={{ "--h": textHue(login) }} title={title ?? login}>
      {initials(login)}
    </span>
  );
}
