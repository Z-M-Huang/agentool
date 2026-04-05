#!/usr/bin/env node
/**
 * Mock LSP server that returns errors for hover requests.
 * Used to test error handling paths in lsp.test.ts.
 */

let buffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  processMessages();
});

function processMessages() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const headerStr = buffer.subarray(0, headerEnd).toString();
    const match = /Content-Length:\s*(\d+)/i.exec(headerStr);
    if (!match) break;
    const bodyStart = headerEnd + 4;
    const contentLength = parseInt(match[1], 10);
    if (bodyStart + contentLength > buffer.length) break;
    const bodyStr = buffer.subarray(bodyStart, bodyStart + contentLength).toString();
    buffer = buffer.subarray(bodyStart + contentLength);
    try {
      const msg = JSON.parse(bodyStr);
      handleMessage(msg);
    } catch { /* skip */ }
  }
}

function handleMessage(msg) {
  if (msg.method === 'initialize') {
    sendResponse(msg.id, { capabilities: {} });
  } else if (msg.method === 'initialized' || msg.method === 'textDocument/didOpen') {
    // notifications, no response
  } else if (msg.method === 'textDocument/hover') {
    sendError(msg.id, -32600, 'Mock server error');
  } else if (msg.method === 'textDocument/prepareCallHierarchy') {
    // Return a valid call hierarchy item so the second call is attempted
    sendResponse(msg.id, [{ name: 'fn', kind: 12, uri: 'file:///m.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }]);
  } else if (msg.method === 'callHierarchy/incomingCalls' || msg.method === 'callHierarchy/outgoingCalls') {
    sendError(msg.id, -32601, 'Call hierarchy error');
  } else if (msg.method === 'shutdown') {
    sendResponse(msg.id, null);
  } else if (msg.method === 'exit') {
    process.exit(0);
  } else if (msg.id !== undefined) {
    sendResponse(msg.id, null);
  }
}

function sendResponse(id, result) {
  const body = JSON.stringify({ jsonrpc: '2.0', id, result });
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  process.stdout.write(header + body);
}

function sendError(id, code, message) {
  const body = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  process.stdout.write(header + body);
}
