import React from 'react';
import { Row, Col, Card, Table } from 'react-bootstrap';

const OverviewTab = ({ company }) => (
  <div>
    <Row className="g-3 mb-4">
      <Col md={3}>
        <Card className="p-3 shadow-sm h-100">
          <div className="text-muted small mb-1">SIC Code</div>
          <div className="fw-semibold">{company.sic}</div>
        </Card>
      </Col>
      <Col md={3}>
        <Card className="p-3 shadow-sm h-100">
          <div className="text-muted small mb-1">Industry</div>
          <div className="fw-semibold">{company.sicDescription}</div>
        </Card>
      </Col>
      <Col md={3}>
        <Card className="p-3 shadow-sm h-100">
          <div className="text-muted small mb-1">Exchange</div>
          <div className="fw-semibold">--</div>
        </Card>
      </Col>
      <Col md={3}>
        <Card className="p-3 shadow-sm h-100">
          <div className="text-muted small mb-1">Employees</div>
          <div className="fw-semibold">--</div>
        </Card>
      </Col>
    </Row>
    <Row className="g-3">
      <Col md={6}>
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
      <Col md={6}>
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
  </div>
);

export default OverviewTab;
