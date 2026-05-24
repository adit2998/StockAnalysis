import React from 'react';
import { Row, Col, Card, Table } from 'react-bootstrap';
import StockChart from '../StockChart';

const OverviewTab = ({ company }) => (
  <Row className="g-3">
    {/* Left column: stat cards + tables */}
    <Col md={5}>
      <Row className="g-3 mb-3">
        {[
          ['SIC Code', company.sic],
          ['Industry', company.sicDescription],
          ['Exchange', '--'],
          ['Employees', '--'],
        ].map(([label, val]) => (
          <Col xs={6} key={label}>
            <Card className="p-3 shadow-sm h-100">
              <div className="text-muted small mb-1">{label}</div>
              <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{val}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row className="g-3">
        <Col xs={12}>
          <Card className="p-3 shadow-sm">
            <div className="text-muted small mb-2">Key Statistics</div>
            <Table size="sm" borderless className="mb-0">
              <tbody>
                {[['P/E Ratio', '--'], ['EPS (TTM)', '--'], ['52-Week High', '--'], ['52-Week Low', '--']].map(([label, val]) => (
                  <tr key={label}>
                    <td className="text-muted ps-0">{label}</td>
                    <td className="text-end pe-0 fw-semibold">{val}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Col>
        <Col xs={12}>
          <Card className="p-3 shadow-sm">
            <div className="text-muted small mb-2">Dividends & Returns</div>
            <Table size="sm" borderless className="mb-0">
              <tbody>
                {[['Dividend Yield', '--'], ['Dividend / Share', '--'], ['Beta', '--'], ['Return on Equity', '--']].map(([label, val]) => (
                  <tr key={label}>
                    <td className="text-muted ps-0">{label}</td>
                    <td className="text-end pe-0 fw-semibold">{val}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Col>
      </Row>
    </Col>

    {/* Right column: stock chart */}
    <Col md={7}>
      <Card className="p-3 shadow-sm h-100">
        <div className="text-muted small mb-2">
          Price History — <span className="fw-semibold text-dark">{company.ticker}</span>
        </div>
        <StockChart ticker={company.ticker} />
      </Card>
    </Col>
  </Row>
);

export default OverviewTab;
