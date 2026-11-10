import { isNativePlatform } from "../native/platform";

/**
 * Computes the Socket.IO server URL.
 * - In Capacitor native shells (Android/iOS): returns VITE_SOCKET_URL (fallback: "http://localhost:4001").
 * - In web browsers: if an external absolute URL is explicitly configured (not localhost/127.0.0.1), returns it;
 *   otherwise returns the current window origin (e.g. "http://192.168.50.235:5173" or "http://localhost:5173")
 *   so connections use the same-origin /socket.io route (forwarded via Vite proxy in dev or reverse proxy in prod).
 */
export function getSocketUrl(): string {
  if (isNativePlatform()) {
    return (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim() || "https://gaming-hub-socket-4ovb.onrender.com";
  }
  const envUrl = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim();
  if (envUrl && /^https?:\/\//i.test(envUrl) && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/\/$/, "");
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}
