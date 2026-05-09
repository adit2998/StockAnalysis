const express = require('express');

function sortValues(values = []) {
  return [...values].sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = (db) => {
  const router = express.Router();

  // GET top 9 metrics per statement, grouped — used by Trends tab
  // Returns: { 'Income Statement': [...], 'Balance Sheet': [...], 'Cash Flow': [...] }
  router.get('/:ticker/trends', async (req, res) => {
    try {
      const { ticker } = req.params;
      const collection = db.collection('company_financials');
      const statements = ['Income Statement', 'Balance Sheet', 'Cash Flow'];

      const results = {};
      for (const statement of statements) {
        const metrics = await collection
          .aggregate([
            { $match: { ticker: ticker.toUpperCase(), statement } },
            { $addFields: { valueCount: { $size: { $ifNull: ['$values', []] } } } },
            { $sort: { valueCount: -1 } },
            { $limit: 9 },
          ])
          .toArray();
        results[statement] = metrics.map(m => ({ ...m, values: sortValues(m.values) }));
      }

      res.json(results);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch trends' });
    }
  });

  // GET single metric by xbrl key (e.g. "AccountsPayableCurrent")
  router.get('/:ticker/trends/:xbrlKey', async (req, res) => {
    try {
      const { ticker, xbrlKey } = req.params;
      const metric = await db
        .collection('company_financials')
        .findOne({ id: `${xbrlKey}_${ticker.toUpperCase()}` });

      if (!metric) return res.status(404).json({ error: 'Metric not found' });
      metric.values = sortValues(metric.values);
      res.json(metric);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch metric' });
    }
  });

  // GET first 5 metrics for a ticker (existing, used elsewhere)
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
