import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { getSession, type User } from "./api";
import Home from "./routes/Home";
import SignIn from "./routes/SignIn";
import Workspaces from "./routes/Workspaces";

type SessionState = { user: User | null; setUser(u: User | null): void };
const Session = createContext<SessionState>({ user: null, setUser: () => {} });
export const useSession = () => useContext(Session);

const CURRENT_KEY = "cherry.currentWorkspace";
export const currentWorkspace = {
  get: (): string | null => { try { return localStorage.getItem(CURRENT_KEY); } catch { return null; } },
  set: (id: string) => { try { localStorage.setItem(CURRENT_KEY, id); } catch { /* storage unavailable */ } },
};

function RequireUser({ children }: { children: ReactNode }) {
  return useSession().user ? children : <Navigate to="/sign-in" replace />;
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    getSession().then((s) => setUser(s?.user ?? null), () => setUser(null));
  }, []);
  if (user === undefined) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;

  return (
    <Session.Provider value={{ user, setUser }}>
      <Routes>
        <Route path="/sign-in" element={user ? <Navigate to="/" replace /> : <SignIn />} />
        <Route path="/workspaces" element={<RequireUser><Workspaces /></RequireUser>} />
        <Route path="/" element={<RequireUser><Home /></RequireUser>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Session.Provider>
  );
}
