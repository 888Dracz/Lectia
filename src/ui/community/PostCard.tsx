import { Flame, Heart, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { deletePost, reportError, toggleLike } from "../../community/store";
import { safeImage } from "../../community/thumb";
import type { Post } from "../../community/types";
import { navigate } from "../../lib/router";
import { formatRelative } from "../../lib/util";
import { toast } from "../../store/ui";
import { GeneratedCover } from "../components/Cover";
import { confirmDialog } from "../components/Dialog";
import { division } from "../../community/divisions";
import { Avatar, DivisionBadge, LikersLine, Stars } from "./parts";

const ACTION_MINE: Record<Post["kind"], string> = {
  joined: "te uniste a Lectia",
  book_finished: "terminaste un libro",
  share_book: "recomiendas un libro",
  share_quote: "compartiste una cita",
  streak: "alcanzaste una racha",
  achievement: "desbloqueaste un logro",
  level: "subiste de nivel",
  league: "subiste de división",
};

const ACTION: Record<Post["kind"], string> = {
  joined: "se unió a Lectia",
  book_finished: "terminó un libro",
  share_book: "recomienda un libro",
  share_quote: "compartió una cita",
  streak: "alcanzó una racha",
  achievement: "desbloqueó un logro",
  level: "subió de nivel",
  league: "subió de división",
};

export function PostCard({ post, mine, onDeleted }: { post: Post; mine: boolean; onDeleted?: (id: string) => void }) {
  const d = post.data;
  const [like, setLike] = useState({ liked: post.liked, likes: post.likes });
  useEffect(() => setLike({ liked: post.liked, likes: post.likes }), [post.liked, post.likes]);

  const onLike = async () => {
    const before = like;
    // Se muestra al instante y se corrige con la respuesta.
    setLike({ liked: !like.liked, likes: like.likes + (like.liked ? -1 : 1) });
    try {
      setLike(await toggleLike(post));
    } catch (e) {
      setLike(before);
      reportError(e);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog("¿Borrar esta novedad?", "Dejará de verse en las Novedades de tus amigos.", "Borrar", true))) return;
    try {
      await deletePost(post.id);
      onDeleted?.(post.id);
      toast("Novedad borrada");
    } catch (e) {
      reportError(e);
    }
  };

  return (
    <article className={`post post-${post.kind}`}>
      <header className="post-head">
        <button className="post-who" onClick={() => navigate({ name: "profile", username: post.username })}>
          <Avatar user={post} size={40} />
          <span>
            <b>{mine ? "Tú" : post.display_name}</b> <span className="muted">{(mine ? ACTION_MINE : ACTION)[post.kind]}</span>
            <span className="post-time faint">{formatRelative(Date.parse(post.created_at))}</span>
          </span>
        </button>
        {mine && (
          <button className="icon-btn" aria-label="Borrar novedad" onClick={() => void remove()}>
            <Trash size={17} />
          </button>
        )}
      </header>

      <div className="post-body">
        {(post.kind === "book_finished" || post.kind === "share_book") && (
          <div className="post-book">
            <div className="post-cover cover">
              {safeImage(d.cover) ? <img src={safeImage(d.cover)} alt="" /> : <GeneratedCover title={d.title ?? "Libro"} author={d.author ?? ""} />}
            </div>
            <div className="post-book-info">
              <b className="display">{d.title}</b>
              {d.author && <span className="muted">{d.author}</span>}
              {!!d.rating && <Stars value={d.rating} size={16} />}
              {post.kind === "book_finished" && <span className="post-tag">🏁 Terminado</span>}
            </div>
          </div>
        )}
        {post.kind === "share_book" && d.text && <p className="post-text">“{d.text}”</p>}

        {post.kind === "share_quote" && (
          <>
            <blockquote className="post-quote">{d.quote}</blockquote>
            <div className="post-source faint">
              — {d.title}
              {d.author ? `, ${d.author}` : ""}
            </div>
            {d.note && <p className="post-text">{d.note}</p>}
          </>
        )}

        {post.kind === "streak" && (
          <div className="post-big streak">
            <Flame size={40} />
            <div>
              <b>{d.days}</b>
              <span>días seguidos leyendo</span>
            </div>
          </div>
        )}

        {post.kind === "achievement" && (
          <div className="post-big">
            <span className="post-medal">{d.icon}</span>
            <div>
              <b className="post-big-title">{d.title}</b>
              <span>Logro desbloqueado</span>
            </div>
          </div>
        )}

        {post.kind === "level" && (
          <div className="post-big">
            <span className="post-medal">{d.emoji}</span>
            <div>
              <b className="post-big-title">Nivel {d.level}</b>
              <span>
                {mine ? "Ahora eres" : "Ahora es"} {d.rank}
              </span>
            </div>
          </div>
        )}

        {post.kind === "league" && (
          <div className="post-big">
            <DivisionBadge div={d.division ?? 0} size={46} />
            <div>
              <b className="post-big-title">División {division(d.division ?? 0).name}</b>
              <span>¡Ascenso en la liga semanal!</span>
            </div>
          </div>
        )}

        {post.kind === "joined" && <p className="post-text muted">{mine ? "¡Bienvenida/o a la comunidad! 👋" : "¡Dale la bienvenida con un me gusta! 👋"}</p>}
      </div>

      <footer className="post-foot">
        <button
          className={`like-btn ${like.liked ? "on" : ""}`}
          disabled={mine}
          aria-pressed={like.liked}
          aria-label={like.liked ? "Quitar me gusta" : "Me gusta"}
          onClick={() => void onLike()}
        >
          <Heart size={19} fill={like.liked ? "currentColor" : "none"} />
          {like.likes > 0 && <span>{like.likes}</span>}
        </button>
        <LikersLine likers={post.likers} likes={like.likes} liked={like.liked} />
      </footer>
    </article>
  );
}
