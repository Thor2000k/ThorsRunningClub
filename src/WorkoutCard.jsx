"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, MapPin, Plus, Route, Users, X, Zap } from "lucide-react";
import { api } from "./backend.js";
import { useTranslation } from "./i18n.js";
const formatDate = (date, options, language = "en") => new Intl.DateTimeFormat(language === "da" ? "da-DK" : "en-GB", {timeZone:"Europe/Copenhagen", ...options}).format(new Date(date));
export function Modal({ children, onClose, label }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  useEffect(() => {
    const prior = document.activeElement;
    ref.current.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-content">
        <button
          className="icon-button close"
          onClick={onClose}
          aria-label={t("Close dialog")}
        >
          <X size={22} />
        </button>
        {children}
      </div>
    </dialog>
  );
}

function RouteMap({ workout }) {
  const { t } = useTranslation();
  const [routeOpen, setRouteOpen] = useState(false);
  const routeId = useId();
return workout.route_url && (
        <>
          <button
            className="location route-toggle"
            type="button"
            aria-expanded={routeOpen}
            aria-controls={routeId}
            onClick={() => setRouteOpen((open) => !open)}
          >
            <Route size={16} />
            <span>{t("Route")}</span>
            <ChevronRight size={14} className={`route-chevron ${routeOpen ? "open" : ""}`} />
          </button>
          {routeOpen && (
            <div className="card-map route-map" id={routeId}>
              <iframe
                title={`${t("Running route for")} ${workout.title}`}
                src={workout.route_url.replace(/([?&])context=share(?=&|$)/, "$1context=embed")}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <a href={workout.route_url} target="_blank" rel="noopener noreferrer" className="map-external">
                {t("Open in On The Go Map")} <ArrowUpRight size={13} />
              </a>
            </div>
          )}
        </>
      );
}

function Participants({workout}) { const {t}=useTranslation(); return workout.participants && new Date(workout.starts_at)<=new Date() ? <p className="participants"><strong>{t("Participants")}:</strong> {workout.participants.join(", ") || t("No participants")}</p> : null; }
function CommentsSection({ workout, user, onSignIn, expanded = false }) {
  const { t, language } = useTranslation();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(expanded);
  const [body, setBody] = useState("");
  const commentsQuery = useQuery({ queryKey: ["comments", workout.id], queryFn: () => api(`/workouts/${workout.id}/comments`), staleTime: 15_000 });
  const commentMutation = useMutation({
    mutationFn: (value) => api(`/workouts/${workout.id}/comments`, "POST", { body: value }),
    onSuccess: () => { setBody(""); queryClient.invalidateQueries({ queryKey: ["comments", workout.id] }); },
  });
  const comments = commentsQuery.data?.comments || [];
  const visible = showAll ? comments : comments.slice(0, 2);
  function submit(event) {
    event.preventDefault();
    if (!body.trim()) return;
    if (!user) { onSignIn(); return; }
    commentMutation.mutate(body.trim());
  }
  return <section className={`comments-section ${showAll ? "expanded" : ""}`} aria-label={t("Comments")}>
    <div className="comments-heading"><h3>{t("Comments")}</h3><span>{comments.length}</span></div>
    {visible.length > 0 && <div className="comment-list">
      {visible.map((comment) => <article className="comment" key={comment.id}>
        <div><strong>{comment.author}</strong><time dateTime={comment.createdAt}>{new Intl.DateTimeFormat(language === "da" ? "da-DK" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(comment.createdAt))}</time></div>
        <p>{comment.body}</p>
      </article>)}
    </div>}
    {!comments.length && <p className="comments-empty">{t("No comments yet. Start the conversation.")}</p>}
    {comments.length > 2 && <button className="comments-toggle" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? t("Show fewer comments") : t("Show all comments")}</button>}
    <form className="comment-form" onSubmit={submit}>
      <input value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} placeholder={user ? t("Add a comment…") : t("Sign in to comment…")} aria-label={t("Comment")} />
      <button className="comment-submit" disabled={commentMutation.isPending || !body.trim()}>{commentMutation.isPending ? t("Saving…") : t("Post")}</button>
    </form>
    {commentMutation.error && <p className="form-error">{t(commentMutation.error.message)}</p>}
  </section>;
}

export function WorkoutCard({ workout, onDetails, onJoin, busy, user, onSignIn }) {
  const { t, language } = useTranslation();
  const format = (date, options) => formatDate(date, options, language);
  const past = new Date(workout.starts_at) <= new Date();
  const kindClass = workout.kind.toLowerCase().replaceAll(" ", "-");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(workout.location)}`;
  return (
    <article className={`workout-card ${kindClass} ${past ? "past" : ""}`}>
      <div className="card-top">
        <span className={`kind-tag ${kindClass}`}>
          <span />
          {t(workout.kind)}
        </span>
      </div>
      <button className="card-title" onClick={() => onDetails(workout)}>
        <h3>{workout.title}</h3>
        <ArrowUpRight size={19} />
      </button>
      <div className="run-time">
        <Clock3 size={15} />
        {format(workout.starts_at, { hour: "2-digit", minute: "2-digit" })}
        <span>·</span>
        {workout.duration_minutes} min
        <span>·</span>
        <span className="card-day">
          {format(workout.starts_at, { weekday: "short", day: "numeric" })}
        </span>
      </div>
      <div className="run-metrics">
        <div>
          <strong>
            {new Intl.NumberFormat(language).format(workout.distance_km)}
            <small> km</small>
          </strong>
          <span>{t("Distance")}</span>
        </div>
        <div>
          <strong className="pace-value">{workout.pace}</strong>
          <span>{t("Target pace")}</span>
        </div>
      </div>
      <a
        className="location"
        href={mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${workout.location} — ${t("Open in Google Maps")}`}
      >
        <MapPin size={16} />
        <span>{workout.location}</span>
      </a>
      <RouteMap workout={workout} />
      <Participants workout={workout} />
      <p className="card-notes">
        {workout.notes || t("Meet the crew, lace up, and enjoy the run.")}
      </p>
      <CommentsSection workout={workout} user={user} onSignIn={onSignIn} />
      <div className="card-footer">
        <span className="attendees">
          <Users size={16} />
          {workout.attendees
            ? t("{count} going", { count: workout.attendees })
            : t("Be the first")}
        </span>
        <button
          className={`join-button ${workout.joined ? "joined" : ""}`}
          disabled={busy || past}
          onClick={() => onJoin(workout)}
        >
          {busy ? (
            t("Saving…")
          ) : past ? t("Finished") : workout.joined ? (
            <>
              <Check size={15} />
              {t("Going")}
            </>
          ) : (
            <>
              {t("Join run")}
              <Plus size={15} />
            </>
          )}
        </button>
      </div>
      {workout.joined && !past && (
        <span className="sr-only">{t("Click Going to leave this run.")}</span>
      )}
    </article>
  );
}


export function WorkoutDetails({workout: selectedWorkout,user,onSignIn,onJoin,onClose,busy,error}) { const {t,language}=useTranslation(); const format=(date,options)=>formatDate(date,options,language); return (
        <Modal onClose={() => onClose()} label={selectedWorkout.title}>
          <span
            className={`kind-tag ${selectedWorkout.kind.toLowerCase().replaceAll(" ", "-")}`}
          >
            <span />
            {t(selectedWorkout.kind)}
          </span>
          <h2>{selectedWorkout.title}</h2>
          <p className="muted">
            {format(selectedWorkout.starts_at, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            {t("at")}{" "}
            {format(selectedWorkout.starts_at, {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {t("Copenhagen time")}
          </p>
          <div className="detail-metrics">
            <span>
              <Route size={18} />
              {new Intl.NumberFormat(language).format(
                selectedWorkout.distance_km,
              )}{" "}
              km
            </span>
            <span>
              <Clock3 size={18} />
              {selectedWorkout.duration_minutes} min
            </span>
            <span>
              <Zap size={18} />
              {selectedWorkout.pace}
            </span>
          </div>
          <h3>{t("The plan")}</h3>
          <p className="detail-notes">
            {selectedWorkout.notes || t("No additional notes for this run.")}
          </p>
          <RouteMap workout={selectedWorkout} />
          <Participants workout={selectedWorkout} />
          <CommentsSection workout={selectedWorkout} user={user} onSignIn={onSignIn} expanded />
          <h3>{t("Meet us here")}</h3>
          <a
            className="map-link"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedWorkout.location)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin size={20} />
            <span>
              {selectedWorkout.location}
              <small>{t("Open in Google Maps")}</small>
            </span>
            <ArrowUpRight size={18} />
          </a>
          <div className="detail-bottom">
            <span className="attendees">
              <Users size={18} />
              {t("{count} going", { count: selectedWorkout.attendees })}
            </span>
            <button
              className="button primary"
              disabled={
                busy ||
                new Date(selectedWorkout.starts_at) <= new Date()
              }
              onClick={() => onJoin(selectedWorkout)}
            >
              {busy
                ? t("Saving…")
                : new Date(selectedWorkout.starts_at) <= new Date() ? t("Run finished") : selectedWorkout.joined ? t("Leave this run") : t("Join this run")}
              <ArrowRight size={17} />
            </button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {t(error)}
            </p>
          )}
        </Modal>

); }
