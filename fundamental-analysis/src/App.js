import React from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import LandingPage from './components/LandingPage';
import Login from './components/Login';
import AuthCallback from './components/AuthCallback';
import CompaniesList from './components/CompaniesList';
import CompanyReports from './components/CompanyReports';
import CompanyPage from './components/CompanyPage';
import AppNavbar from './components/Navbar';
import ReportDetails from './components/ReportDetails';
import CompanyFinancials from './components/CompanyFinancials';
import NewAnalysisPage from './components/NewAnalysisPage';
import AnalysisReportPage from './components/AnalysisReportPage';
import ProfilePage from './components/ProfilePage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppNavbar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/companies" element={<ProtectedRoute><CompaniesList /></ProtectedRoute>} />
          <Route path="/companies/:ticker" element={<ProtectedRoute><CompanyPage /></ProtectedRoute>} />
          <Route path="/companies/:ticker/reports" element={<ProtectedRoute><CompanyReports /></ProtectedRoute>} />
          <Route path="/report-details/:fileName" element={<ProtectedRoute><ReportDetails /></ProtectedRoute>} />
          <Route path="/financials/:ticker" element={<ProtectedRoute><CompanyFinancials /></ProtectedRoute>} />
          <Route path="/companies/:ticker/new-analysis" element={<ProtectedRoute><NewAnalysisPage /></ProtectedRoute>} />
          <Route path="/companies/:ticker/analyses/:analysisId" element={<ProtectedRoute><AnalysisReportPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
