type HudProps = {
    status: string;
    playerId: string;
    serverTick: number;
    castleHp: {
      player1: number;
      player2: number;
    };
    unitsCount: number;
    lastMessage: string;
  };
  
  export function Hud(props: HudProps) {
    const { status, playerId, serverTick, castleHp, unitsCount, lastMessage } = props;
  
    return (
      <>
        <p>WS status: {status}</p>
        <p>Player: {playerId}</p>
        <p>Server tick: {serverTick}</p>
        <p>Castle HP player1: {castleHp.player1}</p>
        <p>Castle HP player2: {castleHp.player2}</p>
        <p>Units count: {unitsCount}</p>
        <p style={{ marginTop: 16 }}>Last server message: {lastMessage}</p>
      </>
    );
  }  