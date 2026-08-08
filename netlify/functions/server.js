// Wraps the Express app so Netlify runs it as a serverless function.
// All routes are rewritten here by netlify.toml.
const serverless = require('serverless-http');
const app = require('../../app');

module.exports.handler = serverless(app);
