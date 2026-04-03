const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const { query } = require('@anthropic-ai/claude-agent-sdk');

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function writeJsonLine(stream, payload) {
  if (!stream || stream.destroyed || typeof stream.write !== 'function' || stream.writableEnded) {
    throw new Error('输入流已关闭。');
  }

  stream.write(`${JSON.stringify(payload)}\n`);
}

function closeStream(stream) {
  if (!stream || stream.destroyed || stream.writableEnded || typeof stream.end !== 'function') {
    return;
  }

  try {
    stream.end();
  } catch {
    // Ignore teardown races.
  }
}

function killProcess(proc, signal = 'SIGTERM') {
  if (!proc || proc.killed) {
    return;
  }

  try {
    proc.kill(signal);
  } catch {
    // Ignore teardown races.
  }
}

function createJsonLineBuffer(onMessage) {
  let buffer = '';

  return {
    flush() {
      if (!buffer.trim()) {
        return;
      }

      const line = buffer.trim();
      buffer = '';
      parseJsonLine(line, onMessage);
    },
    push(chunk) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        parseJsonLine(line, onMessage);
      }
    },
  };
}

function parseJsonLine(line, onMessage) {
  if (!line || !line.trim()) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    return;
  }

  onMessage(payload);
}

function createClaudeAgentSdkTransport(options) {
  const {
    cwd,
    env,
    executablePath,
    extraAttachmentDirs,
    model,
    onClose,
    onError,
    onEvent,
    onStderr,
    permissionMode,
    prompt,
    sessionId,
    systemPrompt,
  } = options;

  const state = {
    closed: false,
    nextApprovalRequestId: 1,
    pendingApprovals: new Map(),
    stopped: false,
  };

  const transportProcess = createVirtualProcess();
  const normalizedSystemPrompt = typeof systemPrompt === 'string' ? systemPrompt.trim() : '';
  const queryInstance = query({
    options: {
      additionalDirectories: Array.isArray(extraAttachmentDirs) && extraAttachmentDirs.length > 0
        ? extraAttachmentDirs
        : undefined,
      canUseTool: async (toolName, input, permissionOptions) => new Promise((resolve) => {
        if (state.closed) {
          resolve(buildClaudeSdkPermissionResult({
            decision: 'deny',
            input,
            toolUseId: permissionOptions?.toolUseID,
          }));
          return;
        }

        const requestId = `claude-sdk-approval-${state.nextApprovalRequestId++}`;
        const signal = permissionOptions?.signal;
        const approval = {
          abortHandler: null,
          input: input && typeof input === 'object' ? input : {},
          requestId,
          resolve,
          signal,
          suggestions: Array.isArray(permissionOptions?.suggestions) ? permissionOptions.suggestions : [],
          toolUseId: typeof permissionOptions?.toolUseID === 'string' ? permissionOptions.toolUseID : '',
        };
        approval.abortHandler = () => {
          resolvePendingClaudeSdkApproval(approval, 'deny', true);
        };

        if (signal && typeof signal.addEventListener === 'function') {
          signal.addEventListener('abort', approval.abortHandler, { once: true });
        }

        state.pendingApprovals.set(requestId, approval);
        onEvent?.(buildClaudeSdkApprovalEvent({
          description: permissionOptions?.description,
          displayName: permissionOptions?.displayName,
          input: approval.input,
          requestId,
          suggestions: approval.suggestions,
          title: permissionOptions?.title,
          toolName,
          toolUseId: approval.toolUseId,
          options: permissionOptions,
        }));
      }),
      cwd,
      env,
      includePartialMessages: true,
      model: model || undefined,
      pathToClaudeCodeExecutable: executablePath,
      permissionMode: permissionMode || 'default',
      persistSession: true,
      resume: sessionId || undefined,
      settingSources: ['user', 'project', 'local'],
      stderr(data) {
        const text = stripAnsi(data);
        if (!text.trim()) {
          return;
        }

        onStderr?.(text);
      },
      systemPrompt: normalizedSystemPrompt
        ? {
          append: normalizedSystemPrompt,
          preset: 'claude_code',
          type: 'preset',
        }
        : undefined,
    },
    prompt: typeof prompt === 'string' ? prompt : '',
  });

  streamEvents().catch((error) => {
    if (state.closed || state.stopped || isAbortLikeError(error)) {
      finalize(0);
      return;
    }

    onError?.(error);
    finalize(1);
  });

  return {
    closeInput() {
      // The SDK transport is single-turn and does not keep an open stdin channel.
    },
    kind: 'claude-agent-sdk',
    process: transportProcess,
    respondToApproval(approval, decision) {
      const pendingApproval = state.pendingApprovals.get(approval?.requestId || '');
      if (!pendingApproval) {
        throw new Error('找不到对应的 Claude 审批请求。');
      }

      resolvePendingClaudeSdkApproval(pendingApproval, decision, false);
    },
    stop() {
      if (state.closed) {
        return;
      }

      state.stopped = true;
      resolveAllPendingClaudeSdkApprovals('deny', true);

      Promise.resolve()
        .then(() => queryInstance.interrupt?.())
        .catch(() => {})
        .finally(() => {
          try {
            queryInstance.close?.();
          } catch {
            // Ignore teardown races.
          }
        });
    },
  };

  async function streamEvents() {
    try {
      for await (const event of queryInstance) {
        if (state.closed) {
          break;
        }

        onEvent?.(event);
      }

      finalize(0);
    } catch (error) {
      throw error;
    }
  }

  function resolvePendingClaudeSdkApproval(approval, decision, interrupted) {
    if (!approval || !state.pendingApprovals.has(approval.requestId)) {
      return;
    }

    state.pendingApprovals.delete(approval.requestId);
    detachClaudeSdkApprovalAbortHandler(approval);
    approval.resolve(buildClaudeSdkPermissionResult({
      decision,
      input: approval.input,
      interrupted,
      suggestions: approval.suggestions,
      toolUseId: approval.toolUseId,
    }));
  }

  function resolveAllPendingClaudeSdkApprovals(decision, interrupted) {
    for (const approval of state.pendingApprovals.values()) {
      detachClaudeSdkApprovalAbortHandler(approval);
      approval.resolve(buildClaudeSdkPermissionResult({
        decision,
        input: approval.input,
        interrupted,
        suggestions: approval.suggestions,
        toolUseId: approval.toolUseId,
      }));
    }
    state.pendingApprovals.clear();
  }

  function finalize(exitCode) {
    if (state.closed) {
      return;
    }

    state.closed = true;
    resolveAllPendingClaudeSdkApprovals('deny', true);
    onClose?.(exitCode);
  }
}

function createVirtualProcess() {
  return {
    kill() {},
    pid: 0,
    stdin: null,
  };
}

function buildClaudeSdkApprovalEvent({
  description,
  displayName,
  input,
  options,
  requestId,
  suggestions,
  title,
  toolName,
  toolUseId,
}) {
  return {
    request: {
      blocked_path: typeof options?.blockedPath === 'string' ? options.blockedPath : '',
      decision_reason: typeof options?.decisionReason === 'string' ? options.decisionReason : '',
      description: typeof description === 'string' ? description : '',
      display_name: typeof displayName === 'string' ? displayName : '',
      input: input && typeof input === 'object' ? input : {},
      permission_suggestions: Array.isArray(suggestions) ? suggestions : [],
      subtype: 'can_use_tool',
      title: typeof title === 'string' ? title : '',
      tool_name: typeof toolName === 'string' ? toolName : '',
      tool_use_id: typeof toolUseId === 'string' ? toolUseId : '',
    },
    request_id: requestId || randomUUID(),
    type: 'control_request',
  };
}

function buildClaudeSdkPermissionResult({
  decision,
  input,
  interrupted = false,
  suggestions,
  toolUseId,
}) {
  if (decision === 'deny') {
    return {
      behavior: 'deny',
      decisionClassification: 'user_reject',
      ...(interrupted ? { interrupt: true } : {}),
      message: interrupted ? 'Operation interrupted.' : 'User denied approval.',
      ...(toolUseId ? { toolUseID: toolUseId } : {}),
    };
  }

  return {
    behavior: 'allow',
    decisionClassification: decision === 'allow_always' ? 'user_permanent' : 'user_temporary',
    ...(toolUseId ? { toolUseID: toolUseId } : {}),
    updatedInput: input && typeof input === 'object' ? input : {},
    ...(decision === 'allow_always' && Array.isArray(suggestions) && suggestions.length > 0
      ? { updatedPermissions: suggestions }
      : {}),
  };
}

function detachClaudeSdkApprovalAbortHandler(approval) {
  if (!approval?.abortHandler || typeof approval?.requestId !== 'string') {
    return;
  }

  const signal = approval?.signal;
  if (signal && typeof signal.removeEventListener === 'function') {
    signal.removeEventListener('abort', approval.abortHandler);
  }
}

function isAbortLikeError(error) {
  return Boolean(
    error
    && typeof error === 'object'
    && (
      error.name === 'AbortError'
      || error.code === 'ABORT_ERR'
      || /aborted|interrupted/i.test(String(error.message || ''))
    )
  );
}

function createCodexAppServerTransport(options) {
  const {
    clientInfo,
    cwd,
    env,
    executablePath,
    onClose,
    onError,
    onEvent,
    onServerRequest,
    onStderr,
    threadParams,
    turnParams,
  } = options;

  const proc = spawn(executablePath, ['app-server', '--listen', 'stdio://'], { cwd, env });
  const state = {
    currentThreadId: typeof threadParams?.threadId === 'string' ? threadParams.threadId : '',
    currentTurnId: '',
    nextRequestId: 1,
    pendingRequests: new Map(),
    shutdownScheduled: false,
  };

  const stdoutBuffer = createJsonLineBuffer((message) => {
    handleRpcMessage(message);
  });

  proc.stdout.on('data', (chunk) => {
    stdoutBuffer.push(chunk);
  });

  proc.stderr.on('data', (chunk) => {
    const text = stripAnsi(chunk.toString());
    if (!text.trim()) {
      return;
    }

    onStderr?.(text);
  });

  proc.stdin.on('error', () => {});

  proc.on('close', (code) => {
    stdoutBuffer.flush();
    rejectPendingRequests(new Error('Codex app-server 已关闭。'));
    onClose?.(code);
  });

  proc.on('error', (error) => {
    rejectPendingRequests(error);
    onError?.(error);
  });

  start().catch((error) => {
    onError?.(error);
    killProcess(proc);
  });

  return {
    kind: 'codex-app-server',
    process: proc,
    respondToApproval(approval, decision) {
      if (!approval?.requestId) {
        throw new Error('缺少审批请求 ID。');
      }

      const response = buildCodexApprovalResponse(approval, decision);
      writeJsonLine(proc.stdin, {
        id: approval.requestId,
        result: response,
      });
    },
    stop() {
      const threadId = state.currentThreadId;
      const turnId = state.currentTurnId;
      if (threadId && turnId) {
        sendRequest('turn/interrupt', { threadId, turnId })
          .catch(() => {})
          .finally(() => killProcess(proc));
        return;
      }

      killProcess(proc);
    },
  };

  async function start() {
    await sendRequest('initialize', {
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: null,
      },
      clientInfo: clientInfo || {
        name: 'cc-desktop-proxy',
        version: '0.0.0',
      },
    });

    const threadResult = threadParams?.threadId
      ? await sendRequest('thread/resume', threadParams.resumeParams)
      : await sendRequest('thread/start', threadParams.startParams);
    if (threadResult?.thread?.id) {
      state.currentThreadId = threadResult.thread.id;
    }

    const turnResult = await sendRequest('turn/start', {
      ...turnParams,
      threadId: state.currentThreadId || turnParams.threadId,
    });
    if (turnResult?.turn?.id) {
      state.currentTurnId = turnResult.turn.id;
    }
  }

  function sendRequest(method, params) {
    const id = String(state.nextRequestId++);
    return new Promise((resolve, reject) => {
      state.pendingRequests.set(id, { reject, resolve });
      writeJsonLine(proc.stdin, {
        id,
        method,
        params,
      });
    });
  }

  function rejectPendingRequests(error) {
    for (const pending of state.pendingRequests.values()) {
      pending.reject(error);
    }
    state.pendingRequests.clear();
  }

  function handleRpcMessage(message) {
    if (Object.prototype.hasOwnProperty.call(message, 'method')) {
      if (Object.prototype.hasOwnProperty.call(message, 'id')) {
        onServerRequest?.({
          method: message.method,
          params: message.params && typeof message.params === 'object' ? message.params : {},
          requestId: String(message.id),
        });
        return;
      }

      const normalizedEvent = normalizeCodexNotification(message.method, message.params);
      if (!normalizedEvent) {
        return;
      }

      if (normalizedEvent.thread_id) {
        state.currentThreadId = normalizedEvent.thread_id;
      }
      if (normalizedEvent.turn_id) {
        state.currentTurnId = normalizedEvent.turn_id;
      }
      if (normalizedEvent.turn?.id) {
        state.currentTurnId = normalizedEvent.turn.id;
      }

      onEvent?.(normalizedEvent);

      if (normalizedEvent.type === 'turn.completed' || normalizedEvent.type === 'turn.failed') {
        scheduleShutdown();
      }
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, 'id')) {
      const pending = state.pendingRequests.get(String(message.id));
      if (!pending) {
        return;
      }

      state.pendingRequests.delete(String(message.id));
      if (message.error) {
        pending.reject(new Error(message.error.message || 'Codex app-server 请求失败。'));
        return;
      }

      pending.resolve(message.result);
    }
  }

  function scheduleShutdown() {
    if (state.shutdownScheduled) {
      return;
    }

    state.shutdownScheduled = true;
    setTimeout(() => {
      killProcess(proc);
    }, 80);
  }
}

function normalizeCodexNotification(method, params) {
  const payload = params && typeof params === 'object' ? params : {};

  if (method === 'thread/started') {
    return {
      thread: payload.thread || null,
      thread_id: payload.thread?.id || '',
      type: 'thread.started',
    };
  }

  if (method === 'turn/started') {
    return {
      thread_id: payload.threadId || '',
      turn: payload.turn || null,
      turn_id: payload.turn?.id || '',
      type: 'turn.started',
    };
  }

  if (method === 'turn/completed') {
    const turn = payload.turn || null;
    return turn?.status === 'failed'
      ? {
        error: turn?.error || null,
        thread_id: payload.threadId || '',
        turn,
        turn_id: turn?.id || '',
        type: 'turn.failed',
      }
      : {
        thread_id: payload.threadId || '',
        turn,
        turn_id: turn?.id || '',
        type: 'turn.completed',
      };
  }

  if (method === 'item/agentMessage/delta') {
    return {
      delta: typeof payload.delta === 'string' ? payload.delta : '',
      item_id: payload.itemId || '',
      thread_id: payload.threadId || '',
      turn_id: payload.turnId || '',
      type: 'agent_message_delta',
    };
  }

  if (method === 'item/started') {
    return {
      item: payload.item || null,
      thread_id: payload.threadId || '',
      turn_id: payload.turnId || '',
      type: 'item.started',
    };
  }

  if (method === 'item/completed') {
    return {
      item: payload.item || null,
      thread_id: payload.threadId || '',
      turn_id: payload.turnId || '',
      type: 'item.completed',
    };
  }

  if (method === 'error') {
    return {
      error: payload.error || null,
      thread_id: payload.threadId || '',
      turn_id: payload.turnId || '',
      type: 'error',
      willRetry: Boolean(payload.willRetry),
    };
  }

  return null;
}

function buildCodexApprovalResponse(approval, decision) {
  const method = approval?.protocolMethod || '';
  const availableDecisions = Array.isArray(approval?.availableDecisions)
    ? approval.availableDecisions
    : [];

  if (method === 'item/commandExecution/requestApproval') {
    return {
      decision: mapCodexCommandDecision(decision, availableDecisions),
    };
  }

  if (method === 'item/fileChange/requestApproval') {
    return {
      decision: mapCodexFileChangeDecision(decision, availableDecisions),
    };
  }

  throw new Error('当前审批请求不支持响应。');
}

function mapCodexCommandDecision(decision, availableDecisions) {
  if (decision === 'deny') {
    return supportsCodexDecision(availableDecisions, 'cancel') ? 'cancel' : 'decline';
  }

  if (decision === 'allow_always' && supportsCodexDecision(availableDecisions, 'acceptForSession')) {
    return 'acceptForSession';
  }

  return 'accept';
}

function mapCodexFileChangeDecision(decision, availableDecisions) {
  if (decision === 'deny') {
    return supportsCodexDecision(availableDecisions, 'cancel') ? 'cancel' : 'decline';
  }

  if (decision === 'allow_always' && supportsCodexDecision(availableDecisions, 'acceptForSession')) {
    return 'acceptForSession';
  }

  return 'accept';
}

function supportsCodexDecision(availableDecisions, targetDecision) {
  return availableDecisions.some((candidate) => {
    if (typeof candidate === 'string') {
      return candidate === targetDecision;
    }

    if (candidate && typeof candidate === 'object') {
      return Object.prototype.hasOwnProperty.call(candidate, targetDecision);
    }

    return false;
  });
}

module.exports = {
  createClaudeAgentSdkTransport,
  createCodexAppServerTransport,
};
