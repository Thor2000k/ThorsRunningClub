"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Check, Footprints, MessageCircle, Route } from "lucide-react";
import Providers from "../providers";
import { api } from "../../src/backend.js";
import { LanguageContext, initialLanguage, localizedWorkout, useTranslation } from "../../src/i18n.js";

import { WorkoutCard, WorkoutDetails } from "../../src/WorkoutCard.jsx";

function ProfileContent() {
  const queryClient = useQueryClient();
  const [details, setDetails] = useState(null);
  const leave = useMutation({ mutationFn: (workout) => api(`/workouts/${workout.id}/attendance`, "DELETE"), onSuccess: () => { queryClient.invalidateQueries({queryKey:["profile"]}); queryClient.invalidateQueries({queryKey:["workouts"]}); setDetails(null); } });
  const { t, language } = useTranslation();
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => api("/profile"), staleTime: 30_000 });
  const profile = profileQuery.data;
  const cardProps = { user: profile?.user, onDetails: setDetails, onJoin: (workout) => leave.mutate(workout), busyId: leave.isPending ? leave.variables?.id : null };
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
        <WorkoutHistory title={t("Completed workouts")} empty={t("No completed workouts yet. Join a run to start your history.")} workouts={profile.completed} cardProps={cardProps} language={language} completed t={t} />
        <WorkoutHistory title={t("Upcoming joined workouts")} empty={t("You have no upcoming runs yet.")} workouts={profile.upcoming} cardProps={cardProps} language={language} t={t} />
      </>}
      {details && <WorkoutDetails workout={localizedWorkout(details, language)} user={profile.user} onClose={() => setDetails(null)} onJoin={(workout) => leave.mutate(workout)} busy={leave.isPending} error={leave.error?.message} />}
      {leave.error && <p className="form-error" role="alert">{t(leave.error.message)}</p>}
    </section>
  </main>;
}

function LanguageButtons() {
  const { language } = useTranslation();
  return <>{["da", "en"].map((code) => <button key={code} aria-pressed={language === code} lang={code}>{code.toUpperCase()}</button>)}</>;
}

function WorkoutHistory({ title, empty, workouts, cardProps, language, completed, t }) {
  return <section className="history-section"><div className="section-heading"><div><p className="eyebrow">{completed ? t("Your history") : t("On the calendar")}</p><h2>{title}</h2></div><span className="result-count">{workouts.length}</span></div>{workouts.length ? <div className="workout-grid">{workouts.map((workout) => <WorkoutCard key={workout.id} workout={localizedWorkout(workout, language)} {...cardProps} busy={cardProps.busyId === workout.id} />)}</div> : <p className="history-empty">{empty}</p>}</section>;
}

export default function ProfilePage() {
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem("trc-language", language); } catch {} }, [language]);
  return <Providers><LanguageContext.Provider value={language}><div onClick={(event) => { const target = event.target.closest(".language-switch button"); if (target) setLanguage(target.lang); }}><ProfileContent /></div></LanguageContext.Provider></Providers>;
}
