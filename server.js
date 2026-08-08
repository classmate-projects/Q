// Local entry point. On Netlify the same app runs inside a serverless function
// (see netlify/functions/server.js). Run locally with `npm start`.
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`YourQ running at http://localhost:${PORT}`);
  console.log(`  Home page:     http://localhost:${PORT}/`);
  console.log(`  Customer page: http://localhost:${PORT}/customer`);
  console.log(`  Display page:  http://localhost:${PORT}/display`);
  console.log(`  Desk page:     http://localhost:${PORT}/desk`);
  console.log(`  Admin page:    http://localhost:${PORT}/admin`);
});
