// Wraps the Express app so Netlify runs it as a serverless function.
// All routes are rewritten here by netlify.toml.
const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const app = require('../../app');

const handler = serverless(app);

module.exports.handler = async (event, context) => {
  // Classic (v1) functions must connect the Blobs context from the event so
  // getStore() works and data persists to Netlify Blobs. Wrapped in try/catch
  // so local/offline runs (no Blobs context) fall back to file storage instead
  // of crashing.
  try {
    connectLambda(event);
  } catch {
    /* Blobs context unavailable (e.g. offline dev) — storage falls back to file */
  }
  return handler(event, context);
};
