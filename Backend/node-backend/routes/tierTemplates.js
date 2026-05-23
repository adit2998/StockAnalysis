const express = require('express');
const fallbackTemplates = require('../data/tierTemplates.json');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const templates = await db.collection('tierTemplates')
        .find({}, { projection: { _id: 0 } })
        .sort({ tier: 1 })
        .toArray();

      res.json(templates.length ? templates : fallbackTemplates);
    } catch (error) {
      console.error('Error fetching tier templates:', error);
      res.json(fallbackTemplates);
    }
  });

  return router;
};
