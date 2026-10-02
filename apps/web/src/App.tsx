import { Outlet, Route, Routes } from "react-router";
import { AppNav } from "./components/AppNav";
import { Home } from "./routes/Home";
import { SourceHealth } from "./routes/SourceHealth";

function Shell() {
  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="sources" element={<SourceHealth />} />
      </Route>
    </Routes>
  );
}
