"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Check, Footprints, MessageCircle, Route, Trophy } from "lucide-react";
import Providers from "../providers";
import { api } from "../../src/backend.js";
import { LanguageContext, initialLanguage, useTranslation } from "../../src/i18n.js";

function ProfileContent() {
  const { t, language } = useTranslation();
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => api("/profile"), staleTime: 30_000 });
  const profile = profileQuery.data;
  const formatDate = (value) => new Intl.DateTimeFormat(language === "da" ? "da-DK" : "en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Copenhagen" }).format(new Date(value));
  return <main className="profile-page">
    <header className="profile-header">
      <Link className="brand" href="/"><span className="brand-icon"><Footprints size={25} strokeWidth={2} /></span><span>THOR’S<span className="brand-sub">RUNNING CLUB</span></span></Link>
      <nav><Link href="/">{t("Calendar")}</Link><Link href="/#glossary">{t("Glossary")}</Link></nav>
      <div className="language-switch" role="group" aria-label={language === "da" ? "Sprog" : "Language"}><LanguageButtons /></div>
    </header>
    <section className="profile-section">
      <Link className="back-link" href="/"><ArrowLeft size={15} />{t("Back to calendar")}</Link>
      {profileQuery.isLoading && <div className="loading-state" role="status"><span className="spinner" />{t("Loading profile…")}</div>}
      {profileQuery.error && <div className="empty-state"><h1>{t("Sign in to view your profile")}</h1><p>{t("Your completed workouts and club activity will appear here.")}</p><Link className="button primary" href="/">{t("Go to sign in")}<ArrowLeft size={16} /></Link></div>}
      {profile && <>
        <div className="profile-heading"><div><p className="eyebrow">{t("Your club profile")}</p><h1>{profile.user.alias || profile.user.name}</h1><p className="muted">{profile.user.email}</p></div><span className="profile-mark"><Footprints size={28} /></span></div>
        <div className="profile-stats">
          <div><Check size={18} /><strong>{profile.stats.completed}</strong><span>{t("Completed")}</span></div>
          <div><CalendarDays size={18} /><strong>{profile.stats.upcoming}</strong><span>{t("Upcoming")}</span></div>
          <div><Route size={18} /><strong>{new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(profile.stats.distance)} km</strong><span>{t("Completed distance")}</span></div>
          <div><MessageCircle size={18} /><strong>{profile.stats.comments}</strong><span>{t("Comments")}</span></div>
        </div>
        <WorkoutHistory title={t("Completed workouts")} empty={t("No completed workouts yet. Join a run to start your history.")} workouts={profile.completed} formatDate={formatDate} completed t={t} />
        <WorkoutHistory title={t("Upcoming joined workouts")} empty={t("You have no upcoming runs yet.")} workouts={profile.upcoming} formatDate={formatDate} t={t} />
      </>}
    </section>
  </main>;
}

function LanguageButtons() {
  const { language } = useTranslation();
  return <>{["da", "en"].map((code) => <button key={code} aria-pressed={language === code} lang={code}>{code.toUpperCase()}</button>)}</>;
}

function WorkoutHistory({ title, empty, workouts, formatDate, completed, t }) {
  return <section className="history-section"><div className="section-heading"><div><p className="eyebrow">{completed ? t("Your history") : t("On the calendar")}</p><h2>{title}</h2></div><span className="result-count">{workouts.length}</span></div>{workouts.length ? <div className="history-list">{workouts.map((workout) => <article className="history-item" key={workout.id}><div><span className={`kind-tag ${workout.kind.toLowerCase().replaceAll(" ", "-")}`}><span />{t(workout.kind)}</span><h3>{workout.title}</h3><p>{formatDate(workout.starts_at)} · {workout.distance_km} km · {workout.location}</p></div>{completed && <Trophy size={18} />}</article>)}</div> : <p className="history-empty">{empty}</p>}</section>;
}

export default function ProfilePage() {
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem("trc-language", language); } catch {} }, [language]);
  return <Providers><LanguageContext.Provider value={language}><div onClick={(event) => { const target = event.target.closest(".language-switch button"); if (target) setLanguage(target.lang); }}><ProfileContent /></div></LanguageContext.Provider></Providers>;
}
