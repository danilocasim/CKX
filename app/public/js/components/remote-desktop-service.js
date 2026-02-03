/**
 * Remote Desktop Service
 * Handles remote desktop connection and management.
 * When examId is provided and backend returns isolated routing, uses per-exam proxy URL.
 */
import { getVncInfo } from './exam-api.js';

// Connect to VNC (pass examId for per-exam isolated desktop when available)
function connectToRemoteDesktop(vncFrame, statusCallback, examId) {
  if (statusCallback) {
    statusCallback('Connecting to Remote Desktop...', 'info');
  }

  return getVncInfo(examId)
    .then((data) => {
      console.log('Remote Desktop info:', data);
      const params = `autoconnect=true&resize=scale&show_dot=true&reconnect=true&password=${encodeURIComponent(
        data.defaultPassword || ''
      )}`;
      const baseUrl =
        data.proxyUrl && !data.useShared ? `${data.proxyUrl}&` : `/vnc-proxy/?`;
      const vncUrl = `${baseUrl}${params}`;
      vncFrame.src = vncUrl;
      if (statusCallback) {
        statusCallback('Connected to Session', 'success');
      }
      return vncUrl;
    })
    .catch((error) => {
      console.error('Error connecting to Remote Desktop:', error);
      if (statusCallback) {
        statusCallback(
          'Failed to connect to Remote Desktop. Retrying...',
          'error'
        );
      }
      // Return a promise that will retry
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(connectToRemoteDesktop(vncFrame, statusCallback, examId));
        }, 5000);
      });
    });
}

// Setup Remote Desktop frame event handlers
function setupRemoteDesktopFrameHandlers(vncFrame, statusCallback) {
  vncFrame.addEventListener('load', function () {
    if (vncFrame.src !== 'about:blank') {
      console.log('Remote Desktop frame loaded successfully');
      if (statusCallback) {
        statusCallback('Connected to Session', 'success');
      }
    }
  });

  vncFrame.addEventListener('error', function (e) {
    console.error('Error loading Remote Desktop frame:', e);
    if (statusCallback) {
      statusCallback(
        'Error connecting to Remote Desktop. Retrying...',
        'error'
      );
    }
    // Try to reconnect after a delay
    setTimeout(
      () => connectToRemoteDesktop(vncFrame, statusCallback, examId),
      5000
    );
  });
}

export { connectToRemoteDesktop, setupRemoteDesktopFrameHandlers };
