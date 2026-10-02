import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import AuthActionPage, { authActionFromUrl } from './components/AuthActionPage.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import Tooltip from './components/Tooltip.tsx';
import ConfirmHost from './components/ConfirmDialog.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Lien recu par email (confirmation d'adresse, mot de passe) : page dediee.
const action = authActionFromUrl();
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {action ? <AuthActionPage {...action} /> : <App />}
      <Tooltip />
      <ConfirmHost />
    </ErrorBoundary>
  </React.StrictMode>
);