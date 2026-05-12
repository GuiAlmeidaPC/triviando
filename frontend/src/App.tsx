import { BrowserRouter, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import QuizList from "./pages/QuizList";
import QuizEdit from "./pages/QuizEdit";
import Host from "./pages/Host";
import Join from "./pages/Join";
import Play from "./pages/Play";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/quizzes" element={<QuizList />} />
        <Route path="/edit/:id" element={<QuizEdit />} />
        <Route path="/host" element={<Host />} />
        <Route path="/host/:gameId" element={<Host />} />
        <Route path="/join" element={<Join />} />
        <Route path="/play" element={<Play />} />
      </Routes>
    </BrowserRouter>
  );
}
