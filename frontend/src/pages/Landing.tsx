import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="text-center space-y-8 max-w-md">
        <h1 className="text-6xl font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
          Triviando
        </h1>
        <p className="text-slate-400">Real-time trivia for groups.</p>
        <div className="flex flex-col gap-3">
          <Link
            to="/quizzes"
            className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            My quizzes
          </Link>
          <button
            disabled
            className="bg-slate-800 text-slate-500 font-semibold py-3 px-6 rounded-lg cursor-not-allowed"
            title="Coming in milestone 3"
          >
            Join with PIN (coming soon)
          </button>
        </div>
      </div>
    </div>
  );
}
