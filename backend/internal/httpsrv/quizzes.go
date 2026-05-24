package httpsrv

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
	"github.com/go-chi/chi/v5"
)

// Quiz content limits. These are intentionally generous; they exist to bound
// memory and storage cost, not to enforce product rules.
const (
	maxTitleLen     = 200
	maxPromptLen    = 1000
	maxChoiceLen    = 500
	maxQuestions    = 200
	minChoicesPerQ  = 2
	maxChoicesPerQ  = 10
	maxTimeLimitSec = 600
	maxPointsPerQ   = 1_000_000
)

type quizHandler struct {
	store *store.Store
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// writeInternal logs the real cause server-side but returns a generic message.
func writeInternal(w http.ResponseWriter, op string, err error) {
	log.Printf("%s: %v", op, err)
	writeErr(w, http.StatusInternalServerError, "internal error")
}

func decodeJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

type createQuizReq struct {
	Title string `json:"title"`
}

func (h *quizHandler) create(w http.ResponseWriter, r *http.Request) {
	owner := ownerFrom(r)
	if owner == "" {
		writeErr(w, http.StatusUnauthorized, "missing X-Owner-Token")
		return
	}
	var req createQuizReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		req.Title = "Untitled quiz"
	}
	if utf8.RuneCountInString(req.Title) > maxTitleLen {
		writeErr(w, http.StatusBadRequest, "title too long")
		return
	}
	q, err := h.store.CreateQuiz(r.Context(), owner, req.Title)
	if err != nil {
		writeInternal(w, "create quiz", err)
		return
	}
	writeJSON(w, http.StatusCreated, q)
}

func (h *quizHandler) list(w http.ResponseWriter, r *http.Request) {
	owner := ownerFrom(r)
	if owner == "" {
		writeErr(w, http.StatusUnauthorized, "missing X-Owner-Token")
		return
	}
	qs, err := h.store.ListQuizzesByOwner(r.Context(), owner)
	if err != nil {
		writeInternal(w, "list quizzes", err)
		return
	}
	writeJSON(w, http.StatusOK, qs)
}

func (h *quizHandler) get(w http.ResponseWriter, r *http.Request) {
	owner := ownerFrom(r)
	if owner == "" {
		writeErr(w, http.StatusUnauthorized, "missing X-Owner-Token")
		return
	}
	id := chi.URLParam(r, "id")
	q, err := h.store.GetQuizOwnedBy(r.Context(), id, owner)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "quiz not found")
		return
	}
	if err != nil {
		writeInternal(w, "get quiz", err)
		return
	}
	writeJSON(w, http.StatusOK, q)
}

type updateQuizReq struct {
	Title     string           `json:"title"`
	Questions []store.Question `json:"questions"`
}

func validateUpdate(req *updateQuizReq) string {
	if utf8.RuneCountInString(req.Title) > maxTitleLen {
		return "title too long"
	}
	if len(req.Questions) > maxQuestions {
		return "too many questions"
	}
	for i := range req.Questions {
		q := &req.Questions[i]
		q.Prompt = strings.TrimSpace(q.Prompt)
		if q.Prompt == "" {
			return "question prompt is required"
		}
		if utf8.RuneCountInString(q.Prompt) > maxPromptLen {
			return "question prompt too long"
		}
		if q.TimeLimitSeconds < 1 || q.TimeLimitSeconds > maxTimeLimitSec {
			return "invalid time limit"
		}
		if q.Points < 0 || q.Points > maxPointsPerQ {
			return "invalid points"
		}
		if len(q.Choices) < minChoicesPerQ {
			return "question must have at least 2 choices"
		}
		if len(q.Choices) > maxChoicesPerQ {
			return "too many choices"
		}
		correctCount := 0
		for j := range q.Choices {
			q.Choices[j].Text = strings.TrimSpace(q.Choices[j].Text)
			if q.Choices[j].Text == "" {
				return "choice text is required"
			}
			if utf8.RuneCountInString(q.Choices[j].Text) > maxChoiceLen {
				return "choice text too long"
			}
			if q.Choices[j].IsCorrect {
				correctCount++
			}
		}
		if correctCount != 1 {
			return "question must have exactly 1 correct choice"
		}
	}
	return ""
}

func (h *quizHandler) update(w http.ResponseWriter, r *http.Request) {
	owner := ownerFrom(r)
	if owner == "" {
		writeErr(w, http.StatusUnauthorized, "missing X-Owner-Token")
		return
	}
	id := chi.URLParam(r, "id")
	var req updateQuizReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		writeErr(w, http.StatusBadRequest, "title is required")
		return
	}
	if msg := validateUpdate(&req); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	q, err := h.store.UpdateQuiz(r.Context(), id, owner, req.Title, req.Questions)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "quiz not found")
		return
	}
	if err != nil {
		writeInternal(w, "update quiz", err)
		return
	}
	writeJSON(w, http.StatusOK, q)
}

func (h *quizHandler) delete(w http.ResponseWriter, r *http.Request) {
	owner := ownerFrom(r)
	if owner == "" {
		writeErr(w, http.StatusUnauthorized, "missing X-Owner-Token")
		return
	}
	id := chi.URLParam(r, "id")
	err := h.store.DeleteQuiz(r.Context(), id, owner)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "quiz not found")
		return
	}
	if err != nil {
		writeInternal(w, "delete quiz", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
