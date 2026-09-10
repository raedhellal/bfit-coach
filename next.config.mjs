/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No NEXT_PUBLIC_* API URL here on purpose: the browser never talks to b-fit-api.
  // Every api call goes through the server (src/lib/apiFetch.ts) so the session
  // tokens stay in httpOnly cookies (ADR-0012 D5).
};

export default nextConfig;
