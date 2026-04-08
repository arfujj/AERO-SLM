import { createServer } from "./app/createServer.js";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const app = createServer();

app.listen(port, () => {
  console.log(`AeroSLM server listening on http://localhost:${port}`);
});
