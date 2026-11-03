import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

const PORT = Number(process.env.PORT || 3000);
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || "Deep Learning Intelligence <no-reply@deeplearningintelligence.com>";
const LEAD_TO = process.env.LEAD_TO || "damu@DeepLearningIntelligence.com";

const resourceFiles = {
  "the-power-of-innovation-in-recession": "The-Power-of-Innovation-in-Recession.pdf",
  "jobs-of-the-future": "Jobs-of-the-Future.pdf",
};

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

const rateBuckets = new Map<string, number[]>();

const isRateLimited = (key: string) => {
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (hits.length >= 5) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/leads", async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== "object") return res.status(400).json({ ok: false });
  if (payload.company || payload.honeypot) return res.status(200).json({ ok: true }); // silently drop bots
  if (!payload.email || typeof payload.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
    return res.status(400).json({ ok: false, error: "invalid_email" });
  }
  const ip = req.ip || req.socket?.remoteAddress || "unknown";  if (isRateLimited(ip)) return res.status(429).json({ ok: false });

  const { name, organization, market, need, timeline, problem, resource, email } = payload;
  const resourceSlug = typeof resource === "string" ? resource : "";
  const attachment = resourceSlug ? resourceFiles[resourceSlug] : null;
  const filePath = attachment ? path.join(process.cwd(), "resources", attachment) : null;

  const subject = resourceSlug
    ? `DLI resource request: ${resourceFiles[resourceSlug]}`
    : "New DLI deployment lead";

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
    "",
    "PROBLEM TO SOLVE",
    problem || "Not provided",
  ].join("\n");

  try {
    const mailOptions = {
      from: MAIL_FROM,
      to: LEAD_TO,
      subject,
      text: leadText,
      html: `<p>A new DLI lead was captured on the website.</p><pre style="white-space:pre-wrap">${leadText.replace(/</g, "&lt;")}</pre>`,
      attachments: attachment && filePath && fs.existsSync(filePath)
        ? [{ filename: attachment, path: filePath }]
        : [],
    };
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Lead email send failed:", error);
    return res.status(500).json({ ok: false });
  }

  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`DLI lead API listening on :${PORT}`);
});
