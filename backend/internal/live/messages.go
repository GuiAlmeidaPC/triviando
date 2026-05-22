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
	GameID      string `json:"gameId"`
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

// Host control commands (no payload).
type HostStartMsg struct{}
type HostRevealMsg struct{}
type HostNextMsg struct{}

type PlayerAnswerMsg struct {
	ChoiceID string `json:"choiceId"`
}

// QuestionStart is broadcast at the start of each question.
type QuestionStartMsg struct {
	Index            int                 `json:"index"`
	Total            int                 `json:"total"`
	Prompt           string              `json:"prompt"`
	Choices          []QuestionChoiceMsg `json:"choices"`
	TimeLimitSeconds int                 `json:"timeLimitSeconds"`
	StartedAt        int64               `json:"startedAt"` // ms since epoch (server clock)
	EndsAt           int64               `json:"endsAt"`    // ms since epoch (server clock)
}

type QuestionChoiceMsg struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// QuestionReveal is broadcast when the question ends.
type QuestionRevealMsg struct {
	Index           int              `json:"index"`
	CorrectChoiceID string           `json:"correctChoiceId"`
	PerChoiceCounts map[string]int   `json:"perChoiceCounts"`
	Leaderboard     []LeaderboardRow `json:"leaderboard"`
	IsLast          bool             `json:"isLast"`
}

// AnswerAck is sent only to the player who submitted an answer.
type AnswerAckMsg struct {
	QuestionIndex int  `json:"questionIndex"`
	Accepted      bool `json:"accepted"`
}

// AnswerResult is sent to a player at reveal time with their per-question outcome.
type AnswerResultMsg struct {
	Index         int  `json:"index"`
	WasCorrect    bool `json:"wasCorrect"`
	PointsAwarded int  `json:"pointsAwarded"`
	TotalScore    int  `json:"totalScore"`
	Rank          int  `json:"rank"`
}

type GameFinishedMsg struct {
	Leaderboard []LeaderboardRow `json:"leaderboard"`
}

type LeaderboardRow struct {
	PlayerID string `json:"playerId"`
	Nickname string `json:"nickname"`
	Score    int    `json:"score"`
}

// Message type strings (shared with frontend).
const (
	TypeHostCreate     = "host.create"
	TypeHostAttach     = "host.attach"
	TypePlayerJoin     = "player.join"
	TypePlayerAttach   = "player.attach"
	TypeHelloHost      = "hello.host"
	TypeHelloPlayer    = "hello.player"
	TypeLobbyUpdate    = "lobby.update"
	TypeError          = "error"
	TypeHostStart      = "host.start"
	TypeHostReveal     = "host.reveal"
	TypeHostNext       = "host.next"
	TypePlayerAnswer   = "player.answer"
	TypeQuestionStart  = "question.start"
	TypeQuestionReveal = "question.reveal"
	TypeAnswerAck      = "answer.ack"
	TypeAnswerResult   = "answer.result"
	TypeGameFinished   = "game.finished"
)
