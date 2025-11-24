import React from 'react';
import Dashboard from './pages/Dashboard';
import ProtectedData from './components/ProtectedData';

export default function App() {
  return (
    <div>
      <Dashboard />
      <h2>Protected API (counts) — example</h2>
      <ProtectedData />
    </div>
  );
}
