import { useTranslation } from "../../i18n";

type VictoryOverlayProps = {
  title: string;
  subtitle: string;
  onNewGame: () => void;
  onMenu: () => void;
};

export function VictoryOverlay({ title, subtitle, onNewGame, onMenu }: VictoryOverlayProps) {
  const { t } = useTranslation();
  return (
    <section className="overlay-screen overlay-screen--victory" role="dialog" aria-modal="true" aria-label="Victory">
      <div className="overlay-card">
        <h2 className="overlay-title">{title}</h2>
        <p className="overlay-subtitle">{subtitle}</p>
        <div className="overlay-actions">
          <button type="button" className="overlay-btn overlay-btn--primary" onClick={onNewGame}>
            {t("actions.newGame")}
          </button>
          <button type="button" className="overlay-btn overlay-btn--ghost" onClick={onMenu}>
            {t("actions.menu")}
          </button>
        </div>
      </div>
    </section>
  );
}
