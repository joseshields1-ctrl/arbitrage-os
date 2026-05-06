import app from './app';
import { initializeDatabase } from "./db/sqlite";
import { initializePollerFromEnv } from "./services/pollerService";

const port = Number(process.env.PORT) || 3000;

initializeDatabase();
initializePollerFromEnv();

app.listen(port, () => {
  console.log(`arbitrage-os-backend listening on port ${port}`);
});
