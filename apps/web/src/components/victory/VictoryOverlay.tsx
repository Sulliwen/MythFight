type VictoryOverlayProps = {
  title: string;
  subtitle: string;
  onNewGame: () => void;
  onMenu: () => void;
};

export function VictoryOverlay({ title, subtitle, onNewGame, onMenu }: VictoryOverlayProps) {
  return (
    <section className="overlay-screen overlay-screen--victory" role="dialog" aria-modal="true" aria-label="Victory">
      <div className="overlay-card">
        <h2 className="overlay-title">{title}</h2>
        <p className="overlay-subtitle">{subtitle}</p>
        <div className="overlay-actions">
          <button type="button" className="overlay-btn overlay-btn--primary" onClick={onNewGame}>
            New game
          </button>
          <button type="button" className="overlay-btn overlay-btn--ghost" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </section>
  );
}
