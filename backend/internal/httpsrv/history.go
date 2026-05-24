package httpsrv

import (
	"net/http"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
)

type historyHandler struct {
	store *store.Store
}

func (h *historyHandler) list(w http.ResponseWriter, r *http.Request) {
	owner := ownerFrom(r)
	if owner == "" {
		writeErr(w, http.StatusUnauthorized, "missing X-Owner-Token")
		return
	}
	history, err := h.store.ListFinishedGamesByOwner(r.Context(), owner, 20)
	if err != nil {
		writeInternal(w, "list finished games", err)
		return
	}
	writeJSON(w, http.StatusOK, history)
}
