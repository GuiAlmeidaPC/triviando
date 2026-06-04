package httpsrv

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// rateLimiter is a per-key token bucket. Each key (here, client IP) refills at
// `rate` tokens per `window` up to a burst of `burst`. It's safe for concurrent
// use and prunes idle buckets lazily so memory stays bounded.
type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	burst   float64
	// refill tokens per second.
	refill    float64
	lastPrune time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

// newRateLimiter allows up to `max` requests per `window` per key.
func newRateLimiter(max int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		buckets:   map[string]*bucket{},
		burst:     float64(max),
		refill:    float64(max) / window.Seconds(),
		lastPrune: time.Now(),
	}
}

// allow reports whether a request from key may proceed, consuming one token.
func (rl *rateLimiter) allow(key string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	rl.pruneLocked(now)

	b, ok := rl.buckets[key]
	if !ok {
		// First request: full bucket minus the one we're consuming.
		rl.buckets[key] = &bucket{tokens: rl.burst - 1, last: now}
		return true
	}
	// Refill based on elapsed time, capped at burst.
	b.tokens += now.Sub(b.last).Seconds() * rl.refill
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// pruneLocked drops buckets that have fully refilled (idle long enough to be
// indistinguishable from a fresh one). Caller must hold rl.mu.
func (rl *rateLimiter) pruneLocked(now time.Time) {
	if now.Sub(rl.lastPrune) < time.Minute {
		return
	}
	rl.lastPrune = now
	for k, b := range rl.buckets {
		refilled := b.tokens + now.Sub(b.last).Seconds()*rl.refill
		if refilled >= rl.burst {
			delete(rl.buckets, k)
		}
	}
}

// middleware returns an http middleware that rate-limits by client IP.
func (rl *rateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(clientIP(r)) {
			w.Header().Set("Retry-After", "60")
			writeErr(w, http.StatusTooManyRequests, "too many attempts, try again later")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientIP extracts the request's source IP. RealIP middleware has already
// normalized RemoteAddr from X-Forwarded-For/X-Real-IP where present.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
