package live

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/ids"
	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
)

var (
	ErrPINNotFound      = errors.New("game not found for pin")
	ErrGameNotFound     = errors.New("game not found")
	ErrNicknameTaken    = errors.New("nickname taken")
	ErrLobbyClosed      = errors.New("lobby closed")
	ErrInvalidToken     = errors.New("invalid token")
	ErrQuizNotOwned     = errors.New("quiz not owned by caller")
	ErrLobbyFull        = errors.New("lobby is full")
	ErrPINSpaceExhausted = errors.New("could not allocate pin")
)

// MaxPlayersPerGame caps how many players can join a single game session.
const MaxPlayersPerGame = 200

// FinishedGameTTL is how long a finished game stays addressable for late
// reconnects before it's evicted from the hub.
const FinishedGameTTL = 5 * time.Minute

// StaleGameTTL evicts games whose host disconnected without players within
// this window — prevents orphan games from leaking PINs and memory.
const StaleGameTTL = 30 * time.Minute

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

// CreateGame loads the quiz, verifies ownership, and creates a fresh game session.
// Returns the game and the host token the caller must keep for reconnect.
func (h *Hub) CreateGame(ctx context.Context, quizID, ownerToken string) (*Game, error) {
	if ownerToken == "" {
		return nil, ErrInvalidToken
	}
	q, err := h.store.GetQuiz(ctx, quizID)
	if err != nil {
		return nil, err
	}
	if q.OwnerToken != ownerToken {
		return nil, ErrQuizNotOwned
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	pin, err := h.uniquePINLocked()
	if err != nil {
		return nil, err
	}
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
// Caller must hold h.mu. Bounded retries so we don't spin forever if the PIN
// space is saturated.
func (h *Hub) uniquePINLocked() (string, error) {
	for i := 0; i < 50; i++ {
		pin := fmt.Sprintf("%06d", rand.IntN(1_000_000))
		if _, taken := h.byPIN[pin]; !taken {
			return pin, nil
		}
	}
	return "", ErrPINSpaceExhausted
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
	if len(g.players) >= MaxPlayersPerGame {
		return nil, ErrLobbyFull
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

// removeGame evicts a game from the hub registry. Safe to call from a timer.
func (h *Hub) removeGame(g *Game) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if cur, ok := h.byID[g.ID]; ok && cur == g {
		delete(h.byID, g.ID)
	}
	if cur, ok := h.byPIN[g.PIN]; ok && cur == g {
		delete(h.byPIN, g.PIN)
	}
}

// scheduleEvictionLocked schedules eviction after FinishedGameTTL.
// Caller must hold g.mu.
func (h *Hub) scheduleEvictionLocked(g *Game) {
	if g.evictTimer != nil {
		g.evictTimer.Stop()
	}
	g.evictTimer = time.AfterFunc(FinishedGameTTL, func() {
		h.removeGame(g)
	})
}

// ReapStale walks all games and evicts those that have been idle past
// StaleGameTTL with no host connection. Intended for periodic invocation.
func (h *Hub) ReapStale() {
	h.mu.Lock()
	games := make([]*Game, 0, len(h.byID))
	for _, g := range h.byID {
		games = append(games, g)
	}
	h.mu.Unlock()

	now := time.Now()
	for _, g := range games {
		g.mu.Lock()
		stale := g.host == nil && now.Sub(g.lastActivity) > StaleGameTTL
		g.mu.Unlock()
		if stale {
			h.removeGame(g)
		}
	}
}

// StartReaper launches a periodic stale-game reaper. Returns a stop function.
func (h *Hub) StartReaper(interval time.Duration) (stop func()) {
	tk := time.NewTicker(interval)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-tk.C:
				h.ReapStale()
			case <-done:
				tk.Stop()
				return
			}
		}
	}()
	return func() { close(done) }
}
