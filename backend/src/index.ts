import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/webhook/payment', async (req, res) => {
  const { invoice_id, paid_amount, proof_url } = req.body;
  // TODO: validate, check amounts, call Anchor client to set_settled
  res.status(200).json({ ok: true });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Backend listening on ${port}`));
