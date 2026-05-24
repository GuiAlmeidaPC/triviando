package live

import (
	"encoding/json"
	"testing"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
)

func decodeEnvelope(t *testing.T, b []byte) Envelope {
	t.Helper()
	var env Envelope
	if err := json.Unmarshal(b, &env); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	return env
}

func testGameWithState(state GameState) *Game {
	quiz := &store.Quiz{
		ID:         "quiz-1",
		Title:      "Quiz",
		OwnerToken: "owner-1",
		Questions: []store.Question{
			{
				ID:               "q1",
				Prompt:           "What is 2 + 2?",
				TimeLimitSeconds: 20,
				Points:           1000,
				Choices: []store.Choice{
					{ID: "a", Text: "3"},
					{ID: "b", Text: "4", IsCorrect: true},
				},
			},
		},
	}
	g := newGame("game-1", "123456", "host-1", quiz)
	g.State = state
	g.currentIdx = 0
	g.questionStartMS = 1000
	g.questionEndMS = 21_000
	g.currentAnswers = map[string]playerAnswer{
		"p1": {ChoiceID: "b", Awarded: 1000, WasCorrect: true},
	}
	g.players["p1"] = &player{ID: "p1", Nickname: "Alice", Score: 1000}
	return g
}

func TestReplayHostStateLocked(t *testing.T) {
	t.Run("active sends question start", func(t *testing.T) {
		c := &conn{send: make(chan []byte, 4)}
		g := testGameWithState(StateQuestionActive)

		replayHostStateLocked(c, g)

		env := decodeEnvelope(t, <-c.send)
		if env.Type != TypeQuestionStart {
			t.Fatalf("got %s, want %s", env.Type, TypeQuestionStart)
		}
	})

	t.Run("reveal sends question start and reveal", func(t *testing.T) {
		c := &conn{send: make(chan []byte, 4)}
		g := testGameWithState(StateQuestionReveal)

		replayHostStateLocked(c, g)

		first := decodeEnvelope(t, <-c.send)
		second := decodeEnvelope(t, <-c.send)
		if first.Type != TypeQuestionStart {
			t.Fatalf("first type = %s, want %s", first.Type, TypeQuestionStart)
		}
		if second.Type != TypeQuestionReveal {
			t.Fatalf("second type = %s, want %s", second.Type, TypeQuestionReveal)
		}
	})

	t.Run("finished sends game finished", func(t *testing.T) {
		c := &conn{send: make(chan []byte, 2)}
		g := testGameWithState(StateFinished)

		replayHostStateLocked(c, g)

		env := decodeEnvelope(t, <-c.send)
		if env.Type != TypeGameFinished {
			t.Fatalf("got %s, want %s", env.Type, TypeGameFinished)
		}
	})
}

func TestReplayPlayerStateLockedFinished(t *testing.T) {
	c := &conn{send: make(chan []byte, 2)}
	g := testGameWithState(StateFinished)
	p := g.players["p1"]

	replayPlayerStateLocked(c, g, p)

	env := decodeEnvelope(t, <-c.send)
	if env.Type != TypeGameFinished {
		t.Fatalf("got %s, want %s", env.Type, TypeGameFinished)
	}
}
