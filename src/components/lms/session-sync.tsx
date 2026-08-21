"use client";

import { useEffect } from "react";
import { useUserStore } from "@/stores/lms-store";

// ============================================
// Session Sync
//
// The store persists `isAuthenticated` / `currentUserId` in localStorage so a
// reload lands straight back on the app, but the signed cookie that actually
// authorizes API calls expires on its own schedule. Left alone the two drift:
// the UI renders a signed-in dashboard while every request comes back 401, and
// the failures surface as empty lists rather than as "you are signed out".
//
// The cookie is the authority. On mount we ask the server who it thinks we are
// and make the store agree — clearing it when there is no session, and
// adopting the server's id/role when it names a different user (the case where
// two accounts were used in one browser).
// ============================================

interface SessionUserView {
  id: string;
  name: string | null;
  email: string;
  role: "student" | "instructor";
}

export function SessionSync() {
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch("/api/auth/session", { signal: controller.signal });
        if (!res.ok) return;
        const json: unknown = await res.json();
        const user =
          json && typeof json === "object" && "data" in json
            ? (json as { data: SessionUserView | null }).data
            : null;

        // Read at callback time, not render time: this effect runs once and
        // must not close over a stale snapshot of the store.
        const state = useUserStore.getState();

        if (!user) {
          if (state.isAuthenticated) state.clearLocalSession();
          return;
        }
        const name = user.name ?? user.email;
        if (!state.isAuthenticated || state.currentUserId !== user.id) {
          state.login(user.id, user.role, name);
        } else {
          if (state.currentRole !== user.role) state.setCurrentRole(user.role);
          if (state.currentUserName !== name) state.login(user.id, user.role, name);
        }
      } catch {
        // A network failure says nothing about whether the session is valid,
        // so the local state stands until a request actually reaches the server.
      }
    })();

    return () => controller.abort();
  }, []);

  return null;
}
