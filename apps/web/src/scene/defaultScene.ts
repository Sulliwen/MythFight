import type { SceneDefinition } from "./sceneTypes";

export function createDefaultScene(): SceneDefinition {
  return {
    elements: [
      {
        id: "lane-floor",
        kind: "lane_floor",
        label: "Lane floor",
        transform: {
          u: 0.5,
          v: 0,
          rotation: 0,
          scale: 1,
        },
        size: {
          width: 1,
          depth: 0.36,
          height: 0,
        },
        style: {
          fillColor: 0x1e293b,
          alpha: 0.95,
        },
        zLayer: 0,
        editable: true,
      },
      {
        id: "castle-player1",
        kind: "castle",
        label: "Castle player1",
        transform: {
          u: -0.08,
          v: 0,
          rotation: 0,
          scale: 1,
        },
        size: {
          width: 0.12,
          depth: 0.18,
          height: 0.42,
        },
        style: {
          topColor: 0x5ea7ff,
          leftColor: 0x2f69b2,
          rightColor: 0x4179bd,
        },
        zLayer: 10,
        editable: true,
        meta: {
          team: "player1",
        },
      },
      {
        id: "castle-player2",
        kind: "castle",
        label: "Castle player2",
        transform: {
          u: 1.08,
          v: 0,
          rotation: 0,
          scale: 1,
        },
        size: {
          width: 0.12,
          depth: 0.18,
          height: 0.42,
        },
        style: {
          topColor: 0xff8f8f,
          leftColor: 0xb84848,
          rightColor: 0xc55a5a,
        },
        zLayer: 10,
        editable: true,
        meta: {
          team: "player2",
        },
      },
      {
        id: "rock-mid",
        kind: "rock",
        label: "Rock mid",
        transform: {
          u: 0.47,
          v: 0.2,
          rotation: 0.2,
          scale: 1,
        },
        size: {
          width: 0.1,
          depth: 0.08,
          height: 0.07,
        },
        style: {
          fillColor: 0x64748b,
          alpha: 0.92,
        },
        zLayer: 6,
        editable: true,
      },
    ],
  };
}
