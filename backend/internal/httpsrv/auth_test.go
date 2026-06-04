package httpsrv

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/live"
	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
)

func newTestServer(t *testing.T) (http.Handler, *store.Store) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "triviando.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return New(st, live.NewHub(st)), st
}

func doJSON(t *testing.T, h http.Handler, method, path, ownerToken string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if ownerToken != "" {
		req.Header.Set("X-Owner-Token", ownerToken)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestAuthRegisterCarriesOverQuizzesAndLogin(t *testing.T) {
	h, st := newTestServer(t)
	ctx := context.Background()

	// A quiz created anonymously on this device.
	owner := "device-owner-token"
	quiz, err := st.CreateQuiz(ctx, owner, "Anonymous quiz")
	if err != nil {
		t.Fatalf("create quiz: %v", err)
	}

	// Register binds the account to the current owner token.
	rec := doJSON(t, h, "POST", "/api/auth/register", owner, authReq{Username: "alice", Password: "hunter2"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("register status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var reg authResp
	if err := json.Unmarshal(rec.Body.Bytes(), &reg); err != nil {
		t.Fatalf("decode register resp: %v", err)
	}
	if reg.OwnerToken != owner {
		t.Fatalf("register ownerToken = %q, want %q (carry-over)", reg.OwnerToken, owner)
	}

	// Duplicate username is rejected.
	rec = doJSON(t, h, "POST", "/api/auth/register", "other-token", authReq{Username: "alice", Password: "another"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate register status = %d, want 409", rec.Code)
	}

	// Login from a "new device" returns the same owner token...
	rec = doJSON(t, h, "POST", "/api/auth/login", "", authReq{Username: "alice", Password: "hunter2"})
	if rec.Code != http.StatusOK {
		t.Fatalf("login status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var login authResp
	if err := json.Unmarshal(rec.Body.Bytes(), &login); err != nil {
		t.Fatalf("decode login resp: %v", err)
	}
	if login.OwnerToken != owner {
		t.Fatalf("login ownerToken = %q, want %q", login.OwnerToken, owner)
	}

	// ...and that token lists the carried-over quiz.
	rec = doJSON(t, h, "GET", "/api/quizzes", login.OwnerToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list quizzes status = %d", rec.Code)
	}
	var quizzes []store.Quiz
	if err := json.Unmarshal(rec.Body.Bytes(), &quizzes); err != nil {
		t.Fatalf("decode quizzes: %v", err)
	}
	if len(quizzes) != 1 || quizzes[0].ID != quiz.ID {
		t.Fatalf("expected carried-over quiz %s, got %+v", quiz.ID, quizzes)
	}

	// Wrong password is rejected.
	rec = doJSON(t, h, "POST", "/api/auth/login", "", authReq{Username: "alice", Password: "wrong"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad-password login status = %d, want 401", rec.Code)
	}

	// Unknown user is rejected (and dummyHash path doesn't panic).
	rec = doJSON(t, h, "POST", "/api/auth/login", "", authReq{Username: "nobody", Password: "whatever"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unknown-user login status = %d, want 401", rec.Code)
	}
}
