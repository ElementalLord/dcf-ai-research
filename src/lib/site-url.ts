/**
 * The site's public address, used for link previews and absolute URLs.
 * On Vercel, VERCEL_PROJECT_PRODUCTION_URL is set automatically to the production domain
 * (the custom domain once one is added), so nothing needs changing when the project moves
 * to a new team or domain. SITE_URL overrides it if ever needed.
 */
const configured = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const siteUrl = new URL(
  configured ? (configured.startsWith("http") ? configured : `https://${configured}`) : "http://localhost:3000",
);

/** The bare host, for display (e.g. on the link-preview card). */
export const siteHost = siteUrl.host;
