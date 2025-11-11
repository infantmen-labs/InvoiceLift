import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import type { Request, Response } from 'express';

const app = express();
app.use(bodyParser.json());

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.post('/webhook/payment', async (req: Request, res: Response) => {
  const { invoice_id, paid_amount, proof_url } = req.body;
  // TODO: validate, check amounts, call Anchor client to set_settled
  res.status(200).json({ ok: true });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => console.log(`Backend listening on ${port}`));
