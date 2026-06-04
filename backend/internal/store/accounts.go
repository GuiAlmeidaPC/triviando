package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

// ErrUsernameTaken is returned when registering a username that already exists.
var ErrUsernameTaken = errors.New("username taken")

// HostAccount binds login credentials to an owner_token.
type HostAccount struct {
	Username     string
	PasswordHash string
	OwnerToken   string
	CreatedAt    int64
}

// CreateAccount inserts a new host account. Returns ErrUsernameTaken if the
// username already exists.
func (s *Store) CreateAccount(ctx context.Context, username, passwordHash, ownerToken string) (*HostAccount, error) {
	acc := &HostAccount{
		Username:     username,
		PasswordHash: passwordHash,
		OwnerToken:   ownerToken,
		CreatedAt:    time.Now().UnixMilli(),
	}
	_, err := s.DB.ExecContext(ctx,
		`INSERT INTO host_accounts (username, password_hash, owner_token, created_at) VALUES (?, ?, ?, ?)`,
		acc.Username, acc.PasswordHash, acc.OwnerToken, acc.CreatedAt)
	if err != nil {
		var se *sqlite.Error
		if errors.As(err, &se) && se.Code() == sqlite3.SQLITE_CONSTRAINT_PRIMARYKEY {
			return nil, ErrUsernameTaken
		}
		return nil, fmt.Errorf("insert account: %w", err)
	}
	return acc, nil
}

// GetAccountByUsername loads an account by username, or ErrNotFound.
func (s *Store) GetAccountByUsername(ctx context.Context, username string) (*HostAccount, error) {
	row := s.DB.QueryRowContext(ctx,
		`SELECT username, password_hash, owner_token, created_at FROM host_accounts WHERE username = ?`, username)
	acc := &HostAccount{}
	err := row.Scan(&acc.Username, &acc.PasswordHash, &acc.OwnerToken, &acc.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("select account: %w", err)
	}
	return acc, nil
}
