import React from 'react';
import ReactDOM from 'react-dom/client';

import { StandalonePaneApp } from '@/App';
import '@/index.css';

const desktopClient = typeof window !== 'undefined' ? window.claudeDesktop : null;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StandalonePaneApp desktopClient={desktopClient} />
  </React.StrictMode>,
);
