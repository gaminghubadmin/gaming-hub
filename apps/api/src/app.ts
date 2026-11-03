import { PostgresRateLimitStore } from "./services/sharedRateLimit";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { AppError } from "@gaming-hub/shared";
import { env } from "./env";
import { registerErrorHandler } from "./plugins/errors";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { roomInvitationsRoutes } from "./routes/roomInvitations";
import { friendsRoutes } from "./routes/friends";
import { roomsRoutes } from "./routes/rooms";
import { matchesRoutes } from "./routes/matches";
import { leaderboardRoutes } from "./routes/leaderboard";
import { walletRoutes } from "./routes/wallet";
import { notificationsRoutes } from "./routes/notifications";
import { achievementsRoutes } from "./routes/achievements";
import { adminRoutes } from "./routes/admin";
import { settingsRoutes } from "./routes/settings";
import { internalRoutes } from "./routes/internal";
import { accountRoutes } from "./routes/account";
import { metricsRoutes } from "./routes/metrics";
import { referralsRoutes } from "./routes/referrals";
import { couponsRoutes } from "./routes/coupons";
import { announcementsRoutes } from "./routes/announcements";
import { tournamentsRoutes } from "./routes/tournaments";
import { ticketsRoutes } from "./routes/tickets";
import { messagesRoutes } from "./routes/messages";
import { searchRoutes } from "./routes/search";
import { adminEnterpriseRoutes } from "./routes/adminEnterprise";
import { supportRoutes } from "./routes/support";
import { securityRoutes } from "./routes/security";
import { kycRoutes } from "./routes/kyc";
import { adminKycRoutes } from "./routes/adminKyc";
import { adminRolesRoutes } from "./routes/adminRoles";
import { featureFlagsRoutes } from "./routes/featureFlags";
import { gamesRoutes } from "./routes/games";
import { adminGamesRoutes } from "./routes/adminGames";
import { adminAntiCheatRoutes } from "./routes/adminAntiCheat";
import { matchmakingRoutes } from "./routes/matchmaking";
import { adminTournamentTiersRoutes } from "./routes/adminTournamentTiers";
import { appVersionRoutes } from "./routes/appVersion";
import { adminAppVersionRoutes } from "./routes/adminAppVersion";
import { privacyRoutes } from "./routes/privacy";
import { adminTournamentsRoutes } from "./routes/adminTournaments";
import { seasonsRoutes } from "./routes/seasons";
import { isFeatureEnabled } from "./services/featureFlags";
import { instrument } from "./services/metrics";
import proxyAddr from "@fastify/proxy-addr";

export function buildApp() {
  // Hop count alone cannot identify a trusted immediate peer. Default to no trust.
  const proxies = env.TRUST_PROXY_CIDRS.split(",").map(value => value.trim()).filter(Boolean);
  const trustedAddress = proxies.length ? proxyAddr.compile(proxies) : null;
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { colorize: true } } }
        : {}),
    },
    trustProxy: trustedAddress && env.TRUST_PROXY_HOPS > 0
      ? (address, hop) => hop < env.TRUST_PROXY_HOPS && trustedAddress(address, hop)
      : false,
    // Reject oversized JSON payloads (defense against body abuse). The API has
    // no file-upload surface yet; raise via env.BODY_LIMIT when one is added.
    bodyLimit: env.BODY_LIMIT,
    // Cap route parameter length to prevent pathological URLs/ReDoS.
    routerOptions: {
      maxParamLength: 100,
    },
  });

  // Security headers. This service returns JSON only, so a fully locked-down
  // CSP is safe and cannot interfere with the SPA (which is served elsewhere).
  void app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  });

  const getAllowedCorsOrigin = () => {
    if (env.NODE_ENV === "production") {
      return env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
    }
    const configured = env.CORS_ORIGIN === "*" ? [] : env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
    return (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (env.CORS_ORIGIN === "*" || configured.includes(origin)) {
        cb(null, true);
        return;
      }
      try {
        const { hostname } = new URL(origin);
        const isLocalOrLan =
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname.startsWith("192.168.") ||
          hostname.startsWith("10.") ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
          hostname.endsWith(".local");
        cb(null, isLocalOrLan);
      } catch {
        cb(null, false);
      }
    };
  };

  void app.register(cors, {
    origin: getAllowedCorsOrigin(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Internal service credentials must never be allowed in browser requests.
    // Server-to-server requests do not use CORS preflights.
    allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With", "X-App-Version", "X-App-Platform"],
  });

  void app.register(rateLimit, {
    ...(env.NODE_ENV === "production" ? { store: PostgresRateLimitStore } : {}),
    skipOnError: false,
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    allowList: (req) => req.url.startsWith("/health"),
    // The plugin throws whatever this builder returns, so return an AppError
    // for our error handler to translate into a proper 429 response.
    errorResponseBuilder: (_req, context) =>
      new AppError(
        "RATE_LIMITED",
        `Rate limit exceeded, retry in ${context.after}`,
        429,
      ),
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    return payload;
  });

  registerErrorHandler(app);

  // Global maintenance gate. When `infra.maintenance` is enabled the platform
  // is read-only for everyone except health checks, the public flag snapshot,
  // authentication, and the admin panel (so admins can switch it back off).
  app.addHook("onRequest", async (request) => {
    const { url } = request;
    if (
      url === "/health" ||
      url.startsWith("/health/") ||
      url === "/api/health" ||
      url.startsWith("/api/health/") ||
      url === "/api/features/flags" ||
      url.startsWith("/api/auth/") ||
      url.startsWith("/api/admin/") ||
      // Version config must always be readable (even under maintenance) so the
      // Android gate can evaluate before the user does anything.
      url === "/api/app/version-config"
    ) {
      return;
    }
    if (await isFeatureEnabled("infra.maintenance")) {
      throw new AppError(
        "MAINTENANCE",
        "The platform is currently undergoing scheduled maintenance. Please check back shortly.",
        503,
      );
    }
  });

  instrument(app);

  void app.register(healthRoutes);
  void app.register(authRoutes);
  void app.register(usersRoutes);
  void app.register(friendsRoutes);
  void app.register(roomInvitationsRoutes);
  void app.register(roomsRoutes);
  void app.register(matchesRoutes);
  void app.register(leaderboardRoutes);
  void app.register(walletRoutes);
  void app.register(notificationsRoutes);
  void app.register(achievementsRoutes);
  void app.register(adminRoutes);
  void app.register(settingsRoutes);
  void app.register(internalRoutes);
  void app.register(accountRoutes);
  void app.register(metricsRoutes);
  void app.register(referralsRoutes);
  void app.register(couponsRoutes);
  void app.register(announcementsRoutes);
  void app.register(tournamentsRoutes);
  void app.register(ticketsRoutes);
  void app.register(messagesRoutes);
  void app.register(searchRoutes);
  void app.register(adminEnterpriseRoutes);
  void app.register(supportRoutes);
  void app.register(securityRoutes);
  void app.register(kycRoutes);
  void app.register(adminKycRoutes);
  void app.register(adminRolesRoutes);
  void app.register(featureFlagsRoutes);
  void app.register(gamesRoutes);
  void app.register(adminGamesRoutes);
  void app.register(adminAntiCheatRoutes);
  void app.register(matchmakingRoutes);
  void app.register(adminTournamentTiersRoutes);
  void app.register(appVersionRoutes);
  void app.register(adminAppVersionRoutes);
  void app.register(privacyRoutes);
  void app.register(adminTournamentsRoutes);
  void app.register(seasonsRoutes);

  return app;
}
