import type { Missed } from "../notifications.js";
import { MissedView } from "./MissedView.js";

type BannersProps = {
  error: string | null;
  /** Whether the error is mended in Settings (GitHub refuses the token), so it links there. */
  errorInSettings: boolean;
  configError: string | null;
  /** What has to be set up before the dashboard can poll. */
  setup: string | null;
  missed: Missed | null;
  onDismissMissed(): void;
};

/** The way to the Settings screen from a banner about something set there. */
function ToSettings() {
  return (
    <a class="chip to-settings" href="#settings">
      ⚙ Настройки
    </a>
  );
}

/**
 * What sits between the top bar and the board, full width: what is not set up yet, a failed poll or lost server,
 * a rejected config, the missed events.
 */
export function Banners({ error, errorInSettings, configError, setup, missed, onDismissMissed }: BannersProps) {
  if (!error && !configError && !setup && !missed) return null;
  return (
    <div class="banners">
      {setup && (
        <p id="setup" class="banner setup">
          <span>{setup}</span>
          <ToSettings />
        </p>
      )}
      {error && (
        <p id="error" class="banner bad" role="alert">
          <span>{error}</span>
          {errorInSettings && <ToSettings />}
        </p>
      )}
      {configError && (
        <p id="config-error" class="banner pending">
          <span>{configError}</span>
          <ToSettings />
        </p>
      )}
      {missed && <MissedView missed={missed} onDismiss={onDismissMissed} />}
    </div>
  );
}
