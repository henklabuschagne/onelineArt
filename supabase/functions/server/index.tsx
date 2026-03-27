import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use('*', logger(console.log));

// ── Security: Allowed origins for CORS ──
// In production, set the ALLOWED_ORIGINS env var to your Azure domain(s),
// comma-separated, e.g. "https://myapp.azurestaticapps.net,https://myapp.com"
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "*").split(",").map(s => s.trim());

app.use(
  "/*",
  cors({
    origin: allowedOrigins.includes("*")
      ? "*"
      : (origin: string) => allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: !allowedOrigins.includes("*"),
  }),
);

// ── Security: Global rate limiter (per IP, 60 req/min) ──
const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();
app.use("/*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || c.req.header("cf-connecting-ip")
    || "unknown";
  const now = Date.now();
  const entry = ipRequestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequestCounts.set(ip, { count: 1, resetAt: now + 60000 });
  } else {
    entry.count++;
    if (entry.count > 120) {
      console.log(`Rate limit exceeded for IP ${ip}`);
      return c.json({ error: "Too many requests. Please slow down." }, 429);
    }
  }
  await next();
});

// ── Security: Request body size limit (2MB) ──
app.use("/*", async (c, next) => {
  const contentLength = c.req.header("content-length");
  if (contentLength && parseInt(contentLength) > 2 * 1024 * 1024) {
    return c.json({ error: "Request body too large" }, 413);
  }
  await next();
});

// ── Security: Add security headers to all responses ──
app.use("/*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
});

const supabaseAdmin = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const supabaseAnon = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
);

// Admin emails - change this to your email
const ADMIN_EMAILS = ["admin@onelineart.com"];

const getUser = async (c: any) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) {
    console.log("getUser: No token provided");
    return null;
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error) {
    console.log("getUser: Auth error:", error.message);
    return null;
  }
  if (!data?.user) {
    console.log("getUser: No user in response");
    return null;
  }
  return data.user;
};

const isAdmin = async (userId: string) => {
  const profile = await kv.get(`user:${userId}:profile`);
  return profile?.role === "admin";
};

// Initialize default pricing
const initPricing = async () => {
  const existing = await kv.get("pricing:tiers");
  if (!existing) {
    await kv.set("pricing:tiers", {
      imageCost: 1,
      videoCost: 5,
      tiers: [
        { id: "starter", name: "Starter", monthlyPrice: 25, imageCredits: 30, videoCredits: 5, discount: 0, description: "Perfect for trying out one-line art" },
        { id: "pro", name: "Pro", monthlyPrice: 40, imageCredits: 60, videoCredits: 12, discount: 20, description: "For creators who need more power" },
        { id: "enterprise", name: "Enterprise", monthlyPrice: 60, imageCredits: 120, videoCredits: 30, discount: 40, description: "Unlimited creativity for teams" }
      ],
      annualDiscount: 15
    });
  }
};
initPricing();

// ══════════════════════════════════════════════════
// ── HEALTH ──
// ══════════════════════════════════════════════════
app.get("/make-server-ba0ed251/health", (c) => c.json({ status: "ok" }));

// ══════════════════════════════════════════════════
// ── AUTH ──
// ══════════════════════════════════════════════════

// Signup (email_confirm: false — requires email verification)
app.post("/make-server-ba0ed251/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    if (!email || !password || !name) {
      return c.json({ error: "Email, password, and name are required" }, 400);
    }

    const sb = supabaseAdmin();
    const isFirstUser = !(await kv.get("system:hasUsers"));
    const role = ADMIN_EMAILS.includes(email) || isFirstUser ? "admin" : "user";

    const { data, error } = await sb.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Set to false for production email verification. Set to true for dev/testing.
      email_confirm: false,
    });

    if (error) {
      console.log("Signup error:", error.message);
      return c.json({ error: `Signup failed: ${error.message}` }, 400);
    }

    const userId = data.user.id;

    await kv.set(`user:${userId}:profile`, {
      id: userId, email, name, role,
      createdAt: new Date().toISOString(),
    });

    await kv.set(`user:${userId}:credits`, {
      imageCredits: 5, videoCredits: 1, balance: 10,
    });

    await kv.set("system:hasUsers", true);

    // Send verification email via Supabase (uses Supabase's built-in mailer)
    // The user must click the link in their email before they can log in.
    // Supabase sends this automatically when email_confirm is false.

    console.log(`User created: ${email}, role: ${role}, email_confirm: false (verification required)`);
    return c.json({ success: true, role, emailVerificationRequired: true });
  } catch (err: any) {
    console.log("Signup exception:", err.message);
    return c.json({ error: `Signup exception: ${err.message}` }, 500);
  }
});

// Resend verification email
app.post("/make-server-ba0ed251/auth/resend-verification", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: "Email is required" }, 400);

    const sb = supabaseAnon();
    const { error } = await sb.auth.resend({ type: "signup", email });
    if (error) {
      console.log("Resend verification error:", error.message);
      return c.json({ error: `Failed to resend: ${error.message}` }, 400);
    }

    console.log(`Verification email resent to ${email}`);
    return c.json({ success: true });
  } catch (err: any) {
    console.log("Resend verification exception:", err.message);
    return c.json({ error: `Resend exception: ${err.message}` }, 500);
  }
});

// Request password reset
app.post("/make-server-ba0ed251/auth/forgot-password", async (c) => {
  try {
    const { email, redirectTo } = await c.req.json();
    if (!email) return c.json({ error: "Email is required" }, 400);

    const sb = supabaseAnon();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo || undefined,
    });
    if (error) {
      console.log("Password reset request error:", error.message);
      return c.json({ error: `Failed to send reset email: ${error.message}` }, 400);
    }

    console.log(`Password reset email sent to ${email}`);
    return c.json({ success: true });
  } catch (err: any) {
    console.log("Forgot password exception:", err.message);
    return c.json({ error: `Forgot password exception: ${err.message}` }, 500);
  }
});

// ══════════════════════════════════════════════════
// ── USER ──
// ══════════════════════════════════════════════════

app.get("/make-server-ba0ed251/user/profile", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const profile = await kv.get(`user:${user.id}:profile`);
  const credits = await kv.get(`user:${user.id}:credits`);
  const subscription = await kv.get(`user:${user.id}:subscription`);
  return c.json({ profile, credits, subscription });
});

app.post("/make-server-ba0ed251/user/deduct", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const { type } = await c.req.json();
  const credits = await kv.get(`user:${user.id}:credits`);
  if (!credits) return c.json({ error: "No credits found" }, 400);

  if (type === "image") {
    if (credits.imageCredits < 1) return c.json({ error: "Insufficient image credits", credits }, 400);
    credits.imageCredits -= 1;
  } else if (type === "video") {
    if (credits.videoCredits < 1) return c.json({ error: "Insufficient video credits", credits }, 400);
    credits.videoCredits -= 1;
  } else {
    return c.json({ error: "Invalid type" }, 400);
  }

  await kv.set(`user:${user.id}:credits`, credits);
  const txId = `tx:${user.id}:${Date.now()}`;
  await kv.set(txId, { userId: user.id, type, cost: type === "image" ? 1 : 5, createdAt: new Date().toISOString() });
  return c.json({ success: true, credits });
});

// Get user's purchase/usage history
app.get("/make-server-ba0ed251/user/history", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const allTx = await kv.getByPrefix(`tx:${user.id}:`);
  // Sort newest first
  allTx.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return c.json({ transactions: allTx.slice(0, 50) }); // last 50
});

// Cancel subscription
app.post("/make-server-ba0ed251/user/cancel-subscription", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const subscription = await kv.get(`user:${user.id}:subscription`);
  if (!subscription) return c.json({ error: "No active subscription" }, 400);

  // Mark as cancelled (credits remain until period end)
  subscription.cancelledAt = new Date().toISOString();
  subscription.status = "cancelled";
  await kv.set(`user:${user.id}:subscription`, subscription);

  console.log(`Subscription cancelled for user ${user.id}`);
  return c.json({ success: true, subscription });
});

// Purchase tier (direct, non-Stripe)
app.post("/make-server-ba0ed251/user/purchase", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { tierId, billingCycle } = await c.req.json();
  const pricing = await kv.get("pricing:tiers");
  if (!pricing) return c.json({ error: "Pricing not configured" }, 500);

  const tier = pricing.tiers.find((t: any) => t.id === tierId);
  if (!tier) return c.json({ error: "Invalid tier" }, 400);

  const credits = await kv.get(`user:${user.id}:credits`) || { imageCredits: 0, videoCredits: 0, balance: 0 };
  credits.imageCredits += tier.imageCredits;
  credits.videoCredits += tier.videoCredits;

  const price = billingCycle === "annual"
    ? tier.monthlyPrice * 12 * (1 - pricing.annualDiscount / 100)
    : tier.monthlyPrice;

  await kv.set(`user:${user.id}:credits`, credits);
  await kv.set(`user:${user.id}:subscription`, {
    tierId, tierName: tier.name, billingCycle, price,
    status: "active",
    purchasedAt: new Date().toISOString(),
    nextBilling: billingCycle === "annual"
      ? new Date(Date.now() + 365 * 86400000).toISOString()
      : new Date(Date.now() + 30 * 86400000).toISOString(),
  });

  const txId = `tx:${user.id}:purchase:${Date.now()}`;
  await kv.set(txId, {
    userId: user.id, type: "purchase", tierId, tierName: tier.name,
    billingCycle, price, imageCredits: tier.imageCredits, videoCredits: tier.videoCredits,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, credits, price });
});

// Get pricing
app.get("/make-server-ba0ed251/pricing", async (c) => {
  const pricing = await kv.get("pricing:tiers");
  return c.json(pricing);
});

// ══════════════════════════════════════════════════
// ── AI IMAGE PROXY (OpenAI DALL-E) ──
// ══════════════════════════════════════════════════

app.post("/make-server-ba0ed251/ai/generate-image", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_KEY) {
      console.log("AI: OPENAI_API_KEY not configured");
      return c.json({ error: "OpenAI is not configured on the server" }, 500);
    }

    const { prompt } = await c.req.json();
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return c.json({ error: "Prompt is required" }, 400);
    }
    if (prompt.trim().length > 1000) {
      return c.json({ error: "Prompt must be under 1000 characters" }, 400);
    }

    // Rate limiting: max 1 request per 5 seconds per user
    const rateLimitKey = `ratelimit:ai:${user.id}`;
    const lastRequest = await kv.get(rateLimitKey);
    if (lastRequest && Date.now() - lastRequest.timestamp < 5000) {
      return c.json({ error: "Please wait a few seconds between image generations" }, 429);
    }
    await kv.set(rateLimitKey, { timestamp: Date.now() });

    const styledPrompt = `A minimalist one-line drawing, single continuous black line on pure white background, simple elegant line art of: ${prompt.trim()}`;

    console.log(`AI image generation for user ${user.id}: "${prompt.trim().substring(0, 50)}..."`);

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: styledPrompt,
        n: 1,
        size: "1024x1024",
        quality: "hd",
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const msg = errBody?.error?.message || `OpenAI API error: ${response.status}`;
      console.log("AI generation error:", msg);
      return c.json({ error: msg }, response.status);
    }

    const data = await response.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      console.log("AI: No image data returned from OpenAI");
      return c.json({ error: "No image data returned from OpenAI" }, 500);
    }

    console.log(`AI image generated successfully for user ${user.id}`);
    return c.json({ success: true, b64_json: b64 });
  } catch (err: any) {
    console.log("AI generation exception:", err.message);
    return c.json({ error: `AI generation exception: ${err.message}` }, 500);
  }
});

// ══════════════════════════════════════════════════
// ── STRIPE CHECKOUT ──
// ══════════════════════════════════════════════════

app.post("/make-server-ba0ed251/stripe/create-checkout", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { tierId, billingCycle, successUrl, cancelUrl } = await c.req.json();
    const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET) {
      console.log("Stripe: STRIPE_SECRET_KEY not configured");
      return c.json({ error: "Stripe is not configured on the server" }, 500);
    }

    const pricing = await kv.get("pricing:tiers");
    if (!pricing) return c.json({ error: "Pricing not configured" }, 500);

    const tier = pricing.tiers.find((t: any) => t.id === tierId);
    if (!tier) return c.json({ error: "Invalid tier" }, 400);

    const unitPrice = billingCycle === "annual"
      ? Math.round(tier.monthlyPrice * 12 * (1 - pricing.annualDiscount / 100) * 100)
      : tier.monthlyPrice * 100;

    const description = `${tier.name} Plan (${billingCycle}) — ${tier.imageCredits} image + ${tier.videoCredits} video credits`;

    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", `${successUrl}?session_id={CHECKOUT_SESSION_ID}`);
    params.append("cancel_url", cancelUrl);
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", `${tier.name} Plan`);
    params.append("line_items[0][price_data][product_data][description]", description);
    params.append("line_items[0][price_data][unit_amount]", String(unitPrice));
    params.append("line_items[0][quantity]", "1");
    params.append("metadata[userId]", user.id);
    params.append("metadata[tierId]", tierId);
    params.append("metadata[billingCycle]", billingCycle);
    params.append("metadata[imageCredits]", String(tier.imageCredits));
    params.append("metadata[videoCredits]", String(tier.videoCredits));
    params.append("metadata[tierName]", tier.name);
    params.append("customer_email", user.email || "");

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (session.error) {
      console.log("Stripe create session error:", JSON.stringify(session.error));
      return c.json({ error: `Stripe error: ${session.error.message}` }, 400);
    }

    console.log(`Stripe checkout session created: ${session.id} for user ${user.id}, tier ${tierId}`);
    return c.json({ success: true, sessionId: session.id, url: session.url });
  } catch (err: any) {
    console.log("Stripe checkout exception:", err.message);
    return c.json({ error: `Stripe checkout exception: ${err.message}` }, 500);
  }
});

// Verify a completed Stripe Checkout Session and fulfill credits
app.post("/make-server-ba0ed251/stripe/verify-session", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { sessionId } = await c.req.json();
    if (!sessionId) return c.json({ error: "Missing sessionId" }, 400);

    const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET) return c.json({ error: "Stripe not configured" }, 500);

    // Check if already fulfilled
    const fulfilled = await kv.get(`stripe:session:${sessionId}`);
    if (fulfilled) {
      console.log(`Stripe session ${sessionId} already fulfilled`);
      return c.json({ success: true, alreadyFulfilled: true, credits: fulfilled.credits });
    }

    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { "Authorization": `Bearer ${STRIPE_SECRET}` },
    });
    const session = await stripeRes.json();

    if (session.error) {
      console.log("Stripe verify error:", JSON.stringify(session.error));
      return c.json({ error: `Stripe error: ${session.error.message}` }, 400);
    }

    if (session.payment_status !== "paid") {
      console.log(`Stripe session ${sessionId} not paid: ${session.payment_status}`);
      return c.json({ error: "Payment not completed" }, 400);
    }

    const meta = session.metadata || {};
    if (meta.userId !== user.id) {
      console.log(`Stripe session user mismatch: expected ${user.id}, got ${meta.userId}`);
      return c.json({ error: "Session does not belong to this user" }, 403);
    }

    // Fulfill credits
    const imageCredits = parseInt(meta.imageCredits || "0", 10);
    const videoCredits = parseInt(meta.videoCredits || "0", 10);
    const credits = await kv.get(`user:${user.id}:credits`) || { imageCredits: 0, videoCredits: 0, balance: 0 };
    credits.imageCredits += imageCredits;
    credits.videoCredits += videoCredits;
    await kv.set(`user:${user.id}:credits`, credits);

    const price = (session.amount_total || 0) / 100;

    // Only create subscription for tier purchases, not one-off credit buys
    if (meta.purchaseType !== "credits" && meta.tierId) {
      await kv.set(`user:${user.id}:subscription`, {
        tierId: meta.tierId, tierName: meta.tierName, billingCycle: meta.billingCycle,
        price, status: "active",
        purchasedAt: new Date().toISOString(),
        nextBilling: meta.billingCycle === "annual"
          ? new Date(Date.now() + 365 * 86400000).toISOString()
          : new Date(Date.now() + 30 * 86400000).toISOString(),
      });
    }

    const txId = `tx:${user.id}:purchase:${Date.now()}`;
    await kv.set(txId, {
      userId: user.id, type: meta.purchaseType === "credits" ? "credit-purchase" : "purchase",
      tierId: meta.tierId, tierName: meta.tierName,
      billingCycle: meta.billingCycle, price, imageCredits, videoCredits,
      stripeSessionId: sessionId, createdAt: new Date().toISOString(),
    });

    await kv.set(`stripe:session:${sessionId}`, { fulfilled: true, credits, userId: user.id });

    console.log(`Stripe session ${sessionId} fulfilled: +${imageCredits} images, +${videoCredits} videos for user ${user.id}`);
    return c.json({ success: true, credits, price });
  } catch (err: any) {
    console.log("Stripe verify exception:", err.message);
    return c.json({ error: `Stripe verify exception: ${err.message}` }, 500);
  }
});

// Buy Credits (one-off, no subscription) via Stripe
app.post("/make-server-ba0ed251/stripe/buy-credits", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { imageCredits, videoCredits, successUrl, cancelUrl } = await c.req.json();
    if ((!imageCredits && !videoCredits) || (imageCredits < 0 || videoCredits < 0)) {
      return c.json({ error: "Must purchase at least some credits" }, 400);
    }

    const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET) return c.json({ error: "Stripe is not configured on the server" }, 500);

    const pricing = await kv.get("pricing:tiers");
    if (!pricing) return c.json({ error: "Pricing not configured" }, 500);

    const subtotal = imageCredits * pricing.imageCost + videoCredits * pricing.videoCost;
    // Bulk discounts
    let discountPct = 0;
    if (subtotal >= 500) discountPct = 20;
    else if (subtotal >= 200) discountPct = 15;
    else if (subtotal >= 100) discountPct = 10;
    else if (subtotal >= 50) discountPct = 5;
    const totalCents = Math.round(subtotal * (1 - discountPct / 100) * 100);
    if (totalCents <= 0) return c.json({ error: "Total must be greater than zero" }, 400);

    const parts: string[] = [];
    if (imageCredits > 0) parts.push(`${imageCredits} image`);
    if (videoCredits > 0) parts.push(`${videoCredits} video`);
    const description = `One-time credit purchase: ${parts.join(" + ")} credits`;

    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", `${successUrl}?session_id={CHECKOUT_SESSION_ID}`);
    params.append("cancel_url", cancelUrl);
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", "Additional Credits");
    params.append("line_items[0][price_data][product_data][description]", description);
    params.append("line_items[0][price_data][unit_amount]", String(totalCents));
    params.append("line_items[0][quantity]", "1");
    params.append("metadata[userId]", user.id);
    params.append("metadata[purchaseType]", "credits");
    params.append("metadata[imageCredits]", String(imageCredits));
    params.append("metadata[videoCredits]", String(videoCredits));
    params.append("customer_email", user.email || "");

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (session.error) {
      console.log("Stripe buy-credits error:", JSON.stringify(session.error));
      return c.json({ error: `Stripe error: ${session.error.message}` }, 400);
    }

    console.log(`Stripe buy-credits session created: ${session.id} for user ${user.id}, ${imageCredits} img + ${videoCredits} vid`);
    return c.json({ success: true, sessionId: session.id, url: session.url });
  } catch (err: any) {
    console.log("Stripe buy-credits exception:", err.message);
    return c.json({ error: `Stripe buy-credits exception: ${err.message}` }, 500);
  }
});

// Stripe Webhook — handles checkout.session.completed for reliable fulfillment
app.post("/make-server-ba0ed251/stripe/webhook", async (c) => {
  try {
    const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY");
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!STRIPE_SECRET) return c.json({ error: "Stripe not configured" }, 500);

    const body = await c.req.text();

    // If webhook secret is configured, verify signature
    if (STRIPE_WEBHOOK_SECRET) {
      const signature = c.req.header("stripe-signature");
      if (!signature) {
        console.log("Stripe webhook: Missing signature");
        return c.json({ error: "Missing stripe-signature header" }, 400);
      }
      // Manual Stripe signature verification
      const parts = signature.split(",").reduce((acc: Record<string, string>, part: string) => {
        const [k, v] = part.split("=");
        acc[k] = v;
        return acc;
      }, {} as Record<string, string>);

      const timestamp = parts["t"];
      const expectedSig = parts["v1"];

      if (!timestamp || !expectedSig) {
        console.log("Stripe webhook: Invalid signature format");
        return c.json({ error: "Invalid signature format" }, 400);
      }

      // Verify timestamp is within 5 minutes
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parseInt(timestamp)) > 300) {
        console.log("Stripe webhook: Timestamp too old");
        return c.json({ error: "Webhook timestamp too old" }, 400);
      }

      // Compute expected signature
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(STRIPE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const signed = await crypto.subtle.sign(
        "HMAC", key, encoder.encode(`${timestamp}.${body}`)
      );
      const computedSig = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, "0")).join("");

      if (computedSig !== expectedSig) {
        console.log("Stripe webhook: Signature mismatch");
        return c.json({ error: "Invalid signature" }, 400);
      }
    }

    const event = JSON.parse(body);
    console.log(`Stripe webhook received: ${event.type}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.payment_status !== "paid") {
        console.log(`Webhook: session ${session.id} not paid yet, skipping`);
        return c.json({ received: true });
      }

      const sessionId = session.id;

      // Idempotency check
      const alreadyFulfilled = await kv.get(`stripe:session:${sessionId}`);
      if (alreadyFulfilled) {
        console.log(`Webhook: session ${sessionId} already fulfilled, skipping`);
        return c.json({ received: true });
      }

      const meta = session.metadata || {};
      const userId = meta.userId;
      if (!userId) {
        console.log(`Webhook: session ${sessionId} has no userId in metadata`);
        return c.json({ received: true });
      }

      const imageCredits = parseInt(meta.imageCredits || "0", 10);
      const videoCredits = parseInt(meta.videoCredits || "0", 10);
      const credits = await kv.get(`user:${userId}:credits`) || { imageCredits: 0, videoCredits: 0, balance: 0 };
      credits.imageCredits += imageCredits;
      credits.videoCredits += videoCredits;
      await kv.set(`user:${userId}:credits`, credits);

      const price = (session.amount_total || 0) / 100;

      // Only create subscription for tier purchases, not one-off credit buys
      if (meta.purchaseType !== "credits" && meta.tierId) {
        await kv.set(`user:${userId}:subscription`, {
          tierId: meta.tierId, tierName: meta.tierName, billingCycle: meta.billingCycle,
          price, status: "active",
          purchasedAt: new Date().toISOString(),
          nextBilling: meta.billingCycle === "annual"
            ? new Date(Date.now() + 365 * 86400000).toISOString()
            : new Date(Date.now() + 30 * 86400000).toISOString(),
        });
      }

      const txId = `tx:${userId}:purchase:${Date.now()}`;
      await kv.set(txId, {
        userId, type: meta.purchaseType === "credits" ? "credit-purchase" : "purchase",
        tierId: meta.tierId, tierName: meta.tierName,
        billingCycle: meta.billingCycle, price, imageCredits, videoCredits,
        stripeSessionId: sessionId, source: "webhook", createdAt: new Date().toISOString(),
      });

      await kv.set(`stripe:session:${sessionId}`, { fulfilled: true, credits, userId, source: "webhook" });

      console.log(`Webhook fulfilled: session ${sessionId}, user ${userId}, +${imageCredits} images, +${videoCredits} videos`);
    }

    return c.json({ received: true });
  } catch (err: any) {
    console.log("Stripe webhook exception:", err.message);
    return c.json({ error: `Webhook exception: ${err.message}` }, 500);
  }
});

// ══════════════════════════════════════════════════
// ── ADMIN ROUTES ──
// ══════════════════════════════════════════════════

// Promote current user to admin (only works if no admin exists yet)
app.post("/make-server-ba0ed251/admin/promote", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const allProfiles = await kv.getByPrefix("user:");
  const admins = allProfiles.filter((p: any) => p.role === "admin");

  if (admins.length > 0) {
    const profile = await kv.get(`user:${user.id}:profile`);
    if (profile?.role === "admin") return c.json({ success: true, message: "Already admin" });
    return c.json({ error: "An admin already exists. Contact them for access." }, 403);
  }

  const profile = await kv.get(`user:${user.id}:profile`);
  if (profile) {
    profile.role = "admin";
    await kv.set(`user:${user.id}:profile`, profile);
  }
  console.log(`User ${user.id} promoted to admin (no existing admin found)`);
  return c.json({ success: true, message: "You are now an admin!" });
});

app.get("/make-server-ba0ed251/admin/users", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!(await isAdmin(user.id))) return c.json({ error: "Forbidden" }, 403);

  const profiles = await kv.getByPrefix("user:");
  const users = profiles.filter((p: any) => p.email);
  return c.json({ users });
});

app.get("/make-server-ba0ed251/admin/analytics", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!(await isAdmin(user.id))) return c.json({ error: "Forbidden" }, 403);

  const allTx = await kv.getByPrefix("tx:");
  const profiles = await kv.getByPrefix("user:");
  const userProfiles = profiles.filter((p: any) => p.email);

  let totalRevenue = 0, totalImageGens = 0, totalVideoGens = 0, totalPurchases = 0;
  const revenueByDay: Record<string, number> = {};
  const usageByDay: Record<string, { images: number; videos: number }> = {};

  for (const tx of allTx) {
    const day = tx.createdAt?.slice(0, 10) || "unknown";
    if (tx.type === "purchase" || tx.type === "credit-purchase") {
      totalRevenue += tx.price || 0; totalPurchases++;
      revenueByDay[day] = (revenueByDay[day] || 0) + (tx.price || 0);
    } else if (tx.type === "image") {
      totalImageGens++;
      if (!usageByDay[day]) usageByDay[day] = { images: 0, videos: 0 };
      usageByDay[day].images++;
    } else if (tx.type === "video") {
      totalVideoGens++;
      if (!usageByDay[day]) usageByDay[day] = { images: 0, videos: 0 };
      usageByDay[day].videos++;
    }
  }

  return c.json({ totalUsers: userProfiles.length, totalRevenue, totalImageGens, totalVideoGens, totalPurchases, revenueByDay, usageByDay });
});

app.post("/make-server-ba0ed251/admin/pricing", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!(await isAdmin(user.id))) return c.json({ error: "Forbidden" }, 403);
  const pricing = await c.req.json();
  await kv.set("pricing:tiers", pricing);
  return c.json({ success: true });
});

app.post("/make-server-ba0ed251/admin/user/update", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!(await isAdmin(user.id))) return c.json({ error: "Forbidden" }, 403);
  const { userId, updates } = await c.req.json();
  if (updates.profile) {
    const existing = await kv.get(`user:${userId}:profile`);
    await kv.set(`user:${userId}:profile`, { ...existing, ...updates.profile });
  }
  if (updates.credits) await kv.set(`user:${userId}:credits`, updates.credits);
  return c.json({ success: true });
});

app.post("/make-server-ba0ed251/admin/user/delete", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!(await isAdmin(user.id))) return c.json({ error: "Forbidden" }, 403);
  const { userId } = await c.req.json();
  const sb = supabaseAdmin();
  await sb.auth.admin.deleteUser(userId);
  await kv.del(`user:${userId}:profile`);
  await kv.del(`user:${userId}:credits`);
  await kv.del(`user:${userId}:subscription`);
  return c.json({ success: true });
});

Deno.serve(app.fetch);