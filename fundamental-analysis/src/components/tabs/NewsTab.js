import React, { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, Alert } from 'react-bootstrap';

function timeAgo(timestamp) {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const NewsTab = ({ company }) => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/news/${company.ticker}/news`
      );
      if (!res.ok) throw new Error('Failed to fetch news');
      setArticles(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [company.ticker]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" size="sm" className="me-2" />
        <span className="text-muted">Loading news…</span>
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">Could not load news: {error}</Alert>;
  }

  if (!articles.length) {
    return <div className="text-muted small">No news found for {company.ticker}.</div>;
  }

  return (
    <div>
      <div className="text-muted small mb-3">Latest news for {company.name}</div>
      <div className="d-flex flex-column gap-3">
        {articles.map((article) => (
          <Card key={article.id} className="shadow-sm">
            <Card.Body className="d-flex gap-3 align-items-start">
              {article.thumbnail ? (
                <img
                  src={article.thumbnail}
                  alt=""
                  style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{ width: 64, height: 64, borderRadius: 8, background: '#f0f0f0', flexShrink: 0 }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fw-semibold mb-1 d-block text-decoration-none text-dark"
                  style={{ fontSize: '0.95rem' }}
                >
                  {article.title}
                </a>
                <div className="text-muted small mb-1">
                  {article.publisher} · {timeAgo(article.publishedAt)}
                </div>
                {article.summary && (
                  <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                    {article.summary}
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default NewsTab;
