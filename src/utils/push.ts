import jwt from "jsonwebtoken";
import https from "https";
import prisma from "../db";

const APNS_KEY_ID = process.env.APNS_KEY_ID || "";
const APNS_TEAM_ID = process.env.APNS_TEAM_ID || "";
const APNS_KEY = (process.env.APNS_KEY || "").replace(/\\n/g, "\n");
const BUNDLE_ID = "com.shaan.ippo";
const APNS_HOST = process.env.NODE_ENV === "production" 
  ? "api.push.apple.com" 
  : "api.sandbox.push.apple.com";

let cachedToken: { token: string; expires: number } | null = null;

function getApnsToken(): string {
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;
  if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) {
    console.warn("APNs not configured - missing key/keyId/teamId");
    return "";
  }
  const token = jwt.sign({}, APNS_KEY, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: APNS_KEY_ID },
    issuer: APNS_TEAM_ID,
    expiresIn: "55m",
  });
  cachedToken = { token, expires: Date.now() + 50 * 60 * 1000 };
  return token;
}

async function sendPush(deviceToken: string, payload: object): Promise<void> {
  const token = getApnsToken();
  if (!token) return;

  const body = JSON.stringify(payload);
  
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: APNS_HOST,
        port: 443,
        path: `/3/device/${deviceToken}`,
        method: "POST",
        headers: {
          authorization: `bearer ${token}`,
          "apns-topic": BUNDLE_ID,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            console.error(`APNs error ${res.statusCode}: ${data}`);
          }
          resolve();
        });
      }
    );
    req.on("error", (err) => { console.error("APNs request error:", err); resolve(); });
    req.write(body);
    req.end();
  });
}

export async function notifyUser(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushEnabled: true } });
    if (!user?.pushEnabled) return;

    const tokens = await prisma.deviceToken.findMany({ where: { userId } });
    const payload = {
      aps: { alert: { title, body }, sound: "default", badge: 1 },
      ...(data || {}),
    };
    await Promise.all(tokens.map((t) => sendPush(t.token, payload)));
  } catch (err) {
    console.error("Push notification error:", err);
  }
}

export async function notifyPostOwner(postOwnerId: string, actorName: string, action: "comment" | "like", postTitle?: string): Promise<void> {
  const titleText = postTitle ? `"${postTitle}"` : "your post";
  if (action === "comment") {
    await notifyUser(postOwnerId, "New Comment", `${actorName} commented on ${titleText}`, { type: "comment" });
  } else {
    await notifyUser(postOwnerId, "New Like", `${actorName} liked ${titleText}`, { type: "like" });
  }
}
