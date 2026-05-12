// Message type constants and payload shapes, mirroring backend/internal/live/messages.go.

export const MsgType = {
  HostCreate: "host.create",
  HostAttach: "host.attach",
  PlayerJoin: "player.join",
  PlayerAttach: "player.attach",
  HelloHost: "hello.host",
  HelloPlayer: "hello.player",
  LobbyUpdate: "lobby.update",
  Error: "error",
} as const;

export interface PlayerInfo {
  id: string;
  nickname: string;
}

export interface HelloHost {
  gameId: string;
  pin: string;
  hostToken: string;
  quizTitle: string;
  players: PlayerInfo[];
  state: string;
}

export interface HelloPlayer {
  gameId: string;
  playerId: string;
  playerToken: string;
  nickname: string;
  quizTitle: string;
  state: string;
}

export interface LobbyUpdate {
  players: PlayerInfo[];
}

export interface ErrorMsg {
  code: string;
  message: string;
}
