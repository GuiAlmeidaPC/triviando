package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/ids"
)

var ErrNotFound = errors.New("not found")

type Quiz struct {
	ID         string     `json:"id"`
	Title      string     `json:"title"`
	OwnerToken string     `json:"-"`
	CreatedAt  int64      `json:"createdAt"`
	UpdatedAt  int64      `json:"updatedAt"`
	Questions  []Question `json:"questions"`
}

type Question struct {
	ID               string   `json:"id"`
	Position         int      `json:"position"`
	Prompt           string   `json:"prompt"`
	TimeLimitSeconds int      `json:"timeLimitSeconds"`
	Points           int      `json:"points"`
	Choices          []Choice `json:"choices"`
}

type Choice struct {
	ID        string `json:"id"`
	Position  int    `json:"position"`
	Text      string `json:"text"`
	IsCorrect bool   `json:"isCorrect"`
}

// CreateQuiz inserts an empty quiz with the given title.
func (s *Store) CreateQuiz(ctx context.Context, ownerToken, title string) (*Quiz, error) {
	now := time.Now().UnixMilli()
	q := &Quiz{
		ID:         ids.New(),
		Title:      title,
		OwnerToken: ownerToken,
		CreatedAt:  now,
		UpdatedAt:  now,
		Questions:  []Question{},
	}
	_, err := s.DB.ExecContext(ctx,
		`INSERT INTO quizzes (id, title, owner_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		q.ID, q.Title, q.OwnerToken, q.CreatedAt, q.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert quiz: %w", err)
	}
	return q, nil
}

// GetQuiz loads a quiz with its questions and choices.
func (s *Store) GetQuiz(ctx context.Context, id string) (*Quiz, error) {
	row := s.DB.QueryRowContext(ctx,
		`SELECT id, title, owner_token, created_at, updated_at FROM quizzes WHERE id = ?`, id)
	q := &Quiz{Questions: []Question{}}
	err := row.Scan(&q.ID, &q.Title, &q.OwnerToken, &q.CreatedAt, &q.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("select quiz: %w", err)
	}

	rows, err := s.DB.QueryContext(ctx,
		`SELECT id, position, prompt, time_limit_seconds, points FROM questions WHERE quiz_id = ? ORDER BY position`, id)
	if err != nil {
		return nil, fmt.Errorf("select questions: %w", err)
	}
	defer rows.Close()

	qIDs := []string{}
	qByID := map[string]*Question{}
	for rows.Next() {
		var qn Question
		if err := rows.Scan(&qn.ID, &qn.Position, &qn.Prompt, &qn.TimeLimitSeconds, &qn.Points); err != nil {
			return nil, err
		}
		qn.Choices = []Choice{}
		q.Questions = append(q.Questions, qn)
		qIDs = append(qIDs, qn.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range q.Questions {
		qByID[q.Questions[i].ID] = &q.Questions[i]
	}
	if len(qIDs) == 0 {
		return q, nil
	}

	// Load all choices for these questions in one go.
	args := make([]any, len(qIDs))
	placeholders := ""
	for i, id := range qIDs {
		args[i] = id
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
	}
	cRows, err := s.DB.QueryContext(ctx,
		`SELECT id, question_id, position, text, is_correct FROM choices WHERE question_id IN (`+placeholders+`) ORDER BY position`, args...)
	if err != nil {
		return nil, fmt.Errorf("select choices: %w", err)
	}
	defer cRows.Close()
	for cRows.Next() {
		var c Choice
		var qid string
		var correct int
		if err := cRows.Scan(&c.ID, &qid, &c.Position, &c.Text, &correct); err != nil {
			return nil, err
		}
		c.IsCorrect = correct != 0
		if qn, ok := qByID[qid]; ok {
			qn.Choices = append(qn.Choices, c)
		}
	}
	return q, cRows.Err()
}

// ListQuizzesByOwner returns quiz summaries (no questions) for an owner.
func (s *Store) ListQuizzesByOwner(ctx context.Context, ownerToken string) ([]Quiz, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT id, title, owner_token, created_at, updated_at FROM quizzes WHERE owner_token = ? ORDER BY updated_at DESC`,
		ownerToken)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Quiz{}
	for rows.Next() {
		var q Quiz
		if err := rows.Scan(&q.ID, &q.Title, &q.OwnerToken, &q.CreatedAt, &q.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// UpdateQuiz replaces the title and the full question/choice list.
// Returns ErrNotFound if the quiz doesn't exist or isn't owned by ownerToken.
func (s *Store) UpdateQuiz(ctx context.Context, id, ownerToken string, title string, questions []Question) (*Quiz, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var existingOwner string
	err = tx.QueryRowContext(ctx, `SELECT owner_token FROM quizzes WHERE id = ?`, id).Scan(&existingOwner)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if existingOwner != ownerToken {
		return nil, ErrNotFound
	}

	now := time.Now().UnixMilli()
	if _, err := tx.ExecContext(ctx,
		`UPDATE quizzes SET title = ?, updated_at = ? WHERE id = ?`, title, now, id); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM questions WHERE quiz_id = ?`, id); err != nil {
		return nil, err
	}

	for qi, qn := range questions {
		qID := qn.ID
		if qID == "" {
			qID = ids.New()
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO questions (id, quiz_id, position, prompt, time_limit_seconds, points) VALUES (?, ?, ?, ?, ?, ?)`,
			qID, id, qi, qn.Prompt, qn.TimeLimitSeconds, qn.Points); err != nil {
			return nil, err
		}
		for ci, ch := range qn.Choices {
			cID := ch.ID
			if cID == "" {
				cID = ids.New()
			}
			correct := 0
			if ch.IsCorrect {
				correct = 1
			}
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO choices (id, question_id, position, text, is_correct) VALUES (?, ?, ?, ?, ?)`,
				cID, qID, ci, ch.Text, correct); err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetQuiz(ctx, id)
}

func (s *Store) DeleteQuiz(ctx context.Context, id, ownerToken string) error {
	res, err := s.DB.ExecContext(ctx,
		`DELETE FROM quizzes WHERE id = ? AND owner_token = ?`, id, ownerToken)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
