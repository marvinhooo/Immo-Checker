import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AuthGate } from './components/auth/AuthGate';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
    <PwaUpdatePrompt />
  </StrictMode>,
);
