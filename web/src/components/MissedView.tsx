import { useState } from "preact/hooks";
import { type Missed, whatHappened } from "../notifications.js";

/** The events missed while the dashboard was closed or in quiet hours, newest first, until dismissed; folds to its head. */
export function MissedView({ missed, onDismiss }: { missed: Missed; onDismiss: () => void }) {
  const [open, setOpen] = useState(true);
  const left = missed.total - missed.events.length;
  return (
    <section id="missed" class="banner missed">
      <div class="missed-head">
        <button type="button" class="missed-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span class="caret">{open ? "▾" : "▸"}</span>
          <h2>{`Пропуснати (${missed.total})`}</h2>
        </button>
        <button type="button" class="seen" onClick={onDismiss}>
          Скрий
        </button>
      </div>
      {open && (
        <div class="missed-body">
          <ul>
            {missed.events.map((event) => (
              <li key={event.id}>
                <a href={event.url} target="_blank" rel="noopener" class="num">{`${event.repo}#${event.number}`}</a>{" "}
                <a href={event.url} target="_blank" rel="noopener">
                  {event.title}
                </a>
                <span class="what">{whatHappened(event)}</span>
              </li>
            ))}
          </ul>
          {left > 0 && <p class="missed-more">{`и още ${left}, които не са в списъка`}</p>}
        </div>
      )}
    </section>
  );
}
