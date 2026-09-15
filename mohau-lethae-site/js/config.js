/*
  Points the frontend at the backend API. In local development, the backend
  runs on http://localhost:4000 (see mohau-lethae-backend/README.md) while
  this frontend is served separately (e.g. `python3 -m http.server 8000`).

  In production, replace this with your real deployed API origin — see
  mohau-lethae-backend/docs/DEPLOYMENT.md. If frontend and backend are
  deployed under the same domain (e.g. both behind one Vercel project),
  this can simply be an empty string so requests are same-origin.
*/
window.API_BASE = window.API_BASE || "http://localhost:4000";
