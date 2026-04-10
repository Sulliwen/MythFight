import { useTranslation } from "../../i18n";
import type { PlayerId } from "../../types";

type MenuOverlayProps = {
  onChoosePlayer: (player: PlayerId) => void;
  onNewGame: () => void;
  onClose: () => void;
};

export function MenuOverlay({ onChoosePlayer, onNewGame, onClose }: MenuOverlayProps) {
  const { t } = useTranslation();
  return (
    <section className="overlay-screen overlay-screen--menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="overlay-card">
        <h2 className="overlay-title">{t("actions.menu")}</h2>
        <p className="overlay-subtitle">{t("match.backgroundNote")}</p>
        <div className="overlay-actions">
          <button type="button" className="overlay-btn overlay-btn--ghost" onClick={() => onChoosePlayer("player1")}>
            {t("actions.playPlayer1")}
          </button>
          <button type="button" className="overlay-btn overlay-btn--ghost" onClick={() => onChoosePlayer("player2")}>
            {t("actions.playPlayer2")}
          </button>
          <button type="button" className="overlay-btn overlay-btn--primary" onClick={onNewGame}>
            {t("actions.newGame")}
          </button>
          <button type="button" className="overlay-btn overlay-btn--ghost" onClick={onClose}>
            {t("actions.backToMatch")}
          </button>
        </div>
      </div>
    </section>
  );
}
