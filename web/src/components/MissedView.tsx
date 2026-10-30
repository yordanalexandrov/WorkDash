import { type Missed, whatHappened } from "../notifications.js";

/** The events missed while the dashboard was closed or in quiet hours, newest first, until dismissed. */
export function MissedView({ missed, onDismiss }: { missed: Missed; onDismiss: () => void }) {
  const left = missed.total - missed.events.length;
  return (
    <section id="missed" class="card">
      <div class="missed-head">
        <h2>{`Пропуснати (${missed.total})`}</h2>
        <button type="button" class="seen" onClick={onDismiss}>
          Скрий
        </button>
      </div>
      <ul>
        {missed.events.map((event) => (
          <li key={event.id} class="pr">
            <div class="pr-title">
              <span class="number">
                <a href={event.url} target="_blank" rel="noopener">{`${event.repo}#${event.number}`}</a>
              </span>{" "}
              <a href={event.url} target="_blank" rel="noopener">
                {event.title}
              </a>
            </div>
            <div class="pr-meta">{whatHappened(event)}</div>
          </li>
        ))}
      </ul>
      {left > 0 && <p class="missed-more">{`и още ${left}, които не са в списъка`}</p>}
    </section>
  );
}
