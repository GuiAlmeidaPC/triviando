export interface HostSession {
  gameId: string;
  pin: string;
  quizTitle: string;
}

export interface PlayerSession {
  gameId: string;
  pin: string;
  nickname: string;
  playerId: string;
  playerToken: string;
  quizTitle: string;
}

const activeHostSessionKey = "triviando.activeHostSession";
const activePlayerSessionKey = "triviando.activePlayerSession";

function readJSON<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function hostTokenKey(gameId: string): string {
  return `triviando.hostToken.${gameId}`;
}

export function loadHostToken(gameId: string): string | null {
  return localStorage.getItem(hostTokenKey(gameId));
}

export function saveHostToken(gameId: string, token: string) {
  localStorage.setItem(hostTokenKey(gameId), token);
}

export function clearHostToken(gameId: string) {
  localStorage.removeItem(hostTokenKey(gameId));
}

export function loadHostSession(): HostSession | null {
  return readJSON<HostSession>(activeHostSessionKey);
}

export function saveHostSession(session: HostSession) {
  localStorage.setItem(activeHostSessionKey, JSON.stringify(session));
}

export function clearHostSession() {
  localStorage.removeItem(activeHostSessionKey);
}

export function loadPlayerSession(): PlayerSession | null {
  return readJSON<PlayerSession>(activePlayerSessionKey);
}

export function savePlayerSession(session: PlayerSession) {
  localStorage.setItem(activePlayerSessionKey, JSON.stringify(session));
}

export function clearPlayerSession() {
  localStorage.removeItem(activePlayerSessionKey);
}
