import type { SuggestState } from "../hooks/useSuggestions";
import { AlertIcon, CheckIcon } from "./Icons";

/** One suggestion, ready to show: the panel works out the wording and whether it is already applied. */
export interface SuggestionCard {
  key: string;
  /** The change in a few words, e.g. "Hem: ruffle". */
  change: string;
  /** One sentence on why, from the AI. */
  reason: string;
  /** The design already has this value (applied here, or set by hand). */
  applied: boolean;
  /** False when the builder does not draw this setting, so applying it changes nothing on the flat. */
  drawn: boolean;
  onApply: () => void;
}

interface Props {
  state: SuggestState;
  cards: SuggestionCard[];
  /** Asks the backend for suggestions. One AI request per click. */
  onSuggest: () => void;
}

/** AI design suggestions in the Design tab. Nothing is requested until the button is clicked. */
export function SuggestionsSection({ state, cards, onSuggest }: Props) {
  const loading = state.status === "loading";
  return (
    <section className="suggest" aria-labelledby="suggest-heading">
      <div className="suggest__head">
        <h3 id="suggest-heading" className="suggest__title">
          <span className="eyebrow">AI</span>
          <span className="suggest__name">Suggestions</span>
        </h3>
        <div className="suggest__tools">
          {state.status === "ready" && state.aiMode === "mock" && <span className="chip chip--sample">Demo (mock AI)</span>}
          <button type="button" className="btn btn--ghost btn--sm" disabled={loading} onClick={onSuggest}>
            {loading ? "Suggesting…" : state.status === "ready" ? "Suggest again" : "Suggest"}
          </button>
        </div>
      </div>

      {state.status === "idle" && (
        <p className="field__hint">Three small changes that could help this design work together. Uses one AI request.</p>
      )}

      {loading && (
        <div className="suggest__wait" role="status">
          <div className="progress-line" aria-hidden="true">
            <span className="progress-line__bar" />
          </div>
          <p>Looking at how this design works together…</p>
          <p className="field__hint">This can take up to 25 seconds.</p>
        </div>
      )}

      {state.status === "error" && (
        <div className="notice notice--error" role="alert">
          <AlertIcon />
          <div>
            <p className="notice__title">{state.title}</p>
            <p>{state.message}</p>
            <button type="button" className="btn btn--ghost btn--sm notice__action" onClick={onSuggest}>
              Try again
            </button>
          </div>
        </div>
      )}

      {state.status === "ready" && cards.length === 0 && (
        <p className="field__hint">No usable suggestions came back this time. Suggest again to ask once more.</p>
      )}

      {state.status === "ready" && cards.length > 0 && (
        <ol className="suggest__list">
          {cards.map((card) => (
            <li key={card.key} className={`suggest-card${card.applied ? " is-applied" : ""}`}>
              <p className="suggest-card__change">{card.change}</p>
              <p className="suggest-card__reason">{card.reason}</p>
              {!card.drawn && <p className="field__hint">The builder doesn’t draw this setting yet, so the flat won’t change.</p>}
              <div className="suggest-card__foot">
                {card.applied ? (
                  <span className="suggest-card__done" role="status">
                    <CheckIcon width={14} height={14} />
                    Applied
                  </span>
                ) : (
                  <button type="button" className="btn btn--primary btn--sm" aria-label={`Apply: ${card.change}`} onClick={card.onApply}>
                    Apply
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
