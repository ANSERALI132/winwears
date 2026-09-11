/**
 * Vercel serverless entry point.
 *
 * This project's backend (backend/src/app.ts) is a normal Express app built
 * for a persistent Node process (see backend/README.md, written for Railway).
 * createApp() was deliberately kept separate from server.ts's app.listen so
 * it can be handed to something else that drives requests - here, a Vercel
 * Node serverless function.
 *
 * vercel.json rewrites /api/*, /admin and /admin/* to this function while
 * static frontend files continue to be served directly, so this file's only
 * job is: build the Express app once per warm instance, and hand it every
 * request Vercel routes here. Express dispatches internally on req.url, so
 * one entry point is enough for every route the backend defines.
 *
 * Built by `cd backend && npm run build` (see vercel.json's buildCommand)
 * before this function is bundled, so backend/dist/app.js is expected to
 * exist at deploy time.
 */
const { createApp } = require('../backend/dist/app');

let app;

module.exports = (req, res) => {
if (!app) app = createApp();
return app(req, res);
};

