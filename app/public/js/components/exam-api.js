/**
 * Exam API Service
 * Handles all API interactions for the exam functionality
 * Uses Auth.fetch when available to send Bearer token for facilitator API calls
 */
var apiFetch = function (url, opts) {
  opts = opts || {};
  if (
    typeof window !== 'undefined' &&
    window.Auth &&
    typeof window.Auth.fetch === 'function'
  ) {
    return window.Auth.fetch(url, opts);
  }
  return fetch(url, opts);
};

// Function to get exam ID from URL
function getExamId() {
  // Extract exam ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const examId = urlParams.get('id');

  if (!examId) {
    console.error('No exam ID found in URL');
    alert('Error: No exam ID provided. Please return to the dashboard.');
    // redirect to dashboard
    window.location.href = '/';
  }

  return examId;
}

// Function to check exam status
function checkExamStatus(examId) {
  return apiFetch(`/sailor-client/api/v1/exams/${examId}/status`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      return data.status || null;
    });
}

// Function to fetch exam data
function fetchExamData(examId) {
  const apiUrl = `/sailor-client/api/v1/exams/${examId}/questions`;

  return apiFetch(apiUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      return data;
    })
    .catch((error) => {
      console.error('Error loading exam questions:', error);
      throw error; // Re-throw to be handled by the calling function
    });
}

// Function to fetch current exam information
function fetchCurrentExamInfo() {
  return apiFetch('/sailor-client/api/v1/exams/current')
    .then((response) => {
      if (!response.ok) {
        // Return null for 404 (no exam) or other errors
        if (response.status === 404) {
          return { success: true, data: null };
        }
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      // Handle new response format: { success: true, data: null } or { success: true, data: { id, ... } }
      // Return the exam data directly (or null) for backward compatibility
      if (data && data.success) {
        return data.data; // Return null or exam object
      }
      return data; // Fallback for old format
    });
}

// Function to evaluate exam
function evaluateExam(examId) {
  return apiFetch(`/facilitator/api/v1/exams/${examId}/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  });
}

// Function to terminate session
function terminateSession(examId) {
  return apiFetch(`/sailor-client/api/v1/exams/${examId}/terminate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  });
}

// Function to get VNC info (pass examId for per-exam isolated desktop when available)
function getVncInfo(examId) {
  const url = examId
    ? `/api/vnc-info?examId=${encodeURIComponent(examId)}`
    : '/api/vnc-info';
  return fetch(url, { credentials: 'include' })
    .then((response) => response.json())
    .catch((error) => {
      console.error('Error fetching VNC info:', error);
      throw error;
    });
}

// Function to track exam events
function trackExamEvent(examId, events) {
  return apiFetch(`/sailor-client/api/v1/exams/${examId}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ events }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .catch((error) => {
      console.error('Error tracking exam event:', error);
      // Don't throw error to avoid disrupting exam flow
      // But still log it for debugging
    });
}

// Function to submit user feedback
function submitFeedback(examId, feedbackData) {
  return apiFetch(`/sailor-client/api/v1/exams/metrics/${examId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(feedbackData),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .catch((error) => {
      console.error('Error submitting feedback:', error);
      throw error; // Re-throw to be handled by the calling function
    });
}

// Function to fetch exam answers
function fetchExamAnswers(examId) {
  const apiUrl = `/sailor-client/api/v1/exams/${examId}/answers`;

  return apiFetch(apiUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.text();
    })
    .catch((error) => {
      console.error('Error loading exam answers:', error);
      throw error;
    });
}

// Function to get terminal session for this exam (owner only); returns session with id for /ssh attach
function getTerminalSession(examId) {
  return apiFetch(`/facilitator/api/v1/terminal/session/${examId}`)
    .then((response) => {
      if (!response.ok) return null;
      return response.json();
    })
    .then((data) => (data && data.data ? data.data : null))
    .catch(() => null);
}

// Export the API functions
export {
  getExamId,
  checkExamStatus,
  fetchExamData,
  fetchCurrentExamInfo,
  evaluateExam,
  terminateSession,
  getVncInfo,
  trackExamEvent,
  submitFeedback,
  fetchExamAnswers,
  getTerminalSession,
};
