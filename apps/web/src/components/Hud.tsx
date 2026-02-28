type HudProps = {
  status: string;
  playerId: string;
  serverTick: number;
  fps: number;
  rttMs: number;
  simulatedLagMs: number;
  onSimulatedLagChange: (value: number) => void;
  castleHp: {
    player1: number;
    player2: number;
  };
  unitsCount: number;
  lastMessage: string;
};

export function Hud(props: HudProps) {
  const {
    status,
    playerId,
    serverTick,
    fps,
    rttMs,
    simulatedLagMs,
    onSimulatedLagChange,
    castleHp,
    unitsCount,
    lastMessage,
  } = props;

  return (
    <>
      <p>WS status: {status}</p>
      <p>Player: {playerId}</p>
      <p>Server tick: {serverTick}</p>
      <p>FPS: {fps}</p>
      <p>RTT: {rttMs} ms</p>
      <label style={{ display: "block", marginBottom: 8 }}>
        Simulated lag:
        <select
          value={simulatedLagMs}
          onChange={(event) => onSimulatedLagChange(Number(event.target.value))}
          style={{ marginLeft: 8 }}
        >
          <option value={0}>0 ms</option>
          <option value={50}>50 ms</option>
          <option value={100}>100 ms</option>
          <option value={150}>150 ms</option>
          <option value={200}>200 ms</option>
          <option value={4000}>4000 ms</option>
        </select>
      </label>
      <p>Castle HP player1: {castleHp.player1}</p>
      <p>Castle HP player2: {castleHp.player2}</p>
      <p>Units count: {unitsCount}</p>
      <p style={{ marginTop: 16 }}>Last server message: {lastMessage}</p>
    </>
  );
}
