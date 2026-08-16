type SiteverifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

/**
 * Verify a Turnstile response token with Cloudflare's siteverify API.
 * Rejects (returns false) on network/parse failures as well as unsuccessful tokens.
 */
export async function verifyTurnstileToken(
  secret: string,
  token: string,
  remoteip?: string,
): Promise<boolean> {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteip) {
    body.set("remoteip", remoteip);
  }

  let response: Response;
  try {
    response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );
  } catch {
    return false;
  }

  if (!response.ok) {
    return false;
  }

  try {
    const data = (await response.json()) as SiteverifyResponse;
    return data.success === true;
  } catch {
    return false;
  }
}
