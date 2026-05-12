package live

import "testing"

func TestScore(t *testing.T) {
	cases := []struct {
		name      string
		base      int64
		limitSec  int64
		startMS   int64
		answerMS  int64
		correct   bool
		want      int
	}{
		{"wrong returns zero", 1000, 20, 0, 1000, false, 0},
		{"instant answer = base", 1000, 20, 1000, 1000, true, 1000},
		{"halfway = 0.75x base", 1000, 20, 0, 10_000, true, 750},
		{"last instant ≈ 0.5x base", 1000, 20, 0, 20_000, true, 500},
		{"past deadline clamps to 0.5x", 1000, 20, 0, 21_000, true, 500},
		{"zero time limit returns base", 1000, 0, 0, 5_000, true, 1000},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Score(tc.base, tc.limitSec, tc.answerMS, tc.startMS, tc.correct)
			if got != tc.want {
				t.Errorf("Score(...) = %d, want %d", got, tc.want)
			}
		})
	}
}
