import type { PlayerId } from "../types";

type PlayerUiProps = {
  castleHp: {
    player1: number;
    player2: number;
  };
  gold: {
    player1: number;
    player2: number;
  };
  controlledPlayer: PlayerId;
  castleHpMax?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatHp(value: number): string {
  return `${Math.round(value)}`;
}

function CastleCard({
  label,
  hp,
  gold,
  hpMax,
  isActive,
}: {
  label: string;
  hp: number;
  gold: number;
  hpMax: number;
  isActive: boolean;
}) {
  const safeHp = clamp(hp, 0, hpMax);
  const hpRatio = hpMax > 0 ? safeHp / hpMax : 0;
  const widthPercent = Math.round(hpRatio * 100);

  return (
    <article className={`player-ui__card ${isActive ? "player-ui__card--active" : ""}`}>
      <div className="player-ui__row">
        <strong>{label}</strong>
        <span>{formatHp(safeHp)}/{formatHp(hpMax)}</span>
      </div>
      <div className="player-ui__bar">
        <div className="player-ui__bar-fill" style={{ width: `${widthPercent}%` }} />
      </div>
      <div className="player-ui__row">
        <span>Gold</span>
        <strong>{gold}</strong>
      </div>
    </article>
  );
}

export function PlayerUi({ castleHp, gold, controlledPlayer, castleHpMax = 100 }: PlayerUiProps) {
  return (
    <section className="player-ui" aria-label="Player UI">
      <CastleCard
        label="Player 1"
        hp={castleHp.player1}
        gold={gold.player1}
        hpMax={castleHpMax}
        isActive={controlledPlayer === "player1"}
      />
      <CastleCard
        label="Player 2"
        hp={castleHp.player2}
        gold={gold.player2}
        hpMax={castleHpMax}
        isActive={controlledPlayer === "player2"}
      />
    </section>
  );
}
