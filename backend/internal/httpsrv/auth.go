package httpsrv

import (
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
	"golang.org/x/crypto/bcrypt"
)

const (
	minUsernameLen = 3
	maxUsernameLen = 64
	minPasswordLen = 6
	maxPasswordLen = 200
)

type authHandler struct {
	store *store.Store
}

type authReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// authResp returns the owner_token the client should store and keep sending as
// X-Owner-Token. The token is the single identity key for all quiz/history data.
type authResp struct {
	Username   string `json:"username"`
	OwnerToken string `json:"ownerToken"`
}

func validateCredentials(username, password string) string {
	if n := utf8.RuneCountInString(username); n < minUsernameLen || n > maxUsernameLen {
		return "username must be 3-64 characters"
	}
	if n := utf8.RuneCountInString(password); n < minPasswordLen || n > maxPasswordLen {
		return "password must be at least 6 characters"
	}
	return ""
}

// register creates a host account bound to the caller's current owner token, so
// any quizzes already created anonymously on this device carry over.
func (h *authHandler) register(w http.ResponseWriter, r *http.Request) {
	owner := ownerFrom(r)
	if owner == "" {
		writeErr(w, http.StatusUnauthorized, "missing X-Owner-Token")
		return
	}
	var req authReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if msg := validateCredentials(req.Username, req.Password); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeInternal(w, "hash password", err)
		return
	}
	acc, err := h.store.CreateAccount(r.Context(), req.Username, string(hash), owner)
	if errors.Is(err, store.ErrUsernameTaken) {
		writeErr(w, http.StatusConflict, "username already taken")
		return
	}
	if err != nil {
		writeInternal(w, "create account", err)
		return
	}
	writeJSON(w, http.StatusCreated, authResp{Username: acc.Username, OwnerToken: acc.OwnerToken})
}

// login verifies credentials and returns the account's owner token.
func (h *authHandler) login(w http.ResponseWriter, r *http.Request) {
	var req authReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Username = strings.TrimSpace(req.Username)

	acc, err := h.store.GetAccountByUsername(r.Context(), req.Username)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		writeInternal(w, "get account", err)
		return
	}
	// Compare against the stored hash (or a dummy when the user doesn't exist)
	// so timing doesn't reveal whether a username is registered.
	hash := dummyHash
	if acc != nil {
		hash = acc.PasswordHash
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil || acc == nil {
		writeErr(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	writeJSON(w, http.StatusOK, authResp{Username: acc.Username, OwnerToken: acc.OwnerToken})
}

// dummyHash is a valid bcrypt hash (of a random string) used to keep login
// timing constant for unknown usernames.
const dummyHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
