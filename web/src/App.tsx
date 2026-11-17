import { Route, Routes } from "react-router";
import { Applications } from "./pages/Applications";
import { Board } from "./pages/Board";

// Employer pages (/employer, /employer/jobs/new, /employer/jobs/:id/applicants) and
// /login, /signup follow the same pattern; see section 5.2 of the doc.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Board />} />
      <Route path="/jobs/:id" element={<Board />} />
      <Route path="/applications" element={<Applications />} />
      <Route path="*" element={<Board />} />
    </Routes>
  );
}
