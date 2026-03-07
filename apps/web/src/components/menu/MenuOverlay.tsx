import type { PlayerId } from "../../types";

type MenuOverlayProps = {
  onChoosePlayer: (player: PlayerId) => void;
  onNewGame: () => void;
  onClose: () => void;
};

export function MenuOverlay({ onChoosePlayer, onNewGame, onClose }: MenuOverlayProps) {
  return (
    <section className="overlay-screen overlay-screen--menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="overlay-card">
        <h2 className="overlay-title">Menu</h2>
        <p className="overlay-subtitle">Le match continue en arriere-plan.</p>
        <div className="overlay-actions">
          <button type="button" className="overlay-btn overlay-btn--ghost" onClick={() => onChoosePlayer("player1")}>
            Jouer Player 1
          </button>
          <button type="button" className="overlay-btn overlay-btn--ghost" onClick={() => onChoosePlayer("player2")}>
            Jouer Player 2
          </button>
          <button type="button" className="overlay-btn overlay-btn--primary" onClick={onNewGame}>
            New game
          </button>
          <button type="button" className="overlay-btn overlay-btn--ghost" onClick={onClose}>
            Retour au match
          </button>
        </div>
      </div>
    </section>
  );
}
