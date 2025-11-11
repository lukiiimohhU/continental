// API Configuration
export const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000/api';
export const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8000/api/ws';

// Helper functions for API calls
export const apiCall = async (endpoint, options = {}) => {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }

  return response.json();
};

// WebSocket helper
export const createWebSocket = (roomCode, playerId) => {
  const wsUrl = `${WS_URL}/${roomCode}/${playerId}`;
  return new WebSocket(wsUrl);
};

export default {
  API_URL,
  WS_URL,
  apiCall,
  createWebSocket,
};