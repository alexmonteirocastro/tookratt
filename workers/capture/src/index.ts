import { corsHeaders, isAllowedOrigin } from "./cors";
import { verifyTurnstileToken } from "./turnstile";
import { buildEmail, parseCapturePayload } from "./validate";

export interface Env {
  EMAIL: SendEmail;
  TURNSTILE_SECRET_KEY: string;
}

const FROM_ADDRESS = "noreply@tookratt.com";
const TO_ADDRESS = "hello@tookratt.com";

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, origin);
    }

    if (!isAllowedOrigin(origin)) {
      return jsonResponse(403, { error: "Origin not allowed." }, origin);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body." }, origin);
    }

    const parsed = parseCapturePayload(raw);
    if (typeof parsed === "string") {
      return jsonResponse(400, { error: parsed }, origin);
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      console.error("TURNSTILE_SECRET_KEY is not configured");
      return jsonResponse(500, { error: "Capture is misconfigured." }, origin);
    }

    const remoteip =
      request.headers.get("CF-Connecting-IP") ??
      request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();

    const turnstileOk = await verifyTurnstileToken(
      env.TURNSTILE_SECRET_KEY,
      parsed.turnstileToken,
      remoteip,
    );
    if (!turnstileOk) {
      return jsonResponse(
        403,
        { error: "Turnstile verification failed." },
        origin,
      );
    }

    const { subject, text } = buildEmail(parsed);

    try {
      await env.EMAIL.send({
        to: TO_ADDRESS,
        from: FROM_ADDRESS,
        replyTo: parsed.email,
        subject,
        text,
      });
    } catch (error) {
      console.error("Email send failed", error);
      return jsonResponse(
        502,
        { error: "Could not send email. Please try again later." },
        origin,
      );
    }

    return jsonResponse(200, { ok: true }, origin);
  },
} satisfies ExportedHandler<Env>;
