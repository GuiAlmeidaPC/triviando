package live

import (
	"sync"
	"time"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
)

type GameState string

const (
	StateLobby           GameState = "lobby"
	StateQuestionActive  GameState = "question_active"
	StateQuestionReveal  GameState = "question_reveal"
	StateFinished        GameState = "finished"
)

// Game holds the live state for a single game session.
// All field access is protected by mu.
type Game struct {
	mu sync.Mutex

	ID        string
	PIN       string
	Quiz      *store.Quiz
	HostToken string
	State     GameState

	host    *conn            // nil if host disconnected
	players map[string]*player // by playerID
	// Reverse lookup so reconnecting players keep their slot/score.
	playerByToken map[string]*player

	// Play-loop state. Only meaningful when State != lobby/finished.
	currentIdx       int
	questionStartMS  int64
	questionEndMS    int64
	currentAnswers   map[string]playerAnswer // by playerID, reset each question
	currentTimer     *time.Timer

	// Lifecycle bookkeeping.
	lastActivity time.Time
	evictTimer   *time.Timer
}

type playerAnswer struct {
	ChoiceID    string
	AnsweredAt  int64 // ms
	Awarded     int
	WasCorrect  bool
}

type player struct {
	ID       string
	Token    string
	Nickname string
	Score    int
	conn     *conn // nil if disconnected
}

func newGame(id, pin, hostToken string, q *store.Quiz) *Game {
	return &Game{
		ID:            id,
		PIN:           pin,
		Quiz:          q,
		HostToken:     hostToken,
		State:         StateLobby,
		players:       map[string]*player{},
		playerByToken: map[string]*player{},
		lastActivity:  time.Now(),
	}
}

func (g *Game) playerInfos() []PlayerInfo {
	out := make([]PlayerInfo, 0, len(g.players))
	for _, p := range g.players {
		out = append(out, PlayerInfo{ID: p.ID, Nickname: p.Nickname})
	}
	return out
}

// broadcastLobby sends a lobby.update to everyone connected to the game.
// Caller must hold g.mu.
func (g *Game) broadcastLobby() {
	msg := LobbyUpdateMsg{Players: g.playerInfos()}
	envelope := encode(TypeLobbyUpdate, msg)
	if g.host != nil {
		g.host.trySend(envelope)
	}
	for _, p := range g.players {
		if p.conn != nil {
			p.conn.trySend(envelope)
		}
	}
}
