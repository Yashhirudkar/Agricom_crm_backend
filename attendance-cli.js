const net = require('net');

const HOST = process.argv[2] || '192.168.1.189';
const PORT = parseInt(process.argv[3], 10) || 4370;

const startTime = Date.now();
function getElapsedMs() {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  return `[${iso} | T+${now - startTime}ms]`;
}

console.log(`====================================================`);
console.log(`FORENSIC TELEMETRY INSTRUMENTATION: PHOENIX F12`);
console.log(`Target: ${HOST}:${PORT} | PID: ${process.pid}`);
console.log(`====================================================`);

function createChkSum(buf) {
  let chksum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    if (i === buf.length - 1) {
      chksum += buf[i];
    } else {
      chksum += buf.readUInt16LE(i);
    }
    chksum %= 65535;
  }
  chksum = 65535 - chksum - 1;
  return chksum;
}

function buildZkTcpPacket(command, sessionId = 0, replyId = 0, data = Buffer.from([])) {
  const buf = Buffer.alloc(8 + data.length);
  buf.writeUInt16LE(command, 0);
  buf.writeUInt16LE(0, 2);
  buf.writeUInt16LE(sessionId, 4);
  buf.writeUInt16LE(replyId, 6);
  if (data.length > 0) data.copy(buf, 8);

  const chk = createChkSum(buf);
  buf.writeUInt16LE(chk, 2);

  const prefix = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0x00, 0x00, 0x00, 0x00]);
  prefix.writeUInt16LE(buf.length, 4);

  return Buffer.concat([prefix, buf]);
}

function parseTimeToDate(time) {
  const second = time % 60;
  time = (time - second) / 60;
  const minute = time % 60;
  time = (time - minute) / 60;
  const hour = time % 24;
  time = (time - hour) / 24;
  const day = (time % 31) + 1;
  time = (time - (day - 1)) / 31;
  const month = time % 12;
  time = (time - month) / 12;
  const year = time + 2000;
  return new Date(year, month, day, hour, minute, second);
}

function parse40ByteAttRecord(buf) {
  const userSn = buf.readUInt16LE(0);
  const deviceUserId = buf.slice(2, 11).toString('ascii').replace(/\0/g, '').trim();
  const timeNum = buf.readUInt32LE(27);
  const date = parseTimeToDate(timeNum);
  return { userSn, deviceUserId, date };
}

async function runForensicInstrumentedDiagnostic() {
  const socket = new net.Socket();
  let sessionId = 0;
  let replyId = 0;
  let expectedSize = 0;
  let totalDataBuffer = Buffer.from([]);

  let timeoutGuard;

  // Telemetry Event Listeners
  socket.on('lookup', (err, address, family, host) => {
    console.log(`${getElapsedMs()} [SOCKET_LOOKUP] Host: ${host} -> IP: ${address} (Family: IPv${family})`);
  });

  socket.on('connect', () => {
    console.log(`${getElapsedMs()} [SOCKET_CONNECT] ✅ TCP Socket Established`);
    console.log(`   Local Address : ${socket.localAddress}:${socket.localPort}`);
    console.log(`   Remote Address: ${socket.remoteAddress}:${socket.remotePort}`);

    // Exact 16-byte ZK connect packet
    const connectPacket = Buffer.from('5050827d08000000e80317fcf7ff0000', 'hex');
    console.log(`${getElapsedMs()} [TX_BYTES] Length: ${connectPacket.length} bytes | Hex: ${connectPacket.toString('hex')}`);
    socket.write(connectPacket);
  });

  socket.on('data', (data) => {
    console.log(`\n${getElapsedMs()} [RX_BYTES] Length: ${data.length} bytes`);
    console.log(`   Hex Dump: ${data.toString('hex')}`);

    if (data.length >= 16 && data.compare(Buffer.from([0x50, 0x50, 0x82, 0x7d]), 0, 4, 0, 4) === 0) {
      const payload = data.slice(8);
      const commandId = payload.readUInt16LE(0);
      const respSessionId = payload.readUInt16LE(4);
      const respReplyId = payload.readUInt16LE(6);

      console.log(`   Parsed ZK TCP Header -> CmdID: ${commandId}, SessionID: ${respSessionId}, ReplyID: ${respReplyId}`);

      if (commandId === 2000 && sessionId === 0) {
        sessionId = respSessionId;
        replyId = respReplyId;
        console.log(`${getElapsedMs()} ✅ ZK Handshake ACK OK! Session ID: ${sessionId}`);

        replyId++;
        const attLogTypeBuf = Buffer.from([0x0d, 0x00, 0x00, 0x00]);
        const reqPacket = buildZkTcpPacket(1500, sessionId, replyId, attLogTypeBuf);
        console.log(`${getElapsedMs()} [TX_BYTES] Length: ${reqPacket.length} bytes | Hex: ${reqPacket.toString('hex')}`);
        socket.write(reqPacket);
        return;
      }

      if (commandId === 1503) {
        const sizeBuf = payload.slice(8, 12);
        expectedSize = sizeBuf.readUInt32LE(0);
        console.log(`${getElapsedMs()} ✅ Device prepared data! Expected size: ${expectedSize} bytes`);

        replyId++;
        const chunkReqData = Buffer.alloc(8);
        chunkReqData.writeUInt32LE(0, 0);
        chunkReqData.writeUInt32LE(expectedSize, 4);

        const chunkPacket = buildZkTcpPacket(1504, sessionId, replyId, chunkReqData);
        console.log(`${getElapsedMs()} [TX_BYTES] Length: ${chunkPacket.length} bytes | Hex: ${chunkPacket.toString('hex')}`);
        socket.write(chunkPacket);
        return;
      }

      if (commandId === 1500) {
        const chunkData = payload.slice(8);
        console.log(`${getElapsedMs()} Chunk payload segment received: ${chunkData.length} bytes`);
        totalDataBuffer = Buffer.concat([totalDataBuffer, chunkData]);
      }
    } else if (data.toString('hex') === '5aa5010000000001') {
      console.log(`${getElapsedMs()} ⚠️ REALTIME OEM STATUS PACKET RECEIVED: 5aa5010000000001`);
      console.log(`   Releasing hardware session via CMD_EXIT 1001...`);
      clearTimeout(timeoutGuard);
      const exitPkt = Buffer.from('5050827d08000000e903000000000000', 'hex');
      socket.write(exitPkt, () => {
        try { socket.end(); } catch (_) {}
      });
    } else {
      totalDataBuffer = Buffer.concat([totalDataBuffer, data]);
      console.log(`${getElapsedMs()} Data stream accumulated: ${totalDataBuffer.length} / ${expectedSize} bytes`);
    }

    if (expectedSize > 0 && totalDataBuffer.length >= expectedSize) {
      console.log(`\n${getElapsedMs()} 🎉 ALL ${totalDataBuffer.length} BYTES RECEIVED!`);
      clearTimeout(timeoutGuard);
      replyId++;
      const exitPacket = buildZkTcpPacket(1001, sessionId, replyId);
      socket.write(exitPacket, () => {
        try { socket.end(); } catch (_) {}
      });
    }
  });

  socket.on('end', () => {
    console.log(`${getElapsedMs()} [TCP_FIN_RECEIVED] Remote server sent FIN packet (Graceful close)`);
  });

  socket.on('close', (hadError) => {
    clearTimeout(timeoutGuard);
    console.log(`\n====================================================`);
    console.log(`${getElapsedMs()} [SOCKET_CLOSE] Closed. Had Error: ${hadError}`);
    console.log(`RAW HARDWARE DATA BUFFER (${totalDataBuffer.length} bytes): ${totalDataBuffer.toString('hex')}`);
    console.log(`====================================================`);

    if (totalDataBuffer.length > 0) {
      console.log(`\n--- Decoding Attendance Records ---`);
      let offset = 4;
      let count = 0;
      while (offset + 40 <= totalDataBuffer.length) {
        try {
          const rec = parse40ByteAttRecord(totalDataBuffer.slice(offset, offset + 40));
          console.log(`   📌 Log #${++count} -> Device User ID: ${rec.deviceUserId}, Timestamp: ${rec.date.toLocaleString()}`);
          offset += 40;
        } catch (e) {
          break;
        }
      }
    }
  });

  socket.on('error', (err) => {
    console.log(`${getElapsedMs()} [SOCKET_ERROR / TCP_RST] ${err.message}`);
  });

  console.log(`${getElapsedMs()} Initiating TCP connection to ${HOST}:${PORT}...`);
  socket.connect(PORT, HOST);

  timeoutGuard = setTimeout(() => {
    console.log(`${getElapsedMs()} [TIMEOUT_GUARD] 10s elapsed. Destroying socket...`);
    socket.destroy();
  }, 10000);
}

runForensicInstrumentedDiagnostic();
