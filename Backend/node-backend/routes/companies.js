const express = require('express');

module.exports = (db) => {
  const router = express.Router();

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

  return router;
};
