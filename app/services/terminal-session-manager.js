/**
 * Terminal Session Manager
 * Runtime isolation: one SSH shell per connection (per socket.id).
 * Key = terminalSessionId:socket.id so User A and User B never share a TTY even if session IDs collided.
 */

const { Client } = require('ssh2');
const fs = require('fs');

const facilitatorUrl =
  process.env.FACILITATOR_URL ||
  (fs.existsSync('/.dockerenv')
    ? 'http://facilitator:3000'
    : 'http://localhost:3001');

// runtimeKey (terminalSessionId:socket.id) -> { ssh, stream, socket }
// One SSH connection per browser connection so no cross-user or cross-tab sharing.
const runtimes = new Map();

/**
 * Validate terminal attach with facilitator (server-side).
 * Requires terminalSessionId + examId + token. Ensures terminal_session.user_id === user and exam_session_id === examId.
 * Returns validation result and optional sshHost/sshPort for isolated runtime.
 * @param {string} terminalSessionId - Terminal session UUID
 * @param {string} examId - Exam session ID
 * @param {string} token - JWT access token
 * @returns {Promise<{ valid: boolean, sshHost?: string, sshPort?: number }>}
 */
async function validateWithFacilitator(terminalSessionId, examId, token) {
  if (!terminalSessionId || !examId || !token) return { valid: false };
  try {
    const url =
      `${facilitatorUrl}/api/v1/terminal/validate?` +
      `terminalSessionId=${encodeURIComponent(terminalSessionId)}&` +
      `examId=${encodeURIComponent(examId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { valid: false };
    const data = await res.json();
    const valid = data.success === true && data.data?.valid === true;
    if (!valid) return { valid: false };
    return {
      valid: true,
      sshHost: data.data.sshHost || undefined,
      sshPort: data.data.sshPort != null ? data.data.sshPort : undefined,
    };
  } catch (err) {
    console.error('Terminal validate error', err.message);
    return { valid: false };
  }
}

/**
 * Attach a client socket to a dedicated SSH runtime for this connection only.
 * Key = terminalSessionId:socket.id so each connection gets its own shell (no cross-user or cross-tab sharing).
 * @param {string} terminalSessionId - Terminal session UUID (from facilitator)
 * @param {object} socket - Socket.io socket
 * @param {object} sshConfig - { host, port, username, password }
 */
function addSocket(terminalSessionId, socket, sshConfig) {
  const runtimeKey = `${terminalSessionId}:${socket.id}`;
  let entry = runtimes.get(runtimeKey);
  if (!entry) {
    entry = { ssh: null, stream: null, socket };
    runtimes.set(runtimeKey, entry);
  }

  const cleanup = () => {
    if (entry.stream) {
      try {
        entry.stream.close();
      } catch (_) {}
    }
    if (entry.ssh) {
      try {
        entry.ssh.end();
      } catch (_) {}
    }
    runtimes.delete(runtimeKey);
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
        socket.emit('data', `SSH shell error: ${err.message}\r\n`);
        socket.disconnect(true);
        runtimes.delete(runtimeKey);
        return;
      }
      entry.stream = stream;
      stream.on('data', (data) => {
        if (socket.connected)
          socket.emit(
            'data',
            typeof data === 'string' ? data : data.toString('utf8')
          );
      });
      stream.on('close', () => {
        socket.disconnect(true);
        runtimes.delete(runtimeKey);
      });
      stream.on('error', (err) => {
        if (socket.connected) socket.emit('data', `Error: ${err.message}\r\n`);
      });
    });
  });

  conn.on('error', (err) => {
    if (socket.connected)
      socket.emit('data', `SSH connection error: ${err.message}\r\n`);
    socket.disconnect(true);
    runtimes.delete(runtimeKey);
  });

  // STRICT ISOLATION: Never use shared 'remote-terminal' - must have dedicated host
  if (!sshConfig.host || sshConfig.host === 'remote-terminal') {
    console.error(
      'ISOLATION BREACH PREVENTED: Attempted to use shared SSH host',
      {
        terminalSessionId,
        sshHost: sshConfig.host,
      }
    );
    socket.emit(
      'data',
      '\r\n\x1b[1;31m[ERROR]\x1b[0m Dedicated terminal runtime required but not available.\r\n'
    );
    socket.disconnect(true);
    runtimes.delete(runtimeKey);
    return;
  }

  conn.connect({
    host: sshConfig.host,
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
