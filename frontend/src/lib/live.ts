// Message type constants and payload shapes, mirroring backend/internal/live/messages.go.

export const NICKNAME_MAX_LEN = 32;

export const MsgType = {
  HostCreate: "host.create",
  HostAttach: "host.attach",
  PlayerJoin: "player.join",
  PlayerAttach: "player.attach",
  HelloHost: "hello.host",
  HelloPlayer: "hello.player",
  LobbyUpdate: "lobby.update",
  Error: "error",
  HostStart: "host.start",
  HostReveal: "host.reveal",
  HostNext: "host.next",
  PlayerAnswer: "player.answer",
  QuestionStart: "question.start",
  QuestionReveal: "question.reveal",
  AnswerAck: "answer.ack",
  AnswerResult: "answer.result",
  GameFinished: "game.finished",
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

export interface QuestionChoice {
  id: string;
  text: string;
}

export interface QuestionStart {
  index: number;
  total: number;
  prompt: string;
  choices: QuestionChoice[];
  timeLimitSeconds: number;
  startedAt: number;
  endsAt: number;
}

export interface LeaderboardRow {
  playerId: string;
  nickname: string;
  score: number;
}

export interface QuestionReveal {
  index: number;
  correctChoiceId: string;
  perChoiceCounts: Record<string, number>;
  leaderboard: LeaderboardRow[];
  isLast: boolean;
}

export interface AnswerAck {
  questionIndex: number;
  accepted: boolean;
}

export interface AnswerResult {
  index: number;
  wasCorrect: boolean;
  pointsAwarded: number;
  totalScore: number;
  rank: number;
}

export interface GameFinished {
  leaderboard: LeaderboardRow[];
}
