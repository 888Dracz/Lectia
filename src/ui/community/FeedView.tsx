import { PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { markFeedSeen, refreshFeed, reportError, useCommunity } from "../../community/store";
import { Avatar, EmptyNote, ErrorRetry, Loading } from "./parts";
import { PostCard } from "./PostCard";
import { openShare } from "./ShareSheet";

export function FeedView() {
  const feed = useCommunity((s) => s.feed);
  const done = useCommunity((s) => s.feedDone);
  const me = useCommunity((s) => s.profile);
  const [state, setState] = useState<"loading" | "error" | "ok">(feed ? "ok" : "loading");
  const [more, setMore] = useState(false);

  const load = () => {
    refreshFeed()
      .then(() => {
        setState("ok");
        markFeedSeen();
      })
      .catch((e) => {
        if (!useCommunity.getState().feed) setState("error");
        else reportError(e);
      });
  };
  useEffect(load, []);

  if (!me) return null;

  return (
    <div className="feed">
      <button className="composer" onClick={() => openShare()}>
        <Avatar user={me} size={38} />
        <span className="composer-text">Comparte un libro o una cita…</span>
        <PenLine size={19} />
      </button>

      {!feed ? (
        state === "error" ? (
          <ErrorRetry onRetry={load} />
        ) : (
          <Loading />
        )
      ) : feed.length === 0 ? (
        <EmptyNote emoji="📰" title="Aún no hay novedades">
          Aquí verás los libros que terminan y recomiendan tus amigos, sus citas favoritas, rachas y logros.
        </EmptyNote>
      ) : (
        <>
          {feed.map((p) => (
            <PostCard key={p.id} post={p} mine={p.user_id === me.id} />
          ))}
          {!done && (
            <button
              className="btn btn-block btn-ghost"
              disabled={more}
              onClick={() => {
                setMore(true);
                refreshFeed(true)
                  .catch((e) => reportError(e))
                  .finally(() => setMore(false));
              }}
            >
              {more ? "Cargando…" : "Ver más"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
