package httpsrv

import (
	"testing"
	"time"
)

func TestRateLimiterBurstAndRefill(t *testing.T) {
	rl := newRateLimiter(10, time.Minute)

	// First 10 requests from one IP are allowed; the 11th is blocked.
	for i := 0; i < 10; i++ {
		if !rl.allow("1.2.3.4") {
			t.Fatalf("request %d unexpectedly blocked", i+1)
		}
	}
	if rl.allow("1.2.3.4") {
		t.Fatal("11th request should be rate limited")
	}

	// A different IP has its own bucket.
	if !rl.allow("5.6.7.8") {
		t.Fatal("separate IP should not be limited")
	}

	// After enough time to refill one token (>6s at 10/min), one more is allowed.
	if b := rl.buckets["1.2.3.4"]; b != nil {
		b.last = b.last.Add(-7 * time.Second)
	}
	if !rl.allow("1.2.3.4") {
		t.Fatal("expected one refilled token to allow a request")
	}
}
