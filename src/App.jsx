import Sidebar from "./components/Sidebar";

export default function App() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-transparent text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.2),transparent_32%),radial-gradient(circle_at_80%_80%,rgba(34,197,94,0.15),transparent_30%)]" />
      <Sidebar />
    </div>
  );
}
