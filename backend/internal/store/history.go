package store

import (
	"context"
	"fmt"
	"strings"
)

type FinishedGameRecord struct {
	GameID      string
	QuizID      string
	OwnerToken  string
	QuizTitle   string
	CompletedAt int64
	Leaderboard []FinishedLeaderboardRow
}

type FinishedLeaderboardRow struct {
	Rank     int    `json:"rank"`
	Nickname string `json:"nickname"`
	Score    int    `json:"score"`
}

type FinishedGameSummary struct {
	GameID      string                   `json:"gameId"`
	QuizID      string                   `json:"quizId"`
	QuizTitle   string                   `json:"quizTitle"`
	CompletedAt int64                    `json:"completedAt"`
	PlayerCount int                      `json:"playerCount"`
	Leaderboard []FinishedLeaderboardRow `json:"leaderboard"`
}

func (s *Store) RecordFinishedGame(ctx context.Context, rec FinishedGameRecord) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin finished game tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`INSERT OR REPLACE INTO finished_games
			(game_id, quiz_id, owner_token, quiz_title, completed_at, player_count)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		rec.GameID, rec.QuizID, rec.OwnerToken, rec.QuizTitle, rec.CompletedAt, len(rec.Leaderboard),
	); err != nil {
		return fmt.Errorf("insert finished game: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM finished_game_rows WHERE game_id = ?`, rec.GameID); err != nil {
		return fmt.Errorf("delete finished game rows: %w", err)
	}
	for i, row := range rec.Leaderboard {
		rank := row.Rank
		if rank == 0 {
			rank = i + 1
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO finished_game_rows (game_id, rank, nickname, score) VALUES (?, ?, ?, ?)`,
			rec.GameID, rank, row.Nickname, row.Score,
		); err != nil {
			return fmt.Errorf("insert finished game row: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit finished game tx: %w", err)
	}
	return nil
}

func (s *Store) ListFinishedGamesByOwner(ctx context.Context, ownerToken string, limit int) ([]FinishedGameSummary, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	rows, err := s.DB.QueryContext(ctx,
		`SELECT game_id, quiz_id, quiz_title, completed_at, player_count
		   FROM finished_games
		  WHERE owner_token = ?
		  ORDER BY completed_at DESC
		  LIMIT ?`,
		ownerToken, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("select finished games: %w", err)
	}
	defer rows.Close()

	summaries := make([]FinishedGameSummary, 0, limit)
	ids := make([]string, 0, limit)
	indexByID := make(map[string]int, limit)
	for rows.Next() {
		var item FinishedGameSummary
		if err := rows.Scan(&item.GameID, &item.QuizID, &item.QuizTitle, &item.CompletedAt, &item.PlayerCount); err != nil {
			return nil, fmt.Errorf("scan finished game: %w", err)
		}
		item.Leaderboard = []FinishedLeaderboardRow{}
		indexByID[item.GameID] = len(summaries)
		summaries = append(summaries, item)
		ids = append(ids, item.GameID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate finished games: %w", err)
	}
	if len(ids) == 0 {
		return summaries, nil
	}

	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	placeholders := strings.Repeat("?,", len(ids)-1) + "?"
	lbRows, err := s.DB.QueryContext(ctx,
		`SELECT game_id, rank, nickname, score
		   FROM finished_game_rows
		  WHERE game_id IN (`+placeholders+`)
		  ORDER BY game_id, rank`,
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("select finished game rows: %w", err)
	}
	defer lbRows.Close()
	for lbRows.Next() {
		var (
			gameID string
			row    FinishedLeaderboardRow
		)
		if err := lbRows.Scan(&gameID, &row.Rank, &row.Nickname, &row.Score); err != nil {
			return nil, fmt.Errorf("scan finished game row: %w", err)
		}
		if idx, ok := indexByID[gameID]; ok {
			summaries[idx].Leaderboard = append(summaries[idx].Leaderboard, row)
		}
	}
	if err := lbRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate finished game rows: %w", err)
	}
	return summaries, nil
}
