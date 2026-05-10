const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  // Must be registered before /:ticker so "search" isn't treated as a ticker
  router.get('/search', async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || !q.trim()) return res.json([]);
      // Escape special regex chars to prevent injection
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      const results = await db.collection('companies_list')
        .find({ $or: [{ ticker: regex }, { name: regex }] })
        .limit(10)
        .toArray();
      res.json(results);
    } catch (error) {
      console.error('Error searching companies:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const companies = await db.collection('companies_list').find({}).toArray();

      res.json(companies);
    } catch (error) {
      console.error('Error fetching companies:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/:ticker', async (req, res) => {
    try {
      const { ticker } = req.params;

      const company = await db.collection('companies_list').findOne({ ticker: ticker.toUpperCase() });

      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      res.json(company);
    } catch (error) {
      console.error('Error fetching company:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/:ticker/description', async (req, res) => {
    try {
      const { ticker } = req.params;
      const upperTicker = ticker.toUpperCase();

      const tenKFilter = { ticker: upperTicker, file_name: { $regex: '10-K', $options: 'i' } };

      let doc = await db.collection('report_summaries')
        .find(tenKFilter)
        .sort({ _id: -1 })
        .limit(1)
        .next();

      if (!doc?.sections?.['Business']) {
        doc = await db.collection('report_sections')
          .find(tenKFilter)
          .sort({ _id: -1 })
          .limit(1)
          .next();
      }

      const description = doc?.sections?.['Business'] ?? null;
      res.json({ description });
    } catch (error) {
      console.error('Error fetching company description:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
