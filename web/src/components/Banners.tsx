import type { Missed } from "../notifications.js";
import { MissedView } from "./MissedView.js";

type BannersProps = { error: string | null; configError: string | null; missed: Missed | null; onDismissMissed(): void };

/** What sits between the top bar and the board, full width: a failed poll or lost server, a rejected config, the missed events. */
export function Banners({ error, configError, missed, onDismissMissed }: BannersProps) {
  if (!error && !configError && !missed) return null;
  return (
    <div class="banners">
      {error && (
        <p id="error" class="banner bad" role="alert">
          {error}
        </p>
      )}
      {configError && (
        <p id="config-error" class="banner pending">
          {configError}
        </p>
      )}
      {missed && <MissedView missed={missed} onDismiss={onDismissMissed} />}
    </div>
  );
}
