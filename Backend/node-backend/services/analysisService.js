const Anthropic = require('@anthropic-ai/sdk');
const { ObjectId } = require('mongodb');
const logger = require('../utils/logger');

// Pricing for claude-sonnet-4-6 in USD per 1M tokens
const INPUT_COST_PER_M_USD = 3.00;
const OUTPUT_COST_PER_M_USD = 15.00;

// Fixed USD → GBP conversion rate (update via env if needed)
const USD_TO_GBP = parseFloat(process.env.USD_TO_GBP_RATE || '0.79');

// Single tool that collects all answers in one call — avoids the problem where
// tool_choice:'any' only guarantees ≥1 call, leaving later questions unanswered.
const ANSWER_ALL_QUESTIONS_TOOL = {
  name: 'answer_all_questions',
  description: 'Answer ALL financial analysis questions. Call this tool exactly once and put every answer in the answers array, in the same order the questions appear.',
  input_schema: {
    type: 'object',
    properties: {
      answers: {
        type: 'array',
        description: 'One object per question, in question order.',
        items: {
          type: 'object',
          properties: {
            key_findings: {
              type: 'array',
              items: { type: 'string' },
              description: '2–4 concise bullet points that an analyst would highlight.',
            },
            analysis: {
              type: 'string',
              description: 'Full structured analysis text with evidence from the source data. Use markdown: **bold** for key terms, ## for sub-headings, and | tables | for numeric comparisons.',
            },
            sources: {
              type: 'array',
              items: { type: 'string' },
              description: 'Names of the filing sections or financial statements that directly support this analysis.',
            },
          },
          required: ['key_findings', 'analysis', 'sources'],
        },
      },
    },
    required: ['answers'],
  },
};

// Maps source key to collection name and display label
const STATEMENT_MAP = {
  income:   { collection: 'income_statements',    label: 'Income Statement' },
  balance:  { collection: 'balance_sheets',        label: 'Balance Sheet' },
  cashflow: { collection: 'cash_flow_statements',  label: 'Cash Flow Statement' },
};

// 1 token ≈ 4 characters (standard Anthropic approximation)
function charsToTokens(charCount) {
  return Math.ceil(charCount / 4);
}

// Max source content characters sent to Claude. Default ~80k tokens. Override via env.
const MAX_SOURCE_CHARS = parseInt(process.env.MAX_SOURCE_CHARS || String(320_000), 10);
// Floor per section body after truncation — keeps at least an introduction from every section.
const MIN_SECTION_CHARS = 500;

// Proportionally trims each part's body so the total fits within maxChars.
// The === header === line is always preserved so Claude knows what sources were included.
function fitContentToBudget(parts, maxChars) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  if (total <= maxChars) return { parts, truncated: false };

  const ratio = maxChars / total;
  const trimmed = parts.map(part => {
    const newlineIdx = part.indexOf('\n');
    if (newlineIdx === -1) {
      return part.slice(0, Math.max(MIN_SECTION_CHARS, Math.floor(part.length * ratio)));
    }
    const header = part.slice(0, newlineIdx + 1);
    const body   = part.slice(newlineIdx + 1);
    const allowed = Math.max(MIN_SECTION_CHARS, Math.floor(body.length * ratio));
    if (body.length <= allowed) return part;
    return `${header}${body.slice(0, allowed)}\n[... truncated to fit analysis budget]`;
  });

  return { parts: trimmed, truncated: true };
}

function calcCostGBP(inputTokens, outputTokens) {
  const costUSD =
    (inputTokens  / 1_000_000) * INPUT_COST_PER_M_USD +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_M_USD;
  return parseFloat((costUSD * USD_TO_GBP).toFixed(6));
}

// Fetches all selected source content from MongoDB and returns it as a single string.
// sources = { filings: [{fileName, sections: null|[...]}], reportPeriods: ['income_annual', ...] }
async function fetchSourceContent(db, ticker, sources) {
  const parts = [];

  for (const filing of (sources.filings || [])) {
    try {
      // Prefer pre-summarised content; fall back to raw sections
      let doc = await db.collection('report_summaries').findOne({ _id: filing.fileName });
      if (!doc) doc = await db.collection('report_sections').findOne({ _id: filing.fileName });
      if (!doc?.sections) {
        logger.warn('No sections found for filing', { fileName: filing.fileName });
        continue;
      }

      const sectionsToInclude = filing.sections === null
        ? Object.keys(doc.sections)                      // whole filing
        : filing.sections;                               // specific sections only

      for (const name of sectionsToInclude) {
        const content = doc.sections[name];
        if (typeof content === 'string' && content.trim()) {
          parts.push(`=== ${name} ===\n${content}`);
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch filing content', { fileName: filing.fileName, error: err.message });
    }
  }

  for (const periodKey of (sources.reportPeriods || [])) {
    const [stmtKey, period] = periodKey.split('_');
    const mapping = STATEMENT_MAP[stmtKey];
    if (!mapping) continue;

    try {
      const doc = await db.collection(mapping.collection).findOne(
        { ticker: ticker.toUpperCase(), period_type: period },
        { projection: { _id: 0 } }
      );
      if (doc) {
        const label = `${mapping.label} (${period === 'annual' ? 'Annual' : 'Quarterly'})`;
        parts.push(`=== ${label} ===\n${JSON.stringify(doc, null, 2)}`);
      }
    } catch (err) {
      logger.warn('Failed to fetch financial statement', { stmtKey, period, ticker, error: err.message });
    }
  }

  const { parts: fittedParts, truncated } = fitContentToBudget(parts, MAX_SOURCE_CHARS);

  if (truncated) {
    const originalChars = parts.reduce((s, p) => s + p.length, 0);
    const fittedChars   = fittedParts.reduce((s, p) => s + p.length, 0);
    logger.warn('Source content truncated to fit budget', {
      originalChars,
      fittedChars,
      originalTokensEst: charsToTokens(originalChars),
      fittedTokensEst:   charsToTokens(fittedChars),
      sectionsCount: parts.length,
    });
  }

  return fittedParts.join('\n\n');
}

// Fetches source content character counts WITHOUT loading full content (for fast estimation).
// For financial statements we use a rough size estimate since they vary by company.
async function getSourceCharCounts(db, ticker, sources) {
  let totalChars = 0;

  for (const filing of (sources.filings || [])) {
    try {
      let doc = await db.collection('report_summaries').findOne({ _id: filing.fileName });
      if (!doc) doc = await db.collection('report_sections').findOne({ _id: filing.fileName });
      if (!doc?.sections) continue;

      const sectionsToCount = filing.sections === null
        ? Object.values(doc.sections)
        : filing.sections.map(s => doc.sections[s]).filter(Boolean);

      for (const content of sectionsToCount) {
        totalChars += typeof content === 'string' ? content.length : 0;
      }
    } catch { /* silently skip on error */ }
  }

  // Financial statements: average ~15 000 chars each (conservative estimate)
  totalChars += (sources.reportPeriods || []).length * 15_000;

  // Cap to match what fitContentToBudget will actually send
  return Math.min(totalChars, MAX_SOURCE_CHARS);
}

// Estimate cost before running. Returns { estimatedCostGBP, inputTokensEstimate, outputTokensEstimate, sourceChars }
async function estimateCost(db, ticker, sources, questions) {
  const sourceChars   = await getSourceCharCounts(db, ticker, sources);
  const promptOverhead = 2_000;                               // system prompt + boilerplate
  const inputTokens   = charsToTokens(sourceChars + promptOverhead);
  const outputTokens  = (questions?.length || 1) * 500;      // ~500 tokens per answer

  return {
    estimatedCostGBP:    calcCostGBP(inputTokens, outputTokens),
    inputTokensEstimate:  inputTokens,
    outputTokensEstimate: outputTokens,
    sourceChars,
  };
}

// Main async analysis runner. Called fire-and-forget after the POST responds.
async function runAnalysis(db, analysisId, userId, ticker, companyName, tierName, questions, basePrompt, sources, reportOptions = {}) {
  const { showKeyFindings = false } = reportOptions;
  const logCtx = { analysisId: analysisId.toString(), ticker, userId: userId.toString() };

  try {
    logger.info('Analysis starting', { ...logCtx, showKeyFindings });

    await db.collection('generated_reports').updateOne(
      { _id: analysisId },
      { $set: { status: 'running' } }
    );

    // ── Fetch source content ──────────────────────────────────────────────────
    logger.info('Fetching source content from DB', logCtx);
    const sourceContent = await fetchSourceContent(db, ticker, sources);

    if (!sourceContent.trim()) {
      throw new Error('No source content found for the selected sources. Make sure the filings have been processed.');
    }

    logger.info('Source content fetched', { ...logCtx, chars: sourceContent.length });

    // ── Build prompt ──────────────────────────────────────────────────────────
    const numberedQuestions = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let report;
    let usage;

    if (showKeyFindings) {
      // ── Tool use mode: each question answered via answer_question tool ───────
      const systemPrompt = [
        basePrompt,
        '',
        `You must answer all ${questions.length} questions by calling the answer_all_questions tool exactly once.`,
        'Put every answer in the answers array in question order. Never return plain text.',
        'For each answer: populate key_findings (2–4 bullets), analysis (use markdown — **bold** key terms, ## sub-headings, | tables | for numeric comparisons), and sources.',
        'This applies regardless of any other instructions.',
      ].join('\n');

      const userMessage = [
        `You are analyzing ${companyName} (${ticker}).`,
        '',
        '=== SOURCE DATA ===',
        sourceContent,
        '',
        '=== QUESTIONS ===',
        numberedQuestions,
        '',
        `Call answer_all_questions once with all ${questions.length} answers in the answers array.`,
      ].join('\n');

      logger.info('Calling Anthropic API (tool use mode)', {
        ...logCtx,
        estimatedInputTokens: charsToTokens(systemPrompt.length + userMessage.length),
      });

      const response = await anthropic.messages.create({
        model:        'claude-sonnet-4-6',
        max_tokens:   16000,
        system:       systemPrompt,
        messages:     [{ role: 'user', content: userMessage }],
        tools:        [ANSWER_ALL_QUESTIONS_TOOL],
        tool_choice:  { type: 'any' },
      });

      usage = response.usage;

      logger.info('Anthropic raw response (tool use)', {
        ...logCtx,
        stopReason: response.stop_reason,
        contentBlockTypes: response.content.map(b => b.type),
      });

      if (response.stop_reason === 'max_tokens') {
        throw new Error('Analysis response was truncated (max_tokens reached). Try selecting fewer sources or questions.');
      }

      const toolBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'answer_all_questions');
      if (!toolBlock) {
        throw new Error('Model did not call the answer_all_questions tool');
      }

      logger.info('Tool block received', {
        ...logCtx,
        answersCount: toolBlock.input?.answers?.length ?? 'undefined',
        firstAnswerAnalysisLength: toolBlock.input?.answers?.[0]?.analysis?.length ?? 0,
      });

      const answers = toolBlock.input.answers || [];
      report = questions.map((q, idx) => ({
        q,
        key_findings: answers[idx]?.key_findings || [],
        analysis:     answers[idx]?.analysis     || '',
        sources:      answers[idx]?.sources      || [],
      }));

      logger.info('Report built', {
        ...logCtx,
        reportLength: report.length,
        emptyAnswers: report.filter(r => !r.analysis).length,
      });

    } else {
      // ── Legacy mode: plain JSON array ─────────────────────────────────────
      const systemPrompt = [
        basePrompt,
        '',
        'IMPORTANT OUTPUT FORMAT: Your entire response must be a single valid JSON array.',
        'Start with [ and end with ]. Do not include markdown, code blocks, or any other text.',
        'Each element must have exactly two fields:',
        '  "q": the exact question text',
        '  "a": your detailed, evidence-based answer',
      ].join('\n');

      const userMessage = [
        `You are analyzing ${companyName} (${ticker}).`,
        '',
        '=== SOURCE DATA ===',
        sourceContent,
        '',
        '=== QUESTIONS ===',
        numberedQuestions,
        '',
        'Return a JSON array with one object per question: [{"q": "...", "a": "..."}, ...]',
      ].join('\n');

      logger.info('Calling Anthropic API', {
        ...logCtx,
        estimatedInputTokens: charsToTokens(systemPrompt.length + userMessage.length),
      });

      const response = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 16000,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      });

      usage = response.usage;
      const rawText = response.content[0]?.text ?? '';

      logger.info('Anthropic raw response (legacy)', {
        ...logCtx,
        stopReason: response.stop_reason,
        rawLength: rawText.length,
        rawPreview: rawText.slice(0, 200),
      });

      if (response.stop_reason === 'max_tokens') {
        throw new Error('Analysis response was truncated (max_tokens reached). Try selecting fewer sources or questions.');
      }

      try {
        const cleaned = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();
        report = JSON.parse(cleaned);
        if (!Array.isArray(report)) throw new Error('Response is not a JSON array');
        logger.info('Legacy report parsed', {
          ...logCtx,
          reportLength: report.length,
          firstAnswerLength: report[0]?.a?.length ?? 0,
        });
      } catch (parseErr) {
        logger.error('JSON parse failed', { ...logCtx, preview: rawText.slice(0, 300) });
        throw new Error(`AI returned invalid JSON: ${parseErr.message}`);
      }
    }

    logger.info('Anthropic API call complete', {
      ...logCtx,
      inputTokens:  usage.input_tokens,
      outputTokens: usage.output_tokens,
    });

    // ── Persist results ───────────────────────────────────────────────────────
    const actualCostGBP = calcCostGBP(usage.input_tokens, usage.output_tokens);

    const saveResult = await db.collection('generated_reports').updateOne(
      { _id: analysisId },
      {
        $set: {
          status: 'completed',
          report,
          actualCostGBP,
          tokenUsage:  { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
          completedAt: new Date(),
        },
      }
    );

    logger.info('Analysis saved', {
      ...logCtx,
      actualCostGBP,
      answers: report.length,
      matchedCount: saveResult.matchedCount,
      modifiedCount: saveResult.modifiedCount,
    });

    // ── Update user spend ─────────────────────────────────────────────────────
    const userObjId = new ObjectId(userId);

    await db.collection('users').updateOne(
      { _id: userObjId },
      { $inc: { total_spend_gbp: actualCostGBP } }
    );

    // Update or insert the current month's entry in the monthly_spend array
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;

    const userDoc = await db.collection('users').findOne({ _id: userObjId });
    const existingMonth = (userDoc?.monthly_spend || []).find(
      e => e.year === year && e.month === month
    );

    if (existingMonth) {
      await db.collection('users').updateOne(
        { _id: userObjId, 'monthly_spend.year': year, 'monthly_spend.month': month },
        { $inc: { 'monthly_spend.$.amount': actualCostGBP } }
      );
    } else {
      await db.collection('users').updateOne(
        { _id: userObjId },
        { $push: { monthly_spend: { year, month, amount: actualCostGBP } } }
      );
    }

  } catch (err) {
    logger.error('Analysis failed', { ...logCtx, error: err.message, stack: err.stack });
    await db.collection('generated_reports').updateOne(
      { _id: analysisId },
      { $set: { status: 'failed', error: err.message } }
    );
  }
}

module.exports = { runAnalysis, estimateCost };
