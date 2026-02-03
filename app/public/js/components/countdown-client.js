/**
 * Countdown Client Service
 * Handles WebSocket connection to server for real-time countdown
 * Server is the single source of truth - client countdown is cosmetic only
 */

// Socket.io connection
let socket = null;

// State
let examId = null;
let timerElement = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Callbacks
let onCountdownUpdateCallback = null;
let onExpiredCallback = null;
let onConnectionChangeCallback = null;
let onErrorCallback = null;

/**
 * Format seconds into MM:SS display
 * @param {number} totalSeconds - Total seconds remaining
 * @returns {string} Formatted time string
 */
function formatTime(totalSeconds) {
  if (totalSeconds <= 0) return '00:00';

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Update the timer display element
 * @param {number} remainingSeconds - Seconds remaining
 */
function updateDisplay(remainingSeconds) {
  if (!timerElement) return;

  timerElement.textContent = formatTime(remainingSeconds);

  // Add visual warning when less than 5 minutes (300 seconds) remaining
  if (remainingSeconds < 300) {
    timerElement.classList.add('timer-warning');
  } else {
    timerElement.classList.remove('timer-warning');
  }

  // Add critical warning when less than 1 minute remaining
  if (remainingSeconds < 60) {
    timerElement.classList.add('timer-critical');
  } else {
    timerElement.classList.remove('timer-critical');
  }
}

/**
 * Get the WebSocket URL for countdown
 * @returns {string} WebSocket URL
 */
function getSocketUrl() {
  // In production, connect through nginx proxy
  // Socket.io path is configured on the server
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${window.location.protocol}//${window.location.host}`;
}

/**
 * Initialize the countdown client
 * @param {Object} options - Configuration options
 * @param {string} options.examId - The exam ID to track
 * @param {HTMLElement} options.timerElement - DOM element to display countdown
 * @param {string} [options.token] - Optional auth token
 * @param {Function} [options.onUpdate] - Callback for countdown updates
 * @param {Function} [options.onExpired] - Callback when exam expires
 * @param {Function} [options.onConnectionChange] - Callback for connection status changes
 * @param {Function} [options.onError] - Callback for errors
 */
function initialize(options) {
  examId = options.examId;
  timerElement = options.timerElement;
  onCountdownUpdateCallback = options.onUpdate;
  onExpiredCallback = options.onExpired;
  onConnectionChangeCallback = options.onConnectionChange;
  onErrorCallback = options.onError;

  if (!examId) {
    console.error('Countdown client: examId is required');
    return;
  }

  connect(options.token);
}

/**
 * Connect to the WebSocket server
 * @param {string} [token] - Optional auth token
 */
function connect(token) {
  if (socket && socket.connected) {
    console.log('Countdown client: Already connected');
    return;
  }

  console.log('Countdown client: Connecting to server...');

  // Build connection options
  const socketOptions = {
    path: '/facilitator/countdown/',
    transports: ['websocket', 'polling'],
    query: {
      examId: examId,
    },
    auth: {
      examId: examId,
    },
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  };

  // Add token if provided
  if (token) {
    socketOptions.query.token = token;
    socketOptions.auth.token = token;
  }

  // Connect to the server
  socket = io(getSocketUrl(), socketOptions);

  // Connection established
  socket.on('connect', () => {
    console.log('Countdown client: Connected');
    isConnected = true;
    reconnectAttempts = 0;

    if (onConnectionChangeCallback) {
      onConnectionChangeCallback(true);
    }

    // Join the exam room (should happen automatically but explicit join is safer)
    socket.emit('join', { examId });
  });

  // Connection lost
  socket.on('disconnect', (reason) => {
    console.log('Countdown client: Disconnected -', reason);
    isConnected = false;

    if (onConnectionChangeCallback) {
      onConnectionChangeCallback(false);
    }
  });

  // Countdown update from server
  socket.on('countdown', (data) => {
    console.debug('Countdown tick:', data);

    if (data.remainingSeconds !== undefined) {
      updateDisplay(data.remainingSeconds);

      if (onCountdownUpdateCallback) {
        onCountdownUpdateCallback({
          remainingSeconds: data.remainingSeconds,
          expiresAt: data.expiresAt,
          serverTime: data.serverTime,
          status: data.status,
        });
      }
    }
  });

  // Exam expired event
  socket.on('expired', (data) => {
    console.log('Countdown client: Exam expired', data);

    updateDisplay(0);

    if (onExpiredCallback) {
      onExpiredCallback({
        examId: data.examId,
        message: data.message,
        serverTime: data.serverTime,
      });
    }
  });

  // Pong response (for connection health check)
  socket.on('pong', (data) => {
    console.debug('Countdown pong:', data);
  });

  // Error event
  socket.on('error', (data) => {
    console.error('Countdown client error:', data);

    if (onErrorCallback) {
      onErrorCallback(data);
    }
  });

  // Connection error
  socket.on('connect_error', (error) => {
    console.error('Countdown client connection error:', error.message);
    reconnectAttempts++;

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Countdown client: Max reconnect attempts reached');
      if (onErrorCallback) {
        onErrorCallback({ code: 'MAX_RECONNECT', message: 'Failed to connect to countdown server' });
      }
    }
  });
}

/**
 * Disconnect from the WebSocket server
 */
function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
    console.log('Countdown client: Disconnected');
  }
}

/**
 * Check if connected to the server
 * @returns {boolean} Connection status
 */
function isSocketConnected() {
  return isConnected && socket && socket.connected;
}

/**
 * Send a ping to check connection health
 */
function ping() {
  if (socket && socket.connected) {
    socket.emit('ping');
  }
}

/**
 * Get the current exam ID
 * @returns {string|null} The exam ID
 */
function getExamId() {
  return examId;
}

// Export the countdown client service
export {
  initialize,
  connect,
  disconnect,
  isSocketConnected,
  ping,
  getExamId,
  formatTime,
};
