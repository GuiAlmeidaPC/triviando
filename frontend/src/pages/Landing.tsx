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
            to="/join"
            className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            Join with PIN
          </Link>
          <Link
            to="/quizzes"
            className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold py-3 px-6 rounded-lg transition"
          >
            Host: my quizzes
          </Link>
        </div>
      </div>
    </div>
  );
}
