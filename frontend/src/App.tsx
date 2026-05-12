import { BrowserRouter, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import QuizList from "./pages/QuizList";
import QuizEdit from "./pages/QuizEdit";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/quizzes" element={<QuizList />} />
        <Route path="/edit/:id" element={<QuizEdit />} />
      </Routes>
    </BrowserRouter>
  );
}
