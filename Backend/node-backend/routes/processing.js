const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');

const PIPELINE_DIR = process.env.PYTHON_PIPELINE_DIR
  || path.join(__dirname, '../../info-processing');
const PYTHON_CMD = process.env.PYTHON_CMD || 'python3';
const LOG_DIR = process.env.PROCESSING_LOG_DIR
  || path.join(__dirname, '../logs/processing');

function spawnPipeline(params) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOG_DIR, `${params.ticker}-${timestamp}.log`);
  const out = fs.openSync(logFile, 'w');

  const cli = path.join(PIPELINE_DIR, 'process_cli.py');
  const proc = spawn(PYTHON_CMD, [cli, JSON.stringify(params)], {
    cwd: PIPELINE_DIR,
    detached: true,
    stdio: ['ignore', out, out],  // stdout + stderr both go to the log file
  });
  proc.unref();
  return { proc, logFile };
}

module.exports = (db) => {
  const router = express.Router();

  // POST /api/processing/request — any authenticated user, no summarisation
  router.post('/request', authMiddleware, async (req, res) => {
    try {
      const { ticker, name, include10K = true, include10Q = false, includeProxy = false } = req.body;
      if (!ticker) return res.status(400).json({ error: 'ticker required' });
      const upperTicker = ticker.toUpperCase();

      // Deduplicate: ignore if already in corpus or already being processed
      const [inCorpus, inFlight] = await Promise.all([
        db.collection('companies_list').findOne({ ticker: upperTicker }),
        db.collection('processing_requests').findOne({
          ticker: upperTicker,
          status: { $in: ['pending', 'processing'] },
        }),
      ]);
      if (inCorpus) return res.status(409).json({ error: 'Company already in corpus' });
      if (inFlight) return res.json({ success: true, alreadyQueued: true });

      await db.collection('processing_requests').insertOne({
        ticker: upperTicker,
        name: name || upperTicker,
        requestedBy: req.user.userId,
        requestType: 'user',
        status: 'processing',
        createdAt: new Date(),
      });

      const { logFile } = spawnPipeline({
        ticker: upperTicker,
        include10K,
        include10Q,
        includeProxy,
        summarize10K: false,
        summarize10Q: false,
        summarizeProxy: false,
      });

      res.json({ success: true, logFile });
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // POST /api/processing/process — admin only, full summarisation control, runs immediately
  router.post('/process', authMiddleware, async (req, res) => {
    try {
      if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

      const {
        ticker, name,
        summarize10K, num10KSummaries,
        summarize10Q, num10QSummaries,
        summarizeProxy, numProxySummaries,
      } = req.body;
      if (!ticker) return res.status(400).json({ error: 'ticker required' });

      const { logFile } = spawnPipeline({
        ticker: ticker.toUpperCase(),
        include10K:  req.body.include10K  ?? true,
        include10Q:  req.body.include10Q  ?? false,
        includeProxy: req.body.includeProxy ?? false,
        summarize10K: !!summarize10K,
        num10KSummaries: num10KSummaries || 0,
        summarize10Q: !!summarize10Q,
        num10QSummaries: num10QSummaries || 0,
        summarizeProxy: !!summarizeProxy,
        numProxySummaries: numProxySummaries || 1,
      });

      res.json({ success: true, logFile });
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // POST /api/processing/queue — admin only, no summarisation (marks available for users)
  router.post('/queue', authMiddleware, async (req, res) => {
    try {
      if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

      const { ticker, name, include10K = true, include10Q = false, includeProxy = false } = req.body;
      if (!ticker) return res.status(400).json({ error: 'ticker required' });

      const { logFile } = spawnPipeline({
        ticker: ticker.toUpperCase(),
        include10K,
        include10Q,
        includeProxy,
        summarize10K: false,
        summarize10Q: false,
        summarizeProxy: false,
      });

      res.json({ success: true, logFile });
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
