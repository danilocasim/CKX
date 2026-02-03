/**
 * Terminal Session Manager
 * Runtime isolation: SSH connections are keyed by terminal_session.id (UUID), not examId.
 * One terminal session = one user = one SSH connection. No shared TTY, stream, or workspace.
 */

const { Client } = require('ssh2');
const fs = require('fs');

const facilitatorUrl =
  process.env.FACILITATOR_URL ||
  (fs.existsSync('/.dockerenv')
    ? 'http://facilitator:3000'
    : 'http://localhost:3001');

// terminalSessionId (UUID) -> { ssh, stream, sockets: Set }
// Never key by examId; each user has their own terminal session id and thus their own SSH runtime.
const runtimes = new Map();

/**
 * Validate terminal attach with facilitator (server-side).
 * Requires terminalSessionId + examId + token. Ensures terminal_session.user_id === user and exam_session_id === examId.
 * @param {string} terminalSessionId - Terminal session UUID
 * @param {string} examId - Exam session ID
 * @param {string} token - JWT access token
 * @returns {Promise<boolean>}
 */
async function validateWithFacilitator(terminalSessionId, examId, token) {
  if (!terminalSessionId || !examId || !token) return false;
  try {
    const url =
      `${facilitatorUrl}/api/v1/terminal/validate?` +
      `terminalSessionId=${encodeURIComponent(terminalSessionId)}&` +
      `examId=${encodeURIComponent(examId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true && data.data?.valid === true;
  } catch (err) {
    console.error('Terminal validate error', err.message);
    return false;
  }
}

/**
 * Attach a client socket to the SSH runtime for this terminal session only.
 * Keyed by terminalSessionId so User A never attaches to User B's runtime.
 * @param {string} terminalSessionId - Terminal session UUID (from facilitator)
 * @param {object} socket - Socket.io socket
 * @param {object} sshConfig - { host, port, username, password }
 */
function addSocket(terminalSessionId, socket, sshConfig) {
  let entry = runtimes.get(terminalSessionId);
  if (!entry) {
    entry = { ssh: null, stream: null, sockets: new Set() };
    runtimes.set(terminalSessionId, entry);
  }
  entry.sockets.add(socket);

  const broadcast = (data) => {
    const str = typeof data === 'string' ? data : data.toString('utf8');
    entry.sockets.forEach((s) => {
      if (s.connected) s.emit('data', str);
    });
  };

  const cleanup = () => {
    entry.sockets.delete(socket);
    if (entry.sockets.size === 0) {
      if (entry.stream)
        try {
          entry.stream.close();
        } catch (_) {}
      if (entry.ssh)
        try {
          entry.ssh.end();
        } catch (_) {}
      runtimes.delete(terminalSessionId);
    }
  };

  socket.on('disconnect', cleanup);
  socket.on('data', (data) => {
    if (entry.stream) entry.stream.write(data);
  });
  socket.on('resize', (dimensions) => {
    if (entry.stream && dimensions?.cols != null && dimensions?.rows != null) {
      entry.stream.setWindow(dimensions.rows, dimensions.cols, 0, 0);
    }
  });

  if (entry.stream) {
    return;
  }

  const conn = new Client();
  entry.ssh = conn;

  conn.on('ready', () => {
    conn.shell((err, stream) => {
      if (err) {
        broadcast(`SSH shell error: ${err.message}\r\n`);
        entry.sockets.forEach((s) => s.disconnect(true));
        runtimes.delete(terminalSessionId);
        return;
      }
      entry.stream = stream;
      stream.on('data', (data) => broadcast(data));
      stream.on('close', () => {
        entry.sockets.forEach((s) => s.disconnect(true));
        runtimes.delete(terminalSessionId);
      });
      stream.on('error', (err) => {
        broadcast(`Error: ${err.message}\r\n`);
      });
    });
  });

  conn.on('error', (err) => {
    broadcast(`SSH connection error: ${err.message}\r\n`);
    entry.sockets.forEach((s) => s.disconnect(true));
    runtimes.delete(terminalSessionId);
  });

  conn.connect({
    host: sshConfig.host || 'remote-terminal',
    port: sshConfig.port || 22,
    username: sshConfig.username || 'candidate',
    password: sshConfig.password || 'password',
    readyTimeout: 30000,
    keepaliveInterval: 10000,
  });
}

module.exports = {
  validateWithFacilitator,
  addSocket,
};
