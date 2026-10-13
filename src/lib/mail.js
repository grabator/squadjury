// The sign in email, sent with Resend (https://resend.com). Short, in the app's style:
// the logo, one line, a big button and a note that the link works for 15 minutes.

import { esc } from './http.js';

export function loginEmail(link) {
  const subject = 'Your SquadJury sign in link';
  const text = `Sign in to SquadJury:\n\n${link}\n\nThe link works once and for 15 minutes. If you did not ask for it, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f6f3;font-family:Archivo,Helvetica,Arial,sans-serif;color:#111418">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f3;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px 28px">
<tr><td style="font-size:26px;font-weight:900;letter-spacing:-0.02em">squad<span style="border-top:4px solid #ffd400">j</span>ury</td></tr>
<tr><td style="padding:24px 0 8px;font-size:22px;font-weight:800">Your SquadJury sign in link</td></tr>
<tr><td style="padding:0 0 24px;font-size:16px;line-height:1.5;color:#5e6670">Tap the button to sign in. No password needed.</td></tr>
<tr><td><a href="${esc(link)}" style="display:block;padding:16px 20px;border-radius:12px;background:#111418;color:#ffffff;font-size:17px;font-weight:800;text-align:center;text-decoration:none">Sign in to SquadJury</a></td></tr>
<tr><td style="padding:24px 0 0;font-size:13px;line-height:1.5;color:#5e6670">The link works once and for 15 minutes. If you did not ask for it, you can ignore this email.</td></tr>
</table>
<p style="font-size:12px;color:#7a828c;margin:16px 0 0">SquadJury, the FPL jury · squadjury.com</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

/** Sends the email. Throws when Resend refuses it. */
export async function sendLoginEmail(env, to, link) {
  const { subject, text, html } = loginEmail(link);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'SquadJury <login@squadjury.com>', to: [to], subject, text, html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
