import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Transactions from "./pages/Transactions";
import Import from "./pages/Import";
import Salary from "./pages/Salary";
import Assets from "./pages/Assets";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/transactions"
            element={
              <RequireAuth>
                <Transactions />
              </RequireAuth>
            }
          />
          <Route
            path="/import"
            element={
              <RequireAuth>
                <Import />
              </RequireAuth>
            }
          />
          <Route
            path="/salary"
            element={
              <RequireAuth>
                <Salary />
              </RequireAuth>
            }
          />
          <Route
            path="/assets"
            element={
              <RequireAuth>
                <Assets />
              </RequireAuth>
            }
          />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
