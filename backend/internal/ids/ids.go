// Package ids generates short, URL-safe random identifiers.
package ids

import (
	"crypto/rand"
	"encoding/base32"
)

var enc = base32.StdEncoding.WithPadding(base32.NoPadding)

// New returns a 16-char base32 ID (10 bytes of entropy, ~80 bits).
func New() string {
	var b [10]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return enc.EncodeToString(b[:])
}
