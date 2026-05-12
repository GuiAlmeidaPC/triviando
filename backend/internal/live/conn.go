package live

import (
	"context"
	"encoding/json"
	"log"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

const sendBufferSize = 16

// conn wraps a single WebSocket connection.
// Reads happen on the request goroutine; writes are serialized through `send`.
type conn struct {
	ws     *websocket.Conn
	send   chan []byte
	closed atomic.Bool
}

func newConn(ws *websocket.Conn) *conn {
	return &conn{
		ws:   ws,
		send: make(chan []byte, sendBufferSize),
	}
}

func (c *conn) trySend(b []byte) {
	if c.closed.Load() {
		return
	}
	select {
	case c.send <- b:
	default:
		// Slow client: drop and disconnect.
		c.close()
	}
}

func (c *conn) close() {
	if c.closed.CompareAndSwap(false, true) {
		close(c.send)
	}
}

// writePump drains c.send and writes frames. Returns when send is closed
// or the underlying connection fails.
func (c *conn) writePump(ctx context.Context) {
	for b := range c.send {
		writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := c.ws.Write(writeCtx, websocket.MessageText, b)
		cancel()
		if err != nil {
			return
		}
	}
}

// encode marshals a typed message into a wire envelope.
func encode(msgType string, data any) []byte {
	raw, err := json.Marshal(data)
	if err != nil {
		log.Printf("encode %s: %v", msgType, err)
		return nil
	}
	envBytes, err := json.Marshal(Envelope{Type: msgType, Data: raw})
	if err != nil {
		log.Printf("encode envelope %s: %v", msgType, err)
		return nil
	}
	return envBytes
}

func sendError(c *conn, code, message string) {
	c.trySend(encode(TypeError, ErrorMsg{Code: code, Message: message}))
}
