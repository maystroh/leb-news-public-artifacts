import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import DuelApp from './DuelApp.jsx';
import './styles.css';

const view = new URLSearchParams(window.location.search).get('view');
createRoot(document.getElementById('root')).render(view === 'duel' ? <DuelApp /> : <App />);
