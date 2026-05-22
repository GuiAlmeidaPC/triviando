package live

import (
	"errors"
	"math"
	"sort"
	"time"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
)

var (
	ErrNotInLobby     = errors.New("game is not in lobby")
	ErrNoQuestions    = errors.New("quiz has no questions")
	ErrNotActive      = errors.New("no active question")
	ErrNotInReveal    = errors.New("game is not in reveal state")
	ErrAlreadyAnswered = errors.New("already answered")
	ErrUnknownPlayer  = errors.New("unknown player")
	ErrUnknownChoice  = errors.New("unknown choice")
)

// Score computes points for an answer per SPEC §7:
//   points = base * (0.5 + 0.5 * (timeRemaining / timeLimit))
// Wrong or unanswered = 0. Result is rounded.
func Score(base, timeLimitSec, answerAtMS, questionStartMS int64, correct bool) int {
	if !correct {
		return 0
	}
	if timeLimitSec <= 0 {
		return int(base)
	}
	elapsedMS := answerAtMS - questionStartMS
	if elapsedMS < 0 {
		elapsedMS = 0
	}
	limitMS := timeLimitSec * 1000
	remaining := float64(limitMS-elapsedMS) / float64(limitMS)
	if remaining < 0 {
		remaining = 0
	} else if remaining > 1 {
		remaining = 1
	}
	return int(math.Round(float64(base) * (0.5 + 0.5*remaining)))
}

// --- Hub operations ---------------------------------------------------------

// Start moves the game from lobby into the first question.
func (h *Hub) Start(g *Game) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.State != StateLobby {
		return ErrNotInLobby
	}
	if len(g.Quiz.Questions) == 0 {
		return ErrNoQuestions
	}
	g.currentIdx = -1
	return h.beginQuestionLocked(g)
}

// Answer records a player's answer for the current question.
func (h *Hub) Answer(g *Game, playerID, choiceID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.State != StateQuestionActive {
		return ErrNotActive
	}
	p, ok := g.players[playerID]
	if !ok {
		return ErrUnknownPlayer
	}
	if _, already := g.currentAnswers[playerID]; already {
		return ErrAlreadyAnswered
	}
	q := &g.Quiz.Questions[g.currentIdx]
	var chosen *store.Choice
	for i := range q.Choices {
		if q.Choices[i].ID == choiceID {
			chosen = &q.Choices[i]
			break
		}
	}
	if chosen == nil {
		return ErrUnknownChoice
	}

	now := time.Now().UnixMilli()
	correct := chosen.IsCorrect
	awarded := Score(int64(q.Points), int64(q.TimeLimitSeconds), now, g.questionStartMS, correct)
	g.currentAnswers[playerID] = playerAnswer{
		ChoiceID:   choiceID,
		AnsweredAt: now,
		Awarded:    awarded,
		WasCorrect: correct,
	}
	p.Score += awarded

	// Ack the answering player.
	if p.conn != nil {
		p.conn.trySend(encode(TypeAnswerAck, AnswerAckMsg{
			QuestionIndex: g.currentIdx,
			Accepted:      true,
		}))
	}

	// All players answered → reveal early.
	if len(g.currentAnswers) >= len(g.players) {
		h.revealLocked(g)
	}
	return nil
}

// Reveal ends the current question immediately (host-initiated or timer-driven).
// Idempotent: a no-op if we're already past active.
func (h *Hub) Reveal(g *Game) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.State != StateQuestionActive {
		return nil
	}
	h.revealLocked(g)
	return nil
}

// Next advances from reveal to the next question, or to finished.
func (h *Hub) Next(g *Game) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.State != StateQuestionReveal {
		return ErrNotInReveal
	}
	if g.currentIdx+1 >= len(g.Quiz.Questions) {
		g.State = StateFinished
		h.broadcastLocked(g, TypeGameFinished, GameFinishedMsg{
			Leaderboard: leaderboardLocked(g),
		})
		h.scheduleEvictionLocked(g)
		return nil
	}
	g.lastActivity = time.Now()
	return h.beginQuestionLocked(g)
}

// --- internals (must be called with g.mu held) ------------------------------

func (h *Hub) beginQuestionLocked(g *Game) error {
	g.currentIdx++
	q := &g.Quiz.Questions[g.currentIdx]
	g.State = StateQuestionActive
	g.currentAnswers = map[string]playerAnswer{}
	g.questionStartMS = time.Now().UnixMilli()
	g.questionEndMS = g.questionStartMS + int64(q.TimeLimitSeconds)*1000

	choices := make([]QuestionChoiceMsg, len(q.Choices))
	for i, c := range q.Choices {
		choices[i] = QuestionChoiceMsg{ID: c.ID, Text: c.Text}
	}
	h.broadcastLocked(g, TypeQuestionStart, QuestionStartMsg{
		Index:            g.currentIdx,
		Total:            len(g.Quiz.Questions),
		Prompt:           q.Prompt,
		Choices:          choices,
		TimeLimitSeconds: q.TimeLimitSeconds,
		StartedAt:        g.questionStartMS,
		EndsAt:           g.questionEndMS,
	})

	// Schedule auto-reveal.
	idxAtStart := g.currentIdx
	if g.currentTimer != nil {
		g.currentTimer.Stop()
	}
	g.currentTimer = time.AfterFunc(time.Duration(q.TimeLimitSeconds)*time.Second, func() {
		h.onTimerExpired(g, idxAtStart)
	})
	return nil
}

func (h *Hub) onTimerExpired(g *Game, expectedIdx int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.State != StateQuestionActive || g.currentIdx != expectedIdx {
		return // already revealed/advanced
	}
	h.revealLocked(g)
}

// PlayerRevealLocked builds the player-facing reveal payload (no leaderboard).
// Caller must hold g.mu and the game must be in StateQuestionReveal.
func PlayerRevealLocked(g *Game) QuestionRevealMsg {
	q := &g.Quiz.Questions[g.currentIdx]
	correctID := ""
	for _, c := range q.Choices {
		if c.IsCorrect {
			correctID = c.ID
			break
		}
	}
	counts := map[string]int{}
	for _, c := range q.Choices {
		counts[c.ID] = 0
	}
	for _, a := range g.currentAnswers {
		counts[a.ChoiceID]++
	}
	return QuestionRevealMsg{
		Index:           g.currentIdx,
		CorrectChoiceID: correctID,
		PerChoiceCounts: counts,
		IsLast:          g.currentIdx+1 >= len(g.Quiz.Questions),
	}
}

func (h *Hub) revealLocked(g *Game) {
	if g.currentTimer != nil {
		g.currentTimer.Stop()
		g.currentTimer = nil
	}
	g.State = StateQuestionReveal

	pr := PlayerRevealLocked(g)
	lb := leaderboardLocked(g)

	// Host sees the full reveal with leaderboard.
	hostMsg := encode(TypeQuestionReveal, QuestionRevealMsg{
		Index:           pr.Index,
		CorrectChoiceID: pr.CorrectChoiceID,
		PerChoiceCounts: pr.PerChoiceCounts,
		Leaderboard:     lb,
		IsLast:          pr.IsLast,
	})
	if g.host != nil {
		g.host.trySend(hostMsg)
	}

	// Players see only the correct answer + counts. Score / rank / points
	// stay hidden until game.finished so the final leaderboard is a surprise.
	playerMsg := encode(TypeQuestionReveal, pr)
	for _, p := range g.players {
		if p.conn != nil {
			p.conn.trySend(playerMsg)
		}
	}
}

// broadcastLocked encodes once and pushes to host + all players.
func (h *Hub) broadcastLocked(g *Game, msgType string, payload any) {
	b := encode(msgType, payload)
	if g.host != nil {
		g.host.trySend(b)
	}
	for _, p := range g.players {
		if p.conn != nil {
			p.conn.trySend(b)
		}
	}
}

func leaderboardLocked(g *Game) []LeaderboardRow {
	rows := make([]LeaderboardRow, 0, len(g.players))
	for _, p := range g.players {
		rows = append(rows, LeaderboardRow{PlayerID: p.ID, Nickname: p.Nickname, Score: p.Score})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Score != rows[j].Score {
			return rows[i].Score > rows[j].Score
		}
		return rows[i].Nickname < rows[j].Nickname
	})
	return rows
}
