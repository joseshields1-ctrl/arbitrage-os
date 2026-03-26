import app from './app';

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`arbitrage-os-backend listening on port ${port}`);
});
