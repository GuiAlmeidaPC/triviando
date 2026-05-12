package httpsrv

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
	"github.com/go-chi/chi/v5"
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		req.Title = "Untitled quiz"
	}
	q, err := h.store.CreateQuiz(r.Context(), owner, req.Title)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
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
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, qs)
}

func (h *quizHandler) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	q, err := h.store.GetQuiz(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "quiz not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, q)
}

type updateQuizReq struct {
	Title     string           `json:"title"`
	Questions []store.Question `json:"questions"`
}

func (h *quizHandler) update(w http.ResponseWriter, r *http.Request) {
	owner := ownerFrom(r)
	if owner == "" {
		writeErr(w, http.StatusUnauthorized, "missing X-Owner-Token")
		return
	}
	id := chi.URLParam(r, "id")
	var req updateQuizReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		writeErr(w, http.StatusBadRequest, "title is required")
		return
	}
	q, err := h.store.UpdateQuiz(r.Context(), id, owner, req.Title, req.Questions)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "quiz not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
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
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
