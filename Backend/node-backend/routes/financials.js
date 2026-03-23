const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  // GET first 5 metrics for a ticker
  router.get('/:ticker', async (req, res) => {
    try {
      const { ticker } = req.params;

      const financials = await db
        .collection('company_financials')
        .find({ ticker: ticker.toUpperCase() })
        .limit(5)
        .toArray();

      res.json(financials);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch financials' });
    }
  });

  return router;
};