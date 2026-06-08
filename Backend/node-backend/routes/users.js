const express = require('express');
const { ObjectId } = require('mongodb');
const authMiddleware = require('../middleware/auth');

module.exports = (db) => {
  const router = express.Router();

  // Returns the current user's profile with saved companies + spending info
  router.get('/me', authMiddleware, async (req, res) => {
    try {
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(req.user.userId) },
        { projection: { _id: 1, email: 1, name: 1, companies: 1, total_spend_gbp: 1, isAdmin: 1 } }
      );
      if (!user) return res.status(404).json({ error: 'User not found' });

      const tickers = user.companies || [];
      const companiesData = tickers.length > 0
        ? await db.collection('companies_list').find({ ticker: { $in: tickers } }).toArray()
        : [];

      res.json({ ...user, companiesData });
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Returns aggregated analysis + spending stats for the profile page
  router.get('/stats', authMiddleware, async (req, res) => {
    try {
      const userId = new ObjectId(req.user.userId);

      const [user, allAnalyses] = await Promise.all([
        db.collection('users').findOne(
          { _id: userId },
          { projection: { total_spend_gbp: 1, monthly_spend: 1 } }
        ),
        db.collection('generated_reports')
          .find({ userId }, { projection: { status: 1, actualCostGBP: 1, createdAt: 1, completedAt: 1 } })
          .toArray(),
      ]);

      const now        = new Date();
      const thisYear   = now.getFullYear();
      const thisMonth  = now.getMonth() + 1;

      const analysesThisMonth = allAnalyses.filter(a => {
        const d = new Date(a.createdAt);
        return d.getFullYear() === thisYear && (d.getMonth() + 1) === thisMonth;
      }).length;

      // Build last 6 months of spending from the stored monthly_spend array
      const storedMonthly = user?.monthly_spend || [];
      const last6 = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(thisYear, thisMonth - 1 - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const entry = storedMonthly.find(e => e.year === y && e.month === m);
        last6.push({
          year:   y,
          month:  m,
          label:  d.toLocaleString('en-GB', { month: 'short' }),
          amount: parseFloat((entry?.amount || 0).toFixed(4)),
        });
      }

      const currentMonthSpendGBP = last6[last6.length - 1].amount;

      res.json({
        totalAnalyses:         allAnalyses.length,
        analysesThisMonth,
        totalSpendGBP:         parseFloat((user?.total_spend_gbp || 0).toFixed(4)),
        currentMonthSpendGBP,
        monthlyBudgetGBP:      20,
        monthlySpend:          last6,
      });
    } catch (err) {
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
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
