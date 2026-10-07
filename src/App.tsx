import { ChartColumn, Dumbbell, Library, NotebookText, Settings, Trophy } from "lucide-react";
import { useEffect } from "react";
import { goBack, navigate, useRoute, type Route } from "./lib/router";
import { useCommunity } from "./community/store";
import { useStore } from "./store/store";
import { CommunityScreen } from "./ui/community/CommunityScreen";
import { ProfileScreen } from "./ui/community/ProfileScreen";
import { ShareHost } from "./ui/community/ShareSheet";
import { DialogHost } from "./ui/components/Dialog";
import { BusyOverlay, Celebrations, Toasts } from "./ui/components/Overlays";
import { GameScreen } from "./ui/games/GameScreen";
import { TrainScreen } from "./ui/games/TrainScreen";
import { LibraryScreen } from "./ui/library/LibraryScreen";
import { openBook } from "./ui/library/useOpenBook";
import { NotebooksScreen } from "./ui/notebook/NotebooksScreen";
import { NotebookView } from "./ui/notebook/NotebookView";
import { setPendingJump } from "./ui/reader/jump";
import { ReadingListScreen } from "./ui/readinglist/ReadingListScreen";
import { ProgressScreen } from "./ui/progress/ProgressScreen";
import { ReaderScreen } from "./ui/reader/ReaderScreen";
import { SettingsScreen } from "./ui/settings/SettingsScreen";

function useAppTheme() {
  const theme = useStore((s) => s.app.theme);
  const accent = useStore((s) => s.app.accent);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.accent = accent;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0d0f15" : "#f5f2ec");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, accent]);
}

const TABS: { route: Route; label: string; icon: React.ReactNode; match: Route["name"][] }[] = [
  { route: { name: "library" }, label: "Biblioteca", icon: <Library size={22} />, match: ["library", "readingList"] },
  { route: { name: "notebooks" }, label: "Cuadernos", icon: <NotebookText size={22} />, match: ["notebooks", "notebook"] },
  { route: { name: "train" }, label: "Entrenar", icon: <Dumbbell size={22} />, match: ["train", "game"] },
  { route: { name: "community", tab: "league" }, label: "Comunidad", icon: <Trophy size={22} />, match: ["community", "profile"] },
  { route: { name: "progress" }, label: "Progreso", icon: <ChartColumn size={22} />, match: ["progress"] },
  { route: { name: "settings" }, label: "Ajustes", icon: <Settings size={22} />, match: ["settings"] },
];

function TabBar({ route }: { route: Route }) {
  const badges = useCommunity((s) => s.badges);
  const pending = badges.requests + badges.posts;
  return (
    <nav className="tabbar" aria-label="Secciones">
      <div className="tabbar-inner">
        {TABS.map((t) => {
          const active = t.match.includes(route.name);
          return (
            <button
              key={t.label}
              className={`tab ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (active && route.name !== "profile") window.scrollTo({ top: 0, behavior: "smooth" });
                else navigate(t.route);
              }}
            >
              <span className="tab-icon">
                {t.icon}
                {t.label === "Comunidad" && pending > 0 && <span className="tab-dot" aria-label={`${pending} novedades`} />}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function NotebookRoute({ bookId }: { bookId: string }) {
  const exists = useStore((s) => !!s.books[bookId] || !!s.notebooks[bookId]);
  if (!exists) {
    return (
      <div className="screen">
        <div className="empty">
          <h2>Este cuaderno ya no existe</h2>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => navigate({ name: "notebooks" }, { replace: true })}>
              Ver mis cuadernos
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <NotebookView
      bookId={bookId}
      onBack={() => goBack({ name: "notebooks" })}
      onGo={(target) => {
        setPendingJump(bookId, target);
        openBook(bookId);
      }}
    />
  );
}

export function App() {
  const hydrated = useStore((s) => s.hydrated);
  const route = useRoute();
  useAppTheme();

  const routeKey = route.name === "profile" ? `profile:${route.username ?? ""}` : route.name === "community" ? `community:${route.tab}` : route.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  if (!hydrated) {
    return (
      <div className="splash">
        <img src={`${import.meta.env.BASE_URL}icon-512-v2.png`} alt="Lectia" />
      </div>
    );
  }

  const fullScreen = route.name === "reader" || route.name === "game" || route.name === "notebook" || route.name === "readingList";

  return (
    <div className="app">
      {route.name === "library" && <LibraryScreen />}
      {route.name === "reader" && <ReaderScreen key={route.bookId} bookId={route.bookId} />}
      {route.name === "train" && <TrainScreen />}
      {route.name === "game" && <GameScreen key={route.game} game={route.game} />}
      {route.name === "community" && <CommunityScreen tab={route.tab} />}
      {route.name === "profile" && <ProfileScreen key={route.username ?? ""} username={route.username} />}
      {route.name === "progress" && <ProgressScreen />}
      {route.name === "notebooks" && <NotebooksScreen />}
      {route.name === "notebook" && <NotebookRoute key={route.bookId} bookId={route.bookId} />}
      {route.name === "readingList" && <ReadingListScreen />}
      {route.name === "settings" && <SettingsScreen />}
      {!fullScreen && <TabBar route={route} />}
      <Toasts high={fullScreen} />
      <Celebrations />
      <BusyOverlay />
      <ShareHost />
      <DialogHost />
    </div>
  );
}
