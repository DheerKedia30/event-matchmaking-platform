// One small function per backend URL under /auth.
import { apiFetch } from "./client";

export const registerProfile = (profile) => apiFetch("/auth/register", { method: "POST", body: profile });
export const getMe = () => apiFetch("/auth/me");
export const verifyPhone = () => apiFetch("/auth/verify-phone", { method: "POST" });
export const updateProfile = (profile) => apiFetch("/auth/profile", { method: "PUT", body: profile });
export const callVerifiedOnly = () => apiFetch("/auth/verified-only");
