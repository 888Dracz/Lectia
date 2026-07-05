import { useState } from "react";
import { StoreProvider } from "./store/useAppStore";
import { Today } from "./ui/Today";
import { Cycle } from "./ui/Cycle";
import { Stats } from "./ui/Stats";
import { Report } from "./ui/Report";
import { Profile } from "./ui/Profile";

type Tab = "hoy" | "ciclo" | "stats" | "informe" | "perfil";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "hoy", label: "Hoy", icon: "🌸" },
  { id: "ciclo", label: "Ciclo", icon: "📅" },
  { id: "stats", label: "Stats", icon: "📊" },
  { id: "informe", label: "Informe", icon: "📄" },
  { id: "perfil", label: "Perfil", icon: "👤" },
];

const TITLES: Record<Tab, string> = {
  hoy: "Tu día",
  ciclo: "Tu ciclo",
  stats: "Estadísticas",
  informe: "Informe y calendario",
  perfil: "Perfil",
};

export default function App() {
  const [tab, setTab] = useState<Tab>("hoy");

  return (
    <StoreProvider>
      <div className="app">
        <header className="app-header">
          <span className="logo">🔔</span>
          <div>
            <h1>Campanita</h1>
            <p className="subtitle">{TITLES[tab]}</p>
          </div>
        </header>

        <main className="content">
          {tab === "hoy" && <Today />}
          {tab === "ciclo" && <Cycle />}
          {tab === "stats" && <Stats />}
          {tab === "informe" && <Report />}
          {tab === "perfil" && <Profile />}
        </main>

        <nav className="tabbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              <span className="ico">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </StoreProvider>
  );
}
