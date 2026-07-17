/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // AGENTDUEL_API_URL is read at RUNTIME in lib/arena.ts (server-side), NOT
  // declared here — a next.config `env` block would inline it at build time.
  // Unset → the page renders from the committed lib/arena-snapshot.json;
  // set → the server component fetches the live arena (snapshot as fallback).
};
export default nextConfig;
