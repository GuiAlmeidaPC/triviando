package httpsrv

import (
	"strings"
	"testing"

	"github.com/GuiAlmeidaPC/triviando/backend/internal/store"
)

func TestValidateUpdate(t *testing.T) {
	valid := updateQuizReq{
		Title: "General knowledge",
		Questions: []store.Question{
			{
				Prompt:           "Capital of France?",
				TimeLimitSeconds: 20,
				Points:           1000,
				Choices: []store.Choice{
					{Text: "Paris", IsCorrect: true},
					{Text: "Lyon", IsCorrect: false},
				},
			},
		},
	}
	if msg := validateUpdate(&valid); msg != "" {
		t.Fatalf("validateUpdate(valid) = %q, want empty", msg)
	}
	if valid.Questions[0].Prompt != "Capital of France?" {
		t.Fatalf("prompt not trimmed as expected: %q", valid.Questions[0].Prompt)
	}

	tests := []struct {
		name string
		req  updateQuizReq
		want string
	}{
		{
			name: "missing prompt",
			req: updateQuizReq{
				Title: "Quiz",
				Questions: []store.Question{{
					Prompt:           "   ",
					TimeLimitSeconds: 20,
					Points:           1000,
					Choices:          []store.Choice{{Text: "A", IsCorrect: true}, {Text: "B"}},
				}},
			},
			want: "question prompt is required",
		},
		{
			name: "too few choices",
			req: updateQuizReq{
				Title: "Quiz",
				Questions: []store.Question{{
					Prompt:           "Prompt",
					TimeLimitSeconds: 20,
					Points:           1000,
					Choices:          []store.Choice{{Text: "Only", IsCorrect: true}},
				}},
			},
			want: "question must have at least 2 choices",
		},
		{
			name: "missing choice text",
			req: updateQuizReq{
				Title: "Quiz",
				Questions: []store.Question{{
					Prompt:           "Prompt",
					TimeLimitSeconds: 20,
					Points:           1000,
					Choices:          []store.Choice{{Text: " ", IsCorrect: true}, {Text: "B"}},
				}},
			},
			want: "choice text is required",
		},
		{
			name: "multiple correct answers",
			req: updateQuizReq{
				Title: "Quiz",
				Questions: []store.Question{{
					Prompt:           "Prompt",
					TimeLimitSeconds: 20,
					Points:           1000,
					Choices:          []store.Choice{{Text: "A", IsCorrect: true}, {Text: "B", IsCorrect: true}},
				}},
			},
			want: "question must have exactly 1 correct choice",
		},
		{
			name: "too long title",
			req: updateQuizReq{
				Title: strings.Repeat("a", maxTitleLen+1),
			},
			want: "title too long",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if msg := validateUpdate(&tc.req); msg != tc.want {
				t.Fatalf("validateUpdate() = %q, want %q", msg, tc.want)
			}
		})
	}
}
