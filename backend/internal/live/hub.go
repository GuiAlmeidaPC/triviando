package live

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"sync"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/ids"
	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
)

var (
	ErrPINNotFound    = errors.New("game not found for pin")
	ErrGameNotFound   = errors.New("game not found")
	ErrNicknameTaken  = errors.New("nickname taken")
	ErrLobbyClosed    = errors.New("lobby closed")
	ErrInvalidToken   = errors.New("invalid token")
)

// Hub is the registry of live games.
type Hub struct {
	store *store.Store

	mu      sync.Mutex
	byID    map[string]*Game
	byPIN   map[string]*Game
}

func NewHub(st *store.Store) *Hub {
	return &Hub{
		store: st,
		byID:  map[string]*Game{},
		byPIN: map[string]*Game{},
	}
}

// CreateGame loads the quiz and creates a fresh game session.
// Returns the game and the host token the caller must keep for reconnect.
func (h *Hub) CreateGame(ctx context.Context, quizID string) (*Game, error) {
	q, err := h.store.GetQuiz(ctx, quizID)
	if err != nil {
		return nil, err
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	pin := h.uniquePINLocked()
	g := newGame(ids.New(), pin, ids.New(), q)
	h.byID[g.ID] = g
	h.byPIN[g.PIN] = g
	return g, nil
}

func (h *Hub) GameByPIN(pin string) (*Game, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	g, ok := h.byPIN[pin]
	if !ok {
		return nil, ErrPINNotFound
	}
	return g, nil
}

func (h *Hub) GameByID(id string) (*Game, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	g, ok := h.byID[id]
	if !ok {
		return nil, ErrGameNotFound
	}
	return g, nil
}

// uniquePINLocked returns a 6-digit PIN not currently in use.
// Caller must hold h.mu.
func (h *Hub) uniquePINLocked() string {
	for {
		pin := fmt.Sprintf("%06d", rand.IntN(1_000_000))
		if _, taken := h.byPIN[pin]; !taken {
			return pin
		}
	}
}

// AttachHost wires a connection into a game as the host. Replaces any
// existing host connection (the previous one gets disconnected).
func (h *Hub) AttachHost(g *Game, c *conn, hostToken string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if hostToken != g.HostToken {
		return ErrInvalidToken
	}
	if g.host != nil && g.host != c {
		g.host.close()
	}
	g.host = c
	return nil
}

// JoinPlayer adds a new player to the game's lobby and returns it.
func (h *Hub) JoinPlayer(g *Game, nickname string, c *conn) (*player, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.State != StateLobby {
		return nil, ErrLobbyClosed
	}
	for _, p := range g.players {
		if p.Nickname == nickname {
			return nil, ErrNicknameTaken
		}
	}
	p := &player{
		ID:       ids.New(),
		Token:    ids.New(),
		Nickname: nickname,
		conn:     c,
	}
	g.players[p.ID] = p
	g.playerByToken[p.Token] = p
	return p, nil
}

// BroadcastLobby pushes a fresh lobby.update to host + all players.
func (h *Hub) BroadcastLobby(g *Game) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.broadcastLobby()
}

// AttachPlayer resumes a disconnected player by token.
func (h *Hub) AttachPlayer(g *Game, token string, c *conn) (*player, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p, ok := g.playerByToken[token]
	if !ok {
		return nil, ErrInvalidToken
	}
	if p.conn != nil && p.conn != c {
		p.conn.close()
	}
	p.conn = c
	return p, nil
}

// DetachConn is called when a connection goes away. Removes it from the
// game's host/player slot but keeps the player record so they can reconnect.
func (h *Hub) DetachConn(g *Game, c *conn) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.host == c {
		g.host = nil
	}
	for _, p := range g.players {
		if p.conn == c {
			p.conn = nil
		}
	}
}
