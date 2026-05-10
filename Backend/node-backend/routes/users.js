const express = require('express');
const { ObjectId } = require('mongodb');
const authMiddleware = require('../middleware/auth');

module.exports = (db) => {
  const router = express.Router();

  // Returns the current user's profile with their saved companies populated
  router.get('/me', authMiddleware, async (req, res) => {
    try {
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(req.user.userId) },
        { projection: { _id: 1, email: 1, name: 1, companies: 1 } }
      );
      if (!user) return res.status(404).json({ error: 'User not found' });

      const tickers = user.companies || [];
      const companiesData = tickers.length > 0
        ? await db.collection('companies_list').find({ ticker: { $in: tickers } }).toArray()
        : [];

      res.json({ ...user, companiesData });
    } catch (err) {
      console.error('Error fetching user:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Add a company to the user's saved list
  router.post('/companies/:ticker', authMiddleware, async (req, res) => {
    try {
      const upperTicker = req.params.ticker.toUpperCase();

      const company = await db.collection('companies_list').findOne({ ticker: upperTicker });
      if (!company) return res.status(404).json({ error: 'Company not found' });

      await db.collection('users').updateOne(
        { _id: new ObjectId(req.user.userId) },
        { $addToSet: { companies: upperTicker } }
      );

      res.json({ success: true, company });
    } catch (err) {
      console.error('Error adding company:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Remove a company from the user's saved list
  router.delete('/companies/:ticker', authMiddleware, async (req, res) => {
    try {
      const upperTicker = req.params.ticker.toUpperCase();

      await db.collection('users').updateOne(
        { _id: new ObjectId(req.user.userId) },
        { $pull: { companies: upperTicker } }
      );

      res.json({ success: true });
    } catch (err) {
      console.error('Error removing company:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
