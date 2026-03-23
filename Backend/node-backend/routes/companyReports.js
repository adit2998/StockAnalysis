const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  // GET /api/company-reports
  // Returns a list of all company reports (basic info)
  router.get('/', async (req, res) => {
    try {
      const reports = await db.collection('reports_list').find({}).toArray();
      res.json(reports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // GET /api/company-reports/:ticker
  // Returns all reports for a specific company
  router.get('/:ticker', async (req, res) => {
    try {
      const { ticker } = req.params;

      const reports = await db
        .collection('reports_list')
        .find({ Ticker: ticker.toUpperCase() })
        .toArray();

      if (!reports || reports.length === 0) {
        return res.status(404).json({ error: 'No reports found for this company' });
      }

      res.json(reports);
    } catch (error) {
      console.error('Error fetching company reports:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};