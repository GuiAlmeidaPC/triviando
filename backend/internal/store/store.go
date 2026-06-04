// Package store wraps the SQLite database and migrations.
package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

type Store struct {
	DB *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	s := &Store{DB: db}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.DB.Close() }

const schema = `
CREATE TABLE IF NOT EXISTS quizzes (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    owner_token  TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quizzes_owner ON quizzes(owner_token);

CREATE TABLE IF NOT EXISTS questions (
    id                 TEXT PRIMARY KEY,
    quiz_id            TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position           INTEGER NOT NULL,
    prompt             TEXT NOT NULL,
    time_limit_seconds INTEGER NOT NULL DEFAULT 20,
    points             INTEGER NOT NULL DEFAULT 1000
);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, position);

CREATE TABLE IF NOT EXISTS choices (
    id          TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    text        TEXT NOT NULL,
    is_correct  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_choices_question ON choices(question_id, position);

CREATE TABLE IF NOT EXISTS finished_games (
    game_id       TEXT PRIMARY KEY,
    quiz_id       TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    owner_token   TEXT NOT NULL,
    quiz_title    TEXT NOT NULL,
    completed_at  INTEGER NOT NULL,
    player_count  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finished_games_owner_completed
    ON finished_games(owner_token, completed_at DESC);

CREATE TABLE IF NOT EXISTS finished_game_rows (
    game_id   TEXT NOT NULL REFERENCES finished_games(game_id) ON DELETE CASCADE,
    rank      INTEGER NOT NULL,
    nickname  TEXT NOT NULL,
    score     INTEGER NOT NULL,
    PRIMARY KEY (game_id, rank)
);

-- Host accounts bind a username/password to an owner_token so a host can sign
-- in from another device and recover their quizzes. The owner_token remains the
-- single identity key used everywhere else (quizzes, history).
CREATE TABLE IF NOT EXISTS host_accounts (
    username      TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    owner_token   TEXT NOT NULL,
    created_at    INTEGER NOT NULL
);
`

func (s *Store) migrate() error {
	_, err := s.DB.Exec(schema)
	if err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}
