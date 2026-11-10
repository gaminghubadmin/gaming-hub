import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getApiUrl } from "./client";
import { getSocketUrl } from "../socket/socketUrl";

vi.mock("../native/platform", () => ({
  isNativePlatform: vi.fn(() => false),
  getPlatform: vi.fn(() => "web"),
}));

describe("getApiUrl and getSocketUrl routing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns '/api' for web browser when VITE_API_URL is unset", () => {
    vi.stubEnv("VITE_API_URL", "");
    expect(getApiUrl()).toBe("/api");
  });

  it("returns '/api' for web browser when VITE_API_URL points to localhost in dev", () => {
    vi.stubEnv("VITE_API_URL", "http://localhost:4000/api");
    expect(getApiUrl()).toBe("/api");
  });

  it("returns '/api' for web browser on mobile LAN IP", () => {
    vi.stubGlobal("window", {
      location: { hostname: "192.168.50.235", origin: "http://192.168.50.235:5173" },
    });
    vi.stubEnv("VITE_API_URL", "http://localhost:4000/api");
    expect(getApiUrl()).toBe("/api");
  });

  it("preserves external production API URL", () => {
    vi.stubEnv("VITE_API_URL", "https://api.gaminghub.com/api");
    expect(getApiUrl()).toBe("https://api.gaminghub.com/api");
  });

  it("returns window.location.origin for getSocketUrl in browser when VITE_SOCKET_URL is unset or localhost", () => {
    vi.stubGlobal("window", {
      location: { hostname: "192.168.50.235", origin: "http://192.168.50.235:5173" },
    });
    vi.stubEnv("VITE_SOCKET_URL", "http://localhost:4001");
    expect(getSocketUrl()).toBe("http://192.168.50.235:5173");
  });

  it("preserves external production Socket.IO URL", () => {
    vi.stubEnv("VITE_SOCKET_URL", "https://socket.gaminghub.com");
    expect(getSocketUrl()).toBe("https://socket.gaminghub.com");
  });

  it("returns production fallback URLs on native platform when env vars are unset", async () => {
    const { isNativePlatform } = await import("../native/platform");
    vi.mocked(isNativePlatform).mockReturnValue(true);
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_SOCKET_URL", "");
    expect(getApiUrl()).toBe("https://gaming-hub-clms.onrender.com/api");
    expect(getSocketUrl()).toBe("https://gaming-hub-socket-4ovb.onrender.com");
  });
});
