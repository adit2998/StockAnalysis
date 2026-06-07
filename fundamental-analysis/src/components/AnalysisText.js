import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';

// ── Colour palette for multi-line charts ──────────────────────────────────────
const LINE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#e11d48'];

// ── Number parsing ────────────────────────────────────────────────────────────
// Returns { value: number, isPercent: boolean } or null for non-numeric cells.
function parseCell(raw) {
  const s = raw.trim().replace(/[$,]/g, '').replace(/^\((.+)\)$/, '-$1');
  const isPercent = s.endsWith('%');
  const stripped = s.replace(/%$/, '').replace(/[BMK]$/i, '');
  const num = parseFloat(stripped);
  if (isNaN(num)) return null;
  const suffix = s.replace(/%$/, '').slice(-1).toUpperCase();
  const mult = suffix === 'T' ? 1e12 : suffix === 'B' ? 1e9 : suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1;
  return { value: num * (isPercent ? 1 : mult === 1 ? 1 : mult / 1e9), isPercent };
}

// Returns a display label for the Y axis, based on the column's first numeric value.
function colUnit(parsed) {
  return parsed?.isPercent ? '%' : '';
}

// ── Markdown table parser ─────────────────────────────────────────────────────
function parseTable(lines) {
  const dataLines = lines.filter(l => !/^\s*\|[\s\-:|]+\|\s*$/.test(l));
  const rows = dataLines.map(line =>
    line.split('|')
      .slice(1, -1)           // drop empty head/tail from leading/trailing |
      .map(c => c.trim())
  );
  if (rows.length < 2) return null;
  return { headers: rows[0], rows: rows.slice(1) };
}

// A table is treated as a time series when the first header looks like a period.
function isTimeSeries(headers) {
  return /period|year|fy\s?\d|q[1-4]\s?\d|quarter|date|fiscal/i.test(headers[0] ?? '');
}

// ── Table → chart data builder ────────────────────────────────────────────────
function buildChartData(table) {
  const { headers, rows } = table;

  // Identify numeric columns (skip first column — it's the X label)
  const numericCols = [];
  for (let ci = 1; ci < headers.length; ci++) {
    const parsed = rows.map(r => parseCell(r[ci] ?? ''));
    if (parsed.some(p => p !== null)) {
      numericCols.push({
        index: ci,
        label: headers[ci],
        isPercent: parsed.find(p => p !== null)?.isPercent ?? false,
        values: parsed,
      });
    }
  }

  if (numericCols.length === 0) return null;

  // Split into absolute-value series and percentage series so we can use
  // separate Y-axes when the scales are incompatible.
  const absCols  = numericCols.filter(c => !c.isPercent);
  const pctCols  = numericCols.filter(c =>  c.isPercent);

  const chartData = rows.map((row, ri) => {
    const point = { label: row[0] ?? '' };
    numericCols.forEach(col => {
      point[col.label] = col.values[ri]?.value ?? null;
    });
    return point;
  });

  return { chartData, absCols, pctCols, numericCols };
}

// ── Recharts formatters ───────────────────────────────────────────────────────
function fmtAbsAxis(v) {
  if (v === null || v === undefined) return '';
  const abs = Math.abs(v);
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}T`;
  if (abs >= 1)   return `$${v.toFixed(1)}B`;
  return `$${(v * 1e3).toFixed(0)}M`;
}
function fmtPctAxis(v) { return v == null ? '' : `${v.toFixed(1)}%`; }

function fmtTooltipValue(value, name) {
  if (value === null || value === undefined) return ['—', name];
  const abs = Math.abs(value);
  if (abs >= 1e3) return [`$${(value / 1e3).toFixed(2)}T`, name];
  if (abs >= 1)   return [`$${value.toFixed(2)}B`, name];
  if (name?.includes('%') || name?.toLowerCase().includes('margin') || name?.toLowerCase().includes('ratio')) {
    return [`${value.toFixed(2)}%`, name];
  }
  return [`$${(value * 1e3).toFixed(0)}M`, name];
}

// ── Sub-components ────────────────────────────────────────────────────────────
function DataChart({ table, title }) {
  const built = buildChartData(table);
  if (!built) return <StyledTable table={table} />;

  const { chartData, absCols, pctCols, numericCols } = built;
  const hasAbs = absCols.length > 0;
  const hasPct = pctCols.length > 0;

  return (
    <div style={{ margin: '1rem 0', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {title && (
        <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #f3f4f6', fontWeight: 600, fontSize: '0.85rem', color: '#111' }}>
          {title}
        </div>
      )}
      <div style={{ padding: '0.75rem 0.5rem 0.25rem' }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            {hasAbs && (
              <YAxis
                yAxisId="abs"
                orientation="left"
                tickFormatter={fmtAbsAxis}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
            )}
            {hasPct && (
              <YAxis
                yAxisId="pct"
                orientation={hasAbs ? 'right' : 'left'}
                tickFormatter={fmtPctAxis}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                width={38}
              />
            )}
            <Tooltip formatter={fmtTooltipValue} contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }} />
            {numericCols.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {absCols.map((col, i) => (
              <Line
                key={col.label}
                yAxisId="abs"
                type="monotone"
                dataKey={col.label}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3, fill: LINE_COLORS[i % LINE_COLORS.length] }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
            {pctCols.map((col, i) => (
              <Line
                key={col.label}
                yAxisId="pct"
                type="monotone"
                dataKey={col.label}
                stroke={LINE_COLORS[(absCols.length + i) % LINE_COLORS.length]}
                strokeWidth={2}
                strokeDasharray={hasAbs ? '4 2' : undefined}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Source note matches mockup style */}
      <div style={{ padding: '0 1rem 0.5rem', fontSize: '0.7rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>⊟</span>
        <span>Source: data from analysis report configuration</span>
      </div>
    </div>
  );
}

function StyledTable({ table }) {
  const { headers, rows } = table;
  return (
    <div style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.82rem' }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '0.45rem 0.75rem', background: '#f9fafb', borderBottom: '2px solid #e5e7eb', textAlign: i === 0 ? 'left' : 'right', color: '#374151', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '0.4rem 0.75rem', textAlign: ci === 0 ? 'left' : 'right', color: '#111', fontVariantNumeric: 'tabular-nums' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Inline markdown renderer ──────────────────────────────────────────────────
// Handles **bold** and `code` within a line of text.
function InlineText({ text }) {
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch  = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch  = remaining.match(/`(.+?)`/);

    let next = null;
    if (boldMatch && (!codeMatch || boldMatch.index <= codeMatch.index)) next = boldMatch;
    else if (codeMatch) next = codeMatch;

    if (!next) {
      parts.push(remaining);
      break;
    }

    if (next.index > 0) parts.push(remaining.slice(0, next.index));

    if (next[0].startsWith('**')) {
      parts.push(<strong key={key++}>{next[1]}</strong>);
    } else {
      parts.push(<code key={key++} style={{ background: '#f3f4f6', padding: '0.1em 0.3em', borderRadius: 3, fontSize: '0.85em', fontFamily: 'monospace' }}>{next[1]}</code>);
    }
    remaining = remaining.slice(next.index + next[0].length);
  }

  return <>{parts}</>;
}

// ── Block parser ──────────────────────────────────────────────────────────────
// Splits raw analysis markdown text into typed blocks for rendering.
function parseBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let tableLines = [];
  let tableTitle = '';

  const flushTable = () => {
    if (tableLines.length === 0) return;
    const parsed = parseTable(tableLines);
    if (parsed) {
      blocks.push({ type: 'table', table: parsed, title: tableTitle });
    }
    tableLines = [];
    tableTitle = '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableLine = line.trim().startsWith('|');

    if (isTableLine) {
      // Capture the heading immediately before the table as a chart title
      if (tableLines.length === 0 && blocks.length > 0) {
        const prev = blocks[blocks.length - 1];
        if (prev.type === 'heading') {
          tableTitle = prev.text;
          blocks.pop();
        }
      }
      tableLines.push(line);
      continue;
    }

    flushTable();

    if (!line.trim()) {
      blocks.push({ type: 'break' });
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      continue;
    }

    blocks.push({ type: 'text', text: line });
  }

  flushTable();

  // Merge adjacent text blocks into paragraphs separated by breaks
  return blocks;
}

// ── Main component ─────────────────────────────────────────────────────────────
const AnalysisText = ({ text }) => {
  if (!text) return null;

  const blocks = parseBlocks(text);
  const elements = [];
  let paraBuffer = [];
  let key = 0;

  const flushPara = () => {
    if (paraBuffer.length === 0) return;
    elements.push(
      <p key={key++} style={{ margin: '0 0 0.75rem', lineHeight: 1.75, color: '#374151', fontSize: '0.9rem' }}>
        {paraBuffer.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            <InlineText text={line} />
          </React.Fragment>
        ))}
      </p>
    );
    paraBuffer = [];
  };

  for (const block of blocks) {
    if (block.type === 'break') {
      flushPara();
      continue;
    }

    if (block.type === 'heading') {
      flushPara();
      const sizes = { 1: '1rem', 2: '0.95rem', 3: '0.9rem', 4: '0.875rem' };
      elements.push(
        <div key={key++} style={{ fontWeight: 700, fontSize: sizes[block.level] ?? '0.9rem', color: '#111', margin: '1rem 0 0.35rem' }}>
          <InlineText text={block.text} />
        </div>
      );
      continue;
    }

    if (block.type === 'table') {
      flushPara();
      const { table, title } = block;
      elements.push(
        isTimeSeries(table.headers)
          ? <DataChart key={key++} table={table} title={title} />
          : <StyledTable key={key++} table={table} />
      );
      continue;
    }

    if (block.type === 'text') {
      paraBuffer.push(block.text);
    }
  }
  flushPara();

  return <div>{elements}</div>;
};

export default AnalysisText;
