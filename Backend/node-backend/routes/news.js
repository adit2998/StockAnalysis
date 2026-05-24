const express = require('express');

const router = express.Router();

router.get('/:ticker/news', async (req, res) => {
  const { ticker } = req.params;
  const { limit = 20 } = req.query;

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FINNHUB_API_KEY is not configured' });
  }

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const toStr = to.toISOString().split('T')[0];
  const fromStr = from.toISOString().split('T')[0];

  try {
    const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker.toUpperCase()}&from=${fromStr}&to=${toStr}&token=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`Finnhub responded with ${response.status}`);

    const data = await response.json();

    const articles = data.slice(0, parseInt(limit, 10)).map((item) => ({
      id: item.id,
      title: item.headline,
      url: item.url,
      publisher: item.source,
      publishedAt: item.datetime,
      thumbnail: item.image || null,
      summary: item.summary || null,
    }));

    res.json(articles);
  } catch (err) {
    console.error(`Error fetching news for ${ticker}:`, err.message);
    res.status(502).json({ error: 'Failed to fetch news' });
  }
});

module.exports = router;
