const express = require('express');
const { ObjectId } = require('mongodb');
const authMiddleware = require('../middleware/auth');
const { runAnalysis, estimateCost } = require('../services/analysisService');
const logger = require('../utils/logger');

const MAX_SELECTIONS = 5;
const MAX_COST_GBP   = 0.50;

// Counts total selections from the sources payload (same logic as the frontend selectedCount).
// Whole filing = 1, each individual section = 1, each report period = 1.
function countSelections(sources) {
  const filingCount = (sources.filings || []).reduce(
    (sum, f) => sum + (f.sections === null ? 1 : f.sections.length),
    0
  );
  return filingCount + (sources.reportPeriods || []).length;
}

module.exports = (db) => {
  const router = express.Router();

  // ── POST /api/analyses/estimate ───────────────────────────────────────────
  // Returns a cost estimate for the given sources + questions before the user commits.
  router.post('/estimate', authMiddleware, async (req, res) => {
    try {
      const { ticker, sources, questions = [] } = req.body;
      if (!ticker || !sources) {
        return res.status(400).json({ error: 'ticker and sources are required' });
      }
      const estimate = await estimateCost(db, ticker, sources, questions);
      res.json(estimate);
    } catch (err) {
      logger.error('Cost estimation failed', { error: err.message });
      res.status(500).json({ error: 'Failed to estimate cost' });
    }
  });

  // ── GET /api/analyses/user ────────────────────────────────────────────────
  // Returns all analyses for the current user, optionally filtered by ticker.
  // Excludes the full report body so the list stays lightweight.
  router.get('/user', authMiddleware, async (req, res) => {
    try {
      const { ticker } = req.query;
      const query = { userId: new ObjectId(req.user.userId) };
      if (ticker) query.ticker = ticker.toUpperCase();

      const analyses = await db.collection('generated_reports')
        .find(query, { projection: { report: 0 } })
        .sort({ createdAt: -1 })
        .toArray();

      res.json(analyses);
    } catch (err) {
      logger.error('Failed to list user analyses', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch analyses' });
    }
  });

  // ── GET /api/analyses/:id ─────────────────────────────────────────────────
  // Returns the full analysis document (including the report body) for the owner.
  router.get('/:id', authMiddleware, async (req, res) => {
    try {
      let analysisId;
      try { analysisId = new ObjectId(req.params.id); }
      catch { return res.status(400).json({ error: 'Invalid analysis ID' }); }

      const analysis = await db.collection('generated_reports').findOne({
        _id: analysisId,
        userId: new ObjectId(req.user.userId),
      });

      if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
      res.json(analysis);
    } catch (err) {
      logger.error('Failed to fetch analysis', { id: req.params.id, error: err.message });
      res.status(500).json({ error: 'Failed to fetch analysis' });
    }
  });

  // ── POST /api/analyses ────────────────────────────────────────────────────
  // Creates a new analysis record and fires off the async AI process.
  router.post('/', authMiddleware, async (req, res) => {
    try {
      const {
        ticker, companyName, tierLevel, tierName,
        questions, basePrompt, sources,
      } = req.body;

      if (!ticker)           return res.status(400).json({ error: 'ticker is required' });
      if (!questions?.length) return res.status(400).json({ error: 'At least one question is required' });
      if (!sources)          return res.status(400).json({ error: 'sources is required' });

      // Enforce selection limit
      const totalSelections = countSelections(sources);
      if (totalSelections > MAX_SELECTIONS) {
        return res.status(400).json({
          error: `Maximum ${MAX_SELECTIONS} source selections allowed (you selected ${totalSelections})`,
        });
      }

      if (totalSelections === 0) {
        return res.status(400).json({ error: 'At least one source must be selected' });
      }

      // Estimate cost and enforce hard spending cap
      const estimate = await estimateCost(db, ticker, sources, questions);

      if (estimate.estimatedCostGBP > MAX_COST_GBP) {
        return res.status(400).json({
          error: `Estimated cost £${estimate.estimatedCostGBP.toFixed(4)} exceeds the £${MAX_COST_GBP.toFixed(2)} per-call limit. Reduce your source selections.`,
          estimatedCostGBP: estimate.estimatedCostGBP,
        });
      }

      // Create DB record
      const doc = {
        userId:           new ObjectId(req.user.userId),
        ticker:           ticker.toUpperCase(),
        companyName:      companyName || ticker.toUpperCase(),
        tierLevel:        tierLevel ?? 'custom',
        tierName:         tierName   || 'Custom',
        questions,
        basePrompt:       basePrompt || '',
        sources,
        status:           'pending',
        report:           null,
        estimatedCostGBP: estimate.estimatedCostGBP,
        actualCostGBP:    null,
        tokenUsage:       null,
        error:            null,
        createdAt:        new Date(),
        completedAt:      null,
      };

      const result     = await db.collection('generated_reports').insertOne(doc);
      const analysisId = result.insertedId;

      // Link the analysis to the user document
      await db.collection('users').updateOne(
        { _id: new ObjectId(req.user.userId) },
        { $addToSet: { generated_reports: analysisId } }
      );

      logger.info('Analysis queued', {
        analysisId: analysisId.toString(),
        ticker:     ticker.toUpperCase(),
        userId:     req.user.userId,
        estimatedCostGBP: estimate.estimatedCostGBP,
      });

      // Fire-and-forget: respond immediately, process in background
      setImmediate(() => {
        runAnalysis(
          db,
          analysisId,
          req.user.userId,
          ticker.toUpperCase(),
          companyName || ticker.toUpperCase(),
          tierName    || 'Custom',
          questions,
          basePrompt  || '',
          sources
        );
      });

      res.json({
        analysisId:       analysisId.toString(),
        status:           'pending',
        estimatedCostGBP: estimate.estimatedCostGBP,
      });

    } catch (err) {
      logger.error('Failed to create analysis', { error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Failed to create analysis' });
    }
  });

  return router;
};
