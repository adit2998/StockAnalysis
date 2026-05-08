import React from 'react';
import { Card } from 'react-bootstrap';

const NewsTab = ({ company }) => (
  <div>
    <div className="text-muted small mb-3">Latest news for {company.name}</div>
    <div className="d-flex flex-column gap-3">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="shadow-sm">
          <Card.Body className="d-flex gap-3 align-items-start">
            <div
              style={{
                width: 64, height: 64, borderRadius: 8,
                background: '#f0f0f0', flexShrink: 0,
              }}
            />
            <div>
              <div className="fw-semibold mb-1" style={{ fontSize: '0.95rem' }}>
                Headline placeholder {i}
              </div>
              <div className="text-muted small mb-1">Source · -- hours ago</div>
              <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                Brief summary of the article goes here. This is placeholder text for the news item description.
              </div>
            </div>
          </Card.Body>
        </Card>
      ))}
    </div>
  </div>
);

export default NewsTab;
