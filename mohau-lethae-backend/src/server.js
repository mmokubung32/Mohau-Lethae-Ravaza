// src/server.js
const app = require("./app");

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Mohau Lethae backend API running at http://localhost:${PORT}`);
  console.log(`Admin panel:                       http://localhost:${PORT}/admin`);
});
