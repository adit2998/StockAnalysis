const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  // GET report details by file_name
  router.get('/:fileName', async (req, res) => {
    try {
      const { fileName } = req.params;

      const decodedFileName = decodeURIComponent(fileName);

      let report = await db.collection('report_summaries').findOne({ _id: decodedFileName });
      if (!report) {
        report = await db.collection('report_sections').findOne({ _id: decodedFileName });
      }

      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }

      res.json(report);
    } catch (err) {
      console.error('Error fetching report:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};