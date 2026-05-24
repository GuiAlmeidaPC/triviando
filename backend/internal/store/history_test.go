package store

import (
	"context"
	"path/filepath"
	"testing"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	st, err := Open(filepath.Join(t.TempDir(), "triviando.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = st.Close()
	})
	return st
}

func TestFinishedGameHistoryByOwner(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	quiz, err := st.CreateQuiz(ctx, "owner-a", "Friday Trivia")
	if err != nil {
		t.Fatalf("create quiz: %v", err)
	}
	if err := st.RecordFinishedGame(ctx, FinishedGameRecord{
		GameID:      "game-1",
		QuizID:      quiz.ID,
		OwnerToken:  "owner-a",
		QuizTitle:   quiz.Title,
		CompletedAt: 12345,
		Leaderboard: []FinishedLeaderboardRow{
			{Rank: 1, Nickname: "Alice", Score: 900},
			{Rank: 2, Nickname: "Bob", Score: 800},
		},
	}); err != nil {
		t.Fatalf("record finished game: %v", err)
	}
	if err := st.RecordFinishedGame(ctx, FinishedGameRecord{
		GameID:      "game-2",
		QuizID:      quiz.ID,
		OwnerToken:  "owner-b",
		QuizTitle:   "Other Quiz",
		CompletedAt: 12346,
		Leaderboard: []FinishedLeaderboardRow{{Rank: 1, Nickname: "Mallory", Score: 700}},
	}); err != nil {
		t.Fatalf("record finished game owner-b: %v", err)
	}

	history, err := st.ListFinishedGamesByOwner(ctx, "owner-a", 20)
	if err != nil {
		t.Fatalf("list finished games: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("len(history) = %d, want 1", len(history))
	}
	if history[0].GameID != "game-1" {
		t.Fatalf("history[0].GameID = %q, want game-1", history[0].GameID)
	}
	if got := len(history[0].Leaderboard); got != 2 {
		t.Fatalf("leaderboard len = %d, want 2", got)
	}
	if history[0].Leaderboard[0].Nickname != "Alice" {
		t.Fatalf("winner = %q, want Alice", history[0].Leaderboard[0].Nickname)
	}
}

func TestGetQuizOwnedBy(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	quiz, err := st.CreateQuiz(ctx, "owner-a", "Owner quiz")
	if err != nil {
		t.Fatalf("create quiz: %v", err)
	}

	got, err := st.GetQuizOwnedBy(ctx, quiz.ID, "owner-a")
	if err != nil {
		t.Fatalf("GetQuizOwnedBy owner-a: %v", err)
	}
	if got.ID != quiz.ID {
		t.Fatalf("got id %q, want %q", got.ID, quiz.ID)
	}
	if _, err := st.GetQuizOwnedBy(ctx, quiz.ID, "owner-b"); err != ErrNotFound {
		t.Fatalf("GetQuizOwnedBy wrong owner err = %v, want %v", err, ErrNotFound)
	}
}
