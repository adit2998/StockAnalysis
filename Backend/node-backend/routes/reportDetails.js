const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  // GET report details by file_name
  router.get('/:fileName', async (req, res) => {
    try {
      const { fileName } = req.params;

      const collection = db.collection('report_sections');

      const report = await collection.findOne({ _id: fileName });

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