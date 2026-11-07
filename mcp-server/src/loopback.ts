import type { Express } from "express";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * This server can change a player's city, so over HTTP it only answers the
 * local machine. Skybridge listens on all interfaces, so we reject anything
 * that isn't loopback, and browser requests carrying an Origin header
 * (DNS-rebinding protection), the same policy as the bridge itself.
 */
export function restrictToLoopback(express: Express) {
  express.use((req, res, next) => {
    if (process.env.GOVSKYLINES_ALLOW_REMOTE === "true") return next();
    const remote = req.socket.remoteAddress ?? "";
    if (!LOOPBACK.has(remote)) {
      res.status(403).json({ error: "GovSkylines only accepts connections from this machine." });
      return;
    }
    if (req.headers.origin && process.env.NODE_ENV === "production") {
      res.status(403).json({ error: "Cross-origin requests are not allowed." });
      return;
    }
    next();
  });
}
