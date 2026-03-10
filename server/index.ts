import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { geminiRouter } from './routes/gemini';
import { falRouter } from './routes/fal';
import { apiLimiter } from './middleware/rateLimit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiLimiter);

app.use('/api/gemini', geminiRouter);
app.use('/api/fal', falRouter);

app.get('/api/health', (_req, res) => {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  res.json({ status: 'ok', keys: { gemini: hasGemini } });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
