import { getOwnerToken } from "./owner";

export interface Choice {
  id?: string;
  position?: number;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id?: string;
  position?: number;
  prompt: string;
  timeLimitSeconds: number;
  points: number;
  choices: Choice[];
}

export interface Quiz {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  questions: Question[] | null;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Owner-Token": getOwnerToken(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listQuizzes: () => request<Quiz[]>("GET", "/api/quizzes"),
  createQuiz: (title: string) => request<Quiz>("POST", "/api/quizzes", { title }),
  getQuiz: (id: string) => request<Quiz>("GET", `/api/quizzes/${id}`),
  updateQuiz: (id: string, title: string, questions: Question[]) =>
    request<Quiz>("PUT", `/api/quizzes/${id}`, { title, questions }),
  deleteQuiz: (id: string) => request<void>("DELETE", `/api/quizzes/${id}`),
};
