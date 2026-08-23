"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api";
import AppShell from "./components/AppShell";
import { LoadingPage } from "./components/ViewShared";
import LandingPage from "./views/LandingView";
import AuthScreen from "./views/AuthView";
import DashboardPage from "./views/DashboardView";
import ActivityPage from "./views/ActivityView";
import MessageReviewPage from "./views/MessageReviewView";
import UrlReportsPage from "./views/UrlReportsView";
import EmailReportsPage from "./views/EmailReportsView";
import DevicesPage from "./views/DevicesView";
import ProfilePage from "./views/ProfileView";
import AdminDashboardPage from "./views/AdminOverviewView";
import AdminUrlReportsPage from "./views/AdminUrlReportsView";
import AdminEmailReportsPage from "./views/AdminEmailReportsView";
import TrainingDataPage from "./views/TrainingDataView";
import UsersPage from "./views/UsersView";

function Application({ user, initialPath, onUserChanged, onSignedOut }) {
    const initialPage = (initialPath.split("/")[1] || "dashboard");
    const allowed = useMemo(() => user.role === "ADMIN" ? ["dashboard", "activity", "message-review", "reports", "email-reports", "devices", "profile", "admin", "review-reports", "admin-email-reports", "training-data", "users"] : ["dashboard", "activity", "message-review", "reports", "email-reports", "devices", "profile"], [user.role]);
    const [page, setPage] = useState(allowed.includes(initialPage) ? initialPage : "dashboard");
    const navigate = (next) => { history.pushState({}, "", `/${next}`); setPage(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
    const logout = async () => {
        try {
            await api("/auth/logout", { method: "POST" });
        }
        catch (reason) {
            if (!(reason instanceof ApiError) || reason.status !== 401)
                throw reason;
        }
        history.replaceState({}, "", "/login");
        onSignedOut();
    };
    useEffect(() => { const handler = () => { const next = (window.location.pathname.split("/")[1] || "dashboard"); if (allowed.includes(next))
        setPage(next); }; window.addEventListener("popstate", handler); return () => window.removeEventListener("popstate", handler); }, [allowed]);
    return (<AppShell user={user} page={page} navigate={navigate}>
      {page === "dashboard" && <DashboardPage onViewActivity={() => navigate("activity")} onPairDevice={() => navigate("devices")}/>}
      {page === "activity" && <ActivityPage />}
      {page === "message-review" && <MessageReviewPage />}
      {page === "reports" && <UrlReportsPage />}
      {page === "email-reports" && <EmailReportsPage />}
      {page === "devices" && <DevicesPage />}
      {page === "profile" && <ProfilePage user={user} onUserChanged={onUserChanged} onSignOut={logout}/>}
      {page === "admin" && user.role === "ADMIN" && <AdminDashboardPage />}
      {page === "review-reports" && user.role === "ADMIN" && <AdminUrlReportsPage />}
      {page === "admin-email-reports" && user.role === "ADMIN" && <AdminEmailReportsPage />}
      {page === "training-data" && user.role === "ADMIN" && <TrainingDataPage />}
      {page === "users" && user.role === "ADMIN" && <UsersPage currentUser={user}/>}
    </AppShell>);
}
export function BantAIApp({ initialPath }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [startupError, setStartupError] = useState("");
    const [path, setPath] = useState(initialPath);
    const navigatePublic = (next) => {
        history.pushState({}, "", next);
        setPath(next);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const loadSession = useCallback(async () => {
        setLoading(true);
        setStartupError("");
        try {
            const result = await api("/auth/me");
            setUser(result.user);
        }
        catch (reason) {
            setUser(null);
            if (!(reason instanceof ApiError) || reason.status !== 401) {
                setStartupError(reason instanceof Error ? reason.message : "BantAI cannot reach the shared service.");
            }
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        const initial = window.setTimeout(() => void loadSession(), 0);
        return () => window.clearTimeout(initial);
    }, [loadSession]);
    useEffect(() => {
        const handler = () => setPath(window.location.pathname);
        window.addEventListener("popstate", handler);
        return () => window.removeEventListener("popstate", handler);
    }, []);
    if (path === "/")
        return <LandingPage authenticated={Boolean(user)} onNavigate={navigatePublic}/>;
    if (loading)
        return <LoadingPage />;
    if (startupError)
        return <LoadingPage error={startupError} onRetry={() => void loadSession()}/>;
    if (!user)
        return <AuthScreen initialPath={path} onAuthenticated={setUser}/>;
    return <Application user={user} initialPath={path} onUserChanged={setUser} onSignedOut={() => setUser(null)}/>;
}
