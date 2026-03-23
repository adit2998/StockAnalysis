import React from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import LandingPage from './components/LandingPage';
import CompaniesList from './components/CompaniesList';
import CompanyReports from './components/CompanyReports';
import CompanyPage from './components/CompanyPage';
import AppNavbar from './components/Navbar';
import ReportDetails from './components/ReportDetails';
import CompanyFinancials from './components/CompanyFinancials';

function App() {
  return (
    <Router>
      <AppNavbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/companies" element={<CompaniesList />} /> 
        <Route path="/companies/:ticker" element={<CompanyPage />} /> 
        <Route path="/companies/:ticker/reports" element={<CompanyReports />} />       
        <Route path="/report-details/:fileName" element={<ReportDetails />} />
        <Route path="/financials/:ticker" element={<CompanyFinancials />} />
      </Routes>
    </Router>
  );
}

export default App;