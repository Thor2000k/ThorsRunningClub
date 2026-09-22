import { useEffect, useRef, useState } from "react";
import {
  LanguageContext,
  initialLanguage,
  useTranslation,
  localizedWorkout,
} from "./i18n.js";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Footprints,
  MapPin,
  Menu,
  Plus,
  Route,
  Users,
  X,
  Zap,
} from "lucide-react";

const ZONE = "Europe/Copenhagen";
const KINDS = [
  "All runs",
  "Easy run",
  "Intervals",
  "Tempo",
  "Long run",
  "Recovery",
];
const formatDate = (date, options, language = "en") =>
  new Intl.DateTimeFormat(language === "da" ? "da-DK" : "en-GB", {
    timeZone: ZONE,
    ...options,
  }).format(new Date(date));
const dateKey = (date) =>
  formatDate(date, { year: "numeric", month: "2-digit", day: "2-digit" })
    .split("/")
    .reverse()
    .join("-");
function mondayFor(date) {
  const d = new Date(`${dateKey(date)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
async function api(path, method = "GET", data) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(data !== undefined && { body: JSON.stringify(data) }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server is unavailable. Please try again shortly.");
  }
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

function Modal({ children, onClose, label }) {
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

function AuthModal({ mode, setMode, onClose, onSuccess, joining }) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api(
        mode === "register" ? "/register" : "/login",
        "POST",
        data,
      );
      await onSuccess(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      onClose={onClose}
      label={mode === "register" ? t("Create your club account") : t("Sign in")}
    >
      <div className="modal-symbol">
        <Footprints size={25} />
      </div>
      <p className="eyebrow">{t("THERE’S A PLACE FOR YOU HERE")}</p>
      <h2>
        {mode === "register"
          ? t("Your next run starts here.")
          : t("Good to see you again.")}
      </h2>
      <p className="muted">
        {joining
          ? t("Create an account or sign in to save your spot on this run.")
          : t(
              "A simple account. A little accountability. A lot of good company.",
            )}
      </p>
      <form onSubmit={submit}>
        {mode === "register" && (
          <label>
            {t("Your name")}
            <input
              name="name"
              autoComplete="name"
              placeholder={t("What should we call you?")}
              maxLength={80}
              required
              autoFocus
            />
          </label>
        )}
        <label>
          {t("Email address")}
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            maxLength={254}
            required
            autoFocus={mode === "login"}
          />
        </label>
        <label>
          {t("Password")}
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            placeholder={t("At least 8 characters")}
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy
            ? t("One moment…")
            : mode === "register"
              ? t("Create account")
              : t("Sign in")}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">
        {mode === "register"
          ? t("Already part of the club?")
          : t("New around here?")}{" "}
        <button
          disabled={busy}
          onClick={() => {
            setMode(mode === "register" ? "login" : "register");
            setError("");
          }}
        >
          {mode === "register" ? t("Sign in") : t("Create an account")}
        </button>
      </p>
    </Modal>
  );
}

function WorkoutCard({ workout, onDetails, onJoin, busy }) {
  const { t, language } = useTranslation();
  const format = (date, options) => formatDate(date, options, language);
  const [mapOpen, setMapOpen] = useState(false);
  const past = new Date(workout.starts_at) <= new Date();
  const kindClass = workout.kind.toLowerCase().replaceAll(" ", "-");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(workout.location)}`;
  const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(workout.location)}&output=embed`;
  return (
    <article className={`workout-card ${kindClass} ${past ? "past" : ""}`}>
      <div className="card-top">
        <span className={`kind-tag ${kindClass}`}>
          <span />
          {t(workout.kind)}
        </span>
        <span className="card-day">
          {format(workout.starts_at, { weekday: "short", day: "numeric" })}
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
      <button
        className="location"
        type="button"
        aria-expanded={mapOpen}
        aria-controls={`map-${workout.id}`}
        onClick={() => setMapOpen((open) => !open)}
      >
        <MapPin size={16} />
        <span>{workout.location}</span>
        {mapOpen ? <ChevronLeft size={14} className="map-chevron open" /> : <MapPin size={13} />}
      </button>
      {mapOpen && (
        <div className="card-map" id={`map-${workout.id}`}>
          <iframe
            title={`${t("Map for")} ${workout.location}`}
            src={embedUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <a href={mapUrl} target="_blank" rel="noreferrer" className="map-external">
            {t("Open in Google Maps")} <ArrowUpRight size={13} />
          </a>
        </div>
      )}
      <p className="card-notes">
        {workout.notes || t("Meet the crew, lace up, and enjoy the run.")}
      </p>
      <div className="card-footer">
        <span className="attendees">
          <Users size={16} />
          {workout.attendees
            ? t("{count} going", { count: workout.attendees })
            : t("Be the first")}
        </span>
        <button
          className={`join-button ${workout.joined ? "joined" : ""}`}
          disabled={busy || (past && !workout.joined)}
          onClick={() => onJoin(workout)}
        >
          {busy ? (
            t("Saving…")
          ) : workout.joined ? (
            <>
              <Check size={15} />
              {t("Going")}
            </>
          ) : past ? (
            t("Finished")
          ) : (
            <>
              {t("Join run")}
              <Plus size={15} />
            </>
          )}
        </button>
      </div>
      {workout.joined && (
        <span className="sr-only">{t("Click Going to leave this run.")}</span>
      )}
    </article>
  );
}

const glossary = [
  [
    "Easy run",
    "Your everyday, feel-good run. Keep the effort relaxed enough to hold a conversation.",
  ],
  [
    "Intervals",
    "Shorter bursts of faster running with easy jogging or rest in between. Everyone works at their own effort.",
  ],
  [
    "Tempo",
    "A steady, comfortably hard effort. You can say a few words, but probably won’t be telling a long story.",
  ],
  [
    "Long run",
    "More time on your feet at a relaxed pace. It’s about building endurance, not chasing speed.",
  ],
  [
    "Recovery",
    "A very gentle run to keep the legs moving between harder sessions. Slow is the whole point.",
  ],
  [
    "Pace",
    "The time it takes to cover one kilometre. A 6:00 /km pace means six minutes per kilometre.",
  ],
];

function ClubApp({ setLanguage }) {
  const { t, language } = useTranslation();
  const format = (date, options) => formatDate(date, options, language);
  const [user, setUser] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [week, setWeek] = useState(() => mondayFor(new Date()));
  const [filter, setFilter] = useState("All runs");
  const [mine, setMine] = useState(false);
  const [auth, setAuth] = useState(null);
  const [pendingJoin, setPendingJoin] = useState(null);
  const [details, setDetails] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [account, runs] = await Promise.all([api("/me"), api("/workouts")]);
      setUser(account.user);
      setWorkouts(runs.workouts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function toggleJoin(workout, signedIn = user) {
    if (!signedIn) {
      setPendingJoin(workout);
      setDetails(null);
      setAuth("register");
      return;
    }
    setBusyId(workout.id);
    setError("");
    try {
      await api(
        `/workouts/${workout.id}/attendance`,
        workout.joined ? "DELETE" : "POST",
        {},
      );
      setWorkouts((current) =>
        current.map((w) =>
          w.id === workout.id
            ? {
                ...w,
                joined: !workout.joined,
                attendees: w.attendees + (workout.joined ? -1 : 1),
              }
            : w,
        ),
      );
      setToast(
        workout.joined
          ? t("You’ve left this run. See you on the next one.")
          : t("You’re on the list. See you at the start!"),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }
  async function authenticated(account) {
    setUser(account);
    setAuth(null);
    const pending = pendingJoin;
    setPendingJoin(null);
    try {
      const result = await api("/workouts");
      setWorkouts(result.workouts);
      if (pending) {
        const workout = result.workouts.find((w) => w.id === pending.id);
        if (workout && !workout.joined) await toggleJoin(workout, account);
      } else
        setToast(t("Welcome, {name}!", { name: account.name.split(" ")[0] }));
    } catch (err) {
      setError(err.message);
    }
  }
  async function logout() {
    try {
      await api("/logout", "POST", {});
      setUser(null);
      setMine(false);
      setWorkouts((current) => current.map((w) => ({ ...w, joined: false })));
      setToast("You’re signed out. See you soon.");
    } catch (err) {
      setError(err.message);
    }
  }
  const end = addDays(week, 6);
  const localized = workouts.map((w) => localizedWorkout(w, language));
  const visible = localized.filter(
    (w) =>
      dateKey(w.starts_at) >= dateKey(week) &&
      dateKey(w.starts_at) <= dateKey(end) &&
      (filter === "All runs" || w.kind === filter) &&
      (!mine || w.joined),
  );
  const selectedWorkout = details && localized.find((w) => w.id === details.id);
  const nextRun = workouts.find((w) => new Date(w.starts_at) > new Date());
  const isThisWeek = dateKey(week) === dateKey(mondayFor(new Date()));

  return (
    <>
      <header className="header">
        <a
          className="brand"
          href="#"
          aria-label={
            language === "da"
              ? "Thor’s Running Club forside"
              : "Thor’s Running Club home"
          }
        >
          <span className="brand-icon">
            <Footprints size={25} strokeWidth={2} />
          </span>
          <span>
            THOR’S<span className="brand-sub">RUNNING CLUB</span>
          </span>
        </a>
        <button
          className="icon-button mobile-menu"
          onClick={() => setMobileNav(!mobileNav)}
          aria-label={t("Toggle navigation")}
          aria-expanded={mobileNav}
        >
          {mobileNav ? <X /> : <Menu />}
        </button>
        <nav
          className={mobileNav ? "open" : ""}
          aria-label={t("Main navigation")}
        >
          <a href="#workouts" onClick={() => setMobileNav(false)}>
            {t("Calendar")}
          </a>
          <a href="#glossary" onClick={() => setMobileNav(false)}>
            {t("Glossary")}
          </a>
        </nav>
        <div className="account">
          <div
            className="language-switch"
            role="group"
            aria-label={language === "da" ? "Sprog" : "Language"}
          >
            {["da", "en"].map((code) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                aria-pressed={language === code}
                lang={code}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          {user ? (
            <>
              <span className="user-name">
                {t("Hey, {name}", { name: user.name.split(" ")[0] })}
              </span>
              <button className="text-button" onClick={logout}>
                {t("Sign out")}
              </button>
            </>
          ) : (
            <>
              <button className="text-button" onClick={() => setAuth("login")}>
                {t("Sign in")}
              </button>
              <button
                className="button primary header-join"
                onClick={() => setAuth("register")}
              >
                {t("Join the club")}
                <ArrowUpRight size={16} />
              </button>
            </>
          )}
        </div>
      </header>
      <main>
        <section id="workouts" className="workouts-section" aria-labelledby="calendar-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("Calendar")}</p>
              <h1 id="calendar-title">{t("The week ahead")}</h1>
              <p className="muted">
                {t("Pick your session. We’ll see you at the starting point.")}
              </p>
            </div>
            <button
              className={`my-runs ${mine ? "selected" : ""}`}
              onClick={() => {
                if (!user) {
                  setAuth("login");
                  return;
                }
                setMine(!mine);
              }}
              aria-pressed={mine}
            >
              <CalendarDays size={17} />
              {mine ? t("Showing my runs") : t("My runs")}
              {user && <span>{workouts.filter((w) => w.joined).length}</span>}
            </button>
          </div>
          <div className="calendar-toolbar">
            <div className="week-switcher">
              <div className="arrows">
                <button
                  className="icon-button"
                  onClick={() => setWeek(addDays(week, -7))}
                  aria-label={t("Previous week")}
                >
                  <ChevronLeft size={19} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setWeek(addDays(week, 7))}
                  aria-label={t("Next week")}
                >
                  <ChevronRight size={19} />
                </button>
              </div>
              <strong>
                {format(week, { day: "numeric", month: "short" })} –{" "}
                {format(end, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </strong>
              <button
                className="today-button"
                onClick={() => setWeek(mondayFor(new Date()))}
              >
                {isThisWeek ? t("This week") : t("Today")}
              </button>
            </div>
            <span className="timezone">{t("All times Copenhagen")}</span>
          </div>
          <div className="filter-row">
            <div className="filters" aria-label={t("Filter runs by type")}>
              {KINDS.map((kind) => (
                <button
                  key={kind}
                  className={kind === filter ? "active" : ""}
                  onClick={() => setFilter(kind)}
                  aria-pressed={kind === filter}
                >
                  {t(kind)}
                </button>
              ))}
            </div>
            <span className="result-count">
              {visible.length} {visible.length === 1 ? t("run") : t("runs")}
            </span>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <span>{t(error)}</span>
              <button onClick={load}>{t("Try again")}</button>
            </div>
          )}
          {loading ? (
            <div className="loading-state" role="status">
              <span className="spinner" />
              {t("Finding your next run…")}
            </div>
          ) : visible.length ? (
            <div className="workout-grid">
              {visible.map((workout) => (
                <WorkoutCard
                  key={workout.id}
                  workout={workout}
                  onDetails={setDetails}
                  onJoin={toggleJoin}
                  busy={busyId === workout.id}
                />
              ))}

            </div>
          ) : (
            !error && (
              <div className="empty-state">
                <CalendarDays size={32} />
                <h3>
                  {mine
                    ? t("Your week is wide open.")
                    : t("A little breathing room.")}
                </h3>
                <p>
                  {mine
                    ? t("Join a run to add it to your week.")
                    : t(
                        "No runs match this view. Try another week or run type.",
                      )}
                </p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setFilter("All runs");
                    setMine(false);
                    setWeek(
                      nextRun
                        ? mondayFor(new Date(nextRun.starts_at))
                        : mondayFor(new Date()),
                    );
                  }}
                >
                  {t("Find upcoming runs")}
                  <ArrowRight size={16} />
                </button>
              </div>
            )
          )}
          <div className="calendar-footnote">
            <span>
              <span className="small-dot" />
              {t(
                "Plans change. You can join or leave a run anytime before it starts.",
              )}
            </span>
            {workouts.some((w) => w.external_id?.startsWith("demo-")) && (
              <span className="demo-label">{t("Sample schedule")}</span>
            )}
          </div>
        </section>

        <section id="glossary" className="glossary-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("Glossary")}</p>
              <h2>{t("What’s in a run?")}</h2>
              <p className="muted">
                {t("No need to know the jargon. We’ve got you.")}
              </p>
            </div>
          </div>
          <div className="glossary-grid">
            {glossary.map(([title, description], i) => (
              <details key={title}>
                <summary>
                  <span className="glossary-number">0{i + 1}</span>
                  {t(title)}
                  <Plus size={18} />
                </summary>
                <p>{t(description)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer>
        <a className="footer-brand" href="#">
          <Footprints size={21} />
          THOR’S RUNNING CLUB
        </a>
        <p>{t("A good reason to get outside.")}</p>
        <span>
          {t("Made for the miles we share. ©")} {new Date().getFullYear()}
        </span>
      </footer>
      {auth && (
        <AuthModal
          mode={auth}
          setMode={setAuth}
          onClose={() => {
            setAuth(null);
            setPendingJoin(null);
          }}
          onSuccess={authenticated}
          joining={!!pendingJoin}
        />
      )}
      {selectedWorkout && (
        <Modal onClose={() => setDetails(null)} label={selectedWorkout.title}>
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
                busyId === selectedWorkout.id ||
                (!selectedWorkout.joined &&
                  new Date(selectedWorkout.starts_at) <= new Date())
              }
              onClick={() => toggleJoin(selectedWorkout)}
            >
              {busyId === selectedWorkout.id
                ? t("Saving…")
                : selectedWorkout.joined
                  ? t("Leave this run")
                  : new Date(selectedWorkout.starts_at) <= new Date()
                    ? t("Run finished")
                    : t("Join this run")}
              <ArrowRight size={17} />
            </button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {t(error)}
            </p>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {t(toast)}
          <button
            onClick={() => setToast("")}
            aria-label={t("Dismiss notification")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("trc-language", language);
    } catch {
      /* Optional persistence. */
    }
  }, [language]);
  return (
    <LanguageContext.Provider value={language}>
      <ClubApp setLanguage={setLanguage} />
    </LanguageContext.Provider>
  );
}
