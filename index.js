import express from 'express';
import fetch from 'node-fetch'; // if using ESM, or `const fetch = require('node-fetch')` in CJS
import cors from 'cors';
const app = express();
const PORT = 8000;

// Enable CORS
app.use(cors());
app.use(express.json());

app.get('/api/providers', async (req, res) => {
  try {
    const params = new URLSearchParams({
      version: '2.1',
      limit: 20,
      skip: 0,
      ...req.query
    });

    const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`);
    const data = await response.json();

    res.json(data);
  } catch (err) {
    console.error('Error fetching providers:', err);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
