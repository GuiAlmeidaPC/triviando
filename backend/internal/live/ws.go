package live

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
)

const (
	// idleTimeout closes a connection that hasn't sent a message in this long.
	// Keepalive pings are handled by coder/websocket internally.
	idleTimeout = 10 * time.Minute
)

type Handler struct {
	Hub *Hub
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"}, // tighten in prod; nginx handles real origin checking
	})
	if err != nil {
		log.Printf("ws accept: %v", err)
		return
	}
	defer ws.CloseNow()

	c := newConn(ws)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go c.writePump(ctx)

	// Track which game (if any) this connection has attached to so we can
	// detach on disconnect.
	var attachedGame *Game

	defer func() {
		if attachedGame != nil {
			h.Hub.DetachConn(attachedGame, c)
		}
		c.close()
	}()

	for {
		readCtx, readCancel := context.WithTimeout(ctx, idleTimeout)
		_, data, err := ws.Read(readCtx)
		readCancel()
		if err != nil {
			if !isNormalClose(err) {
				log.Printf("ws read: %v", err)
			}
			return
		}

		var env Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			sendError(c, "bad_envelope", err.Error())
			continue
		}

		g, err := h.dispatch(ctx, c, &env)
		if err != nil {
			sendError(c, "dispatch_error", err.Error())
			continue
		}
		if g != nil {
			attachedGame = g
		}
	}
}

// dispatch routes an incoming envelope. If the message attaches the conn
// to a game, the returned *Game is non-nil.
func (h *Handler) dispatch(ctx context.Context, c *conn, env *Envelope) (*Game, error) {
	switch env.Type {
	case TypeHostCreate:
		var msg HostCreateMsg
		if err := json.Unmarshal(env.Data, &msg); err != nil {
			return nil, err
		}
		g, err := h.Hub.CreateGame(ctx, msg.QuizID)
		if err != nil {
			return nil, err
		}
		if err := h.Hub.AttachHost(g, c, g.HostToken); err != nil {
			return nil, err
		}
		g.mu.Lock()
		hello := HelloHostMsg{
			GameID:    g.ID,
			PIN:       g.PIN,
			HostToken: g.HostToken,
			QuizTitle: g.Quiz.Title,
			Players:   g.playerInfos(),
			State:     string(g.State),
		}
		g.mu.Unlock()
		c.trySend(encode(TypeHelloHost, hello))
		return g, nil

	case TypeHostAttach:
		var msg HostAttachMsg
		if err := json.Unmarshal(env.Data, &msg); err != nil {
			return nil, err
		}
		g, err := h.Hub.GameByID(msg.GameID)
		if err != nil {
			return nil, err
		}
		if err := h.Hub.AttachHost(g, c, msg.HostToken); err != nil {
			return nil, err
		}
		g.mu.Lock()
		hello := HelloHostMsg{
			GameID:    g.ID,
			PIN:       g.PIN,
			HostToken: g.HostToken,
			QuizTitle: g.Quiz.Title,
			Players:   g.playerInfos(),
			State:     string(g.State),
		}
		g.mu.Unlock()
		c.trySend(encode(TypeHelloHost, hello))
		return g, nil

	case TypePlayerJoin:
		var msg PlayerJoinMsg
		if err := json.Unmarshal(env.Data, &msg); err != nil {
			return nil, err
		}
		nickname := strings.TrimSpace(msg.Nickname)
		if nickname == "" {
			return nil, errors.New("nickname required")
		}
		g, err := h.Hub.GameByPIN(msg.PIN)
		if err != nil {
			return nil, err
		}
		p, err := h.Hub.JoinPlayer(g, nickname, c)
		if err != nil {
			return nil, err
		}
		g.mu.Lock()
		hello := HelloPlayerMsg{
			GameID:      g.ID,
			PlayerID:    p.ID,
			PlayerToken: p.Token,
			Nickname:    p.Nickname,
			QuizTitle:   g.Quiz.Title,
			State:       string(g.State),
		}
		g.mu.Unlock()
		c.trySend(encode(TypeHelloPlayer, hello))
		h.Hub.BroadcastLobby(g)
		return g, nil

	default:
		return nil, errors.New("unknown message type: " + env.Type)
	}
}

func isNormalClose(err error) bool {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var ce websocket.CloseError
	if errors.As(err, &ce) {
		return ce.Code == websocket.StatusNormalClosure || ce.Code == websocket.StatusGoingAway
	}
	return false
}
