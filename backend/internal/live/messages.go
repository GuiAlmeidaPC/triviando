package live

import "encoding/json"

// Envelope is the wire format for all WebSocket messages.
// `Data` is decoded per `Type`.
type Envelope struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// --- client → server message payloads --------------------------------------

type HostCreateMsg struct {
	QuizID string `json:"quizId"`
}

type HostAttachMsg struct {
	GameID    string `json:"gameId"`
	HostToken string `json:"hostToken"`
}

type PlayerJoinMsg struct {
	PIN      string `json:"pin"`
	Nickname string `json:"nickname"`
}

type PlayerAttachMsg struct {
	PlayerToken string `json:"playerToken"`
}

// --- server → client message payloads --------------------------------------

type HelloHostMsg struct {
	GameID    string       `json:"gameId"`
	PIN       string       `json:"pin"`
	HostToken string       `json:"hostToken"`
	QuizTitle string       `json:"quizTitle"`
	Players   []PlayerInfo `json:"players"`
	State     string       `json:"state"`
}

type HelloPlayerMsg struct {
	GameID      string `json:"gameId"`
	PlayerID    string `json:"playerId"`
	PlayerToken string `json:"playerToken"`
	Nickname    string `json:"nickname"`
	QuizTitle   string `json:"quizTitle"`
	State       string `json:"state"`
}

type LobbyUpdateMsg struct {
	Players []PlayerInfo `json:"players"`
}

type PlayerInfo struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
}

type ErrorMsg struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Message type strings (shared with frontend).
const (
	TypeHostCreate   = "host.create"
	TypeHostAttach   = "host.attach"
	TypePlayerJoin   = "player.join"
	TypePlayerAttach = "player.attach"
	TypeHelloHost    = "hello.host"
	TypeHelloPlayer  = "hello.player"
	TypeLobbyUpdate  = "lobby.update"
	TypeError        = "error"
)
