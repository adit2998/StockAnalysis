const express = require('express');
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

const PERIOD_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '2y': 24, '5y': 60 };

function isCachedToday(updatedAt) {
  const now = new Date();
  const updated = new Date(updatedAt);
  return (
    updated.getFullYear() === now.getFullYear() &&
    updated.getMonth() === now.getMonth() &&
    updated.getDate() === now.getDate()
  );
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/:ticker/quote', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    try {
      const collection = db.collection('stock_quotes');
      const cached = await collection.findOne({ ticker }, { projection: { _id: 0 } });
      if (cached && isCachedToday(cached.updatedAt)) {
        return res.json(cached);
      }

      const quote = await yahooFinance.quote(ticker);
      const data = {
        ticker,
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        marketCap: quote.marketCap,
        exchange: quote.fullExchangeName || quote.exchange,
        updatedAt: new Date(),
      };

      await collection.updateOne({ ticker }, { $set: data }, { upsert: true });
      res.json(data);
    } catch (err) {
      console.error(`Error fetching quote for ${ticker}:`, err.message);
      res.status(502).json({ error: 'Failed to fetch stock quote' });
    }
  });

  router.get('/:ticker/history', async (req, res) => {
    const { ticker } = req.params;
    const { period = '1y' } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - (PERIOD_MONTHS[period] ?? 12));

    try {
      const rows = await yahooFinance.historical(ticker.toUpperCase(), {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      });

      res.json(rows.map(d => ({
        date: d.date.toISOString().split('T')[0],
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      })));
    } catch (err) {
      console.error(`Error fetching history for ${ticker}:`, err.message);
      res.status(502).json({ error: 'Failed to fetch stock history' });
    }
  });

  return router;
};
