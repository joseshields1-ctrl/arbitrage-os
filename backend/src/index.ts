import app from './app';
import { initializeDatabase } from "./db/sqlite";

const port = Number(process.env.PORT) || 3000;

initializeDatabase();

app.listen(port, () => {
  console.log(`arbitrage-os-backend listening on port ${port}`);
});
