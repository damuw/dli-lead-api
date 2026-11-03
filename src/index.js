import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Coolify/Traefik adds one proxy hop
app.use(express.json({ limit: "64kb" }));

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://deeplearningintelligence.com,https://www.deeplearningintelligence.com").split(",").map((value) => value.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS.includes(origin)),
}));

const PORT = Number(process.env.PORT || 3000) || 3000;
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587) || 587;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || "Deep Learning Intelligence <no-reply@deeplearningintelligence.com>";
const SMTP_TLS_SERVERNAME = process.env.SMTP_TLS_SERVERNAME || (SMTP_HOST && !/^[0-9.]+$/.test(SMTP_HOST) ? SMTP_HOST : "");
const SMTP_TLS_REJECT_UNAUTHORIZED = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false";
const LEAD_TO = process.env.LEAD_TO || "damu@DeepLearningIntelligence.com";
const RESOURCE_DIR = path.resolve(process.cwd(), "resources");

const RESOURCE_FILES = {
  "the-power-of-innovation-in-recession": "The-Power-of-Innovation-in-Recession.pdf",
  "jobs-of-the-future": "Jobs-of-the-Future.pdf",
};

if (!SMTP_HOST) {
  console.warn("SMTP_HOST is not set — lead emails will fail until the mail environment variables are configured.");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  tls: {
    servername: SMTP_TLS_SERVERNAME || undefined,
    rejectUnauthorized: SMTP_TLS_REJECT_UNAUTHORIZED,
  },
});

const DIAG_KEY = process.env.DIAG_KEY || "";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_HITS = 20;
const rateBuckets = new Map();

const pruneBuckets = () => {
  const now = Date.now();
  for (const [key, hits] of rateBuckets) {
    const recent = hits.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, recent);
  }
  if (rateBuckets.size > 10000) rateBuckets.clear();
};
setInterval(pruneBuckets, 60 * 1000).unref();

const isRateLimited = (key) => {
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_HITS) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
};

const authorizedOrigin = (req) => {
  const origin = req.get("origin");
  return !origin || ALLOWED_ORIGINS.includes(origin);
};

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const validEmail = (value) => typeof value === "string" && value.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mail: { configured: !!(SMTP_HOST && SMTP_USER && SMTP_PASS), port: SMTP_PORT } });
});

// Protected SMTP diagnostic: /api/mail-check?key=... runs a real verify().
app.get("/api/mail-check", async (req, res) => {
  if (!DIAG_KEY || req.query.key !== DIAG_KEY) return res.status(404).json({ ok: false });
  const started = Date.now();
  try {
    await transporter.verify();
    return res.json({ ok: true, ms: Date.now() - started, host: SMTP_HOST, port: SMTP_PORT });
  } catch (error) {
    const code = error && (error.code || error.responseCode || error.command) || "unknown";
    return res.status(502).json({ ok: false, ms: Date.now() - started, host: SMTP_HOST, port: SMTP_PORT, code: String(code), message: String(error && error.message || error).slice(0, 200) });
  }
});

const handleLead = async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== "object") return res.status(400).json({ ok: false, error: "invalid_body" });

  // Honeypot — silently accept so bots cannot probe the guard.
  if (payload.hp || payload.honeypot || payload.company) return res.status(200).json({ ok: true });

  if (!authorizedOrigin(req)) return res.status(403).json({ ok: false, error: "origin_not_allowed" });
  if (!validEmail(payload.email)) return res.status(400).json({ ok: false, error: "invalid_email" });

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) return res.status(429).json({ ok: false, error: "rate_limited" });

  const name = text(payload.name, 120);
  const email = text(payload.email, 254);
  const organization = text(payload.organization, 160);
  const market = text(payload.market, 80);
  const need = text(payload.need, 120);
  const timeline = text(payload.timeline, 60);
  const problem = text(payload.problem, 5000);
  const resourceSlug = typeof payload.resource === "string" && Object.hasOwn(RESOURCE_FILES, payload.resource) ? payload.resource : "";
  const attachmentName = resourceSlug ? RESOURCE_FILES[resourceSlug] : "";

  let attachmentPath = "";
  if (attachmentName) {
    const resolved = path.resolve(RESOURCE_DIR, attachmentName);
    if (resolved === RESOURCE_DIR || !resolved.startsWith(RESOURCE_DIR + path.sep)) {
      return res.status(400).json({ ok: false, error: "invalid_resource" });
    }
    attachmentPath = fs.existsSync(resolved) ? resolved : "";
    if (!attachmentPath) {
      console.error(`Requested resource is missing on disk: ${attachmentName}`);
      return res.status(422).json({ ok: false, error: "resource_unavailable" });
    }
  }

  const leadText = [
    "DLI — NEW LEAD",
    "Intelligence. Deployed.",
    "",
    `Name: ${name || "Not provided"}`,
    `Work email: ${email}`,
    `Organization: ${organization || "Not provided"}`,
    `Market: ${market || "Not specified"}`,
    `What do you need?: ${need || "Not specified"}`,
    `Timeline: ${timeline || "Not specified"}`,
    `Resource requested: ${resourceSlug || "None"}`,
    "",
    "PROBLEM TO SOLVE",
    problem || "Not provided",
  ].join("\n");

  const subject = resourceSlug ? `DLI resource request: ${attachmentName}` : "New DLI deployment lead";

  await transporter.sendMail({
    from: MAIL_FROM,
    to: LEAD_TO,
    replyTo: email,
    subject,
    text: leadText,
    html: `<p>A new DLI lead was captured on the website.</p><pre style="white-space:pre-wrap">${escapeHtml(leadText)}</pre>`,
    attachments: attachmentPath ? [{ filename: attachmentName, path: attachmentPath }] : [],
  });

  // Deliver the requested briefing to the visitor as well.
  if (attachmentPath) {
    await transporter.sendMail({
      from: MAIL_FROM,
      to: email,
      replyTo: LEAD_TO,
      subject: `Your DLI briefing: ${attachmentName.replace(/\.pdf$/i, "").replace(/-/g, " ")}`,
      text: [
        "Hello,",
        "",
        "Thank you for your interest in Deep Learning Intelligence. The briefing you requested is attached.",
        "",
        "If you would like to discuss how this applies to your organization, reply to this email and a senior engineer will follow up.",
        "",
        "— Deep Learning Intelligence",
        "Intelligence. Deployed.",
      ].join("\n"),
      attachments: [{ filename: attachmentName, path: attachmentPath }],
    });
  }

  return res.json({ ok: true });
};

app.post("/api/leads", (req, res, next) => {
  handleLead(req, res).catch(next);
});

app.use((error, _req, res, _next) => {
  console.error("Lead API error:", error);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: "server_error" });
});

app.listen(PORT, () => {
  console.log(`DLI lead API listening on :${PORT}`);
});
