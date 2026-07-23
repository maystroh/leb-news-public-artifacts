import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import DuelApp from './DuelApp.jsx';
import MetricsApp from './MetricsApp.jsx';
import './styles.css';

const view = new URLSearchParams(window.location.search).get('view');
const root = createRoot(document.getElementById('root'));
if (view === 'duel') root.render(<DuelApp />);
else if (view === 'metrics') root.render(<MetricsApp />);
else root.render(<App />);
