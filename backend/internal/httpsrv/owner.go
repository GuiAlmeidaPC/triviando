package httpsrv

import (
	"context"
	"net/http"
)

type ctxKey string

const ownerCtxKey ctxKey = "owner"

// ownerMiddleware extracts the anonymous owner token from the X-Owner-Token header.
// Missing token is fine for endpoints that don't require ownership; handlers that
// require it should check ownerFrom(r) and return 401 if empty.
func ownerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("X-Owner-Token")
		if token != "" {
			ctx := context.WithValue(r.Context(), ownerCtxKey, token)
			r = r.WithContext(ctx)
		}
		next.ServeHTTP(w, r)
	})
}

func ownerFrom(r *http.Request) string {
	v, _ := r.Context().Value(ownerCtxKey).(string)
	return v
}
