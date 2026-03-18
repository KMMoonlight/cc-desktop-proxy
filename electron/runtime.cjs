const { randomUUID } = require('crypto');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { app, BrowserWindow, dialog, ipcMain } = require('electron');

const CONFIG_FILE_NAME = 'claude-desktop-config.json';
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const EMPTY_ASSISTANT_TEXT = '（本轮没有收到可展示的文本输出）';
const SCHEMA_VERSION = 2;
const SAVE_DEBOUNCE_MS = 160;
const CLAUDE_CHECK_TTL_MS = 30_000;
const STDERR_BUFFER_LIMIT = 6000;

const BUILTIN_TOOL_NAMES = new Set([
  'Task',
  'TaskOutput',
  'Bash',
  'Glob',
  'Grep',
  'Read',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'EnterPlanMode',
  'ExitPlanMode',
  'EnterWorktree',
  'ExitWorktree',
  'AskUserQuestion',
  'TaskStop',
  'Skill',
  'Agent',
]);

class ClaudeDesktopRuntime {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILE_NAME);
    this.defaultPickerPath = path.resolve(process.cwd());
    this.handlersRegistered = false;
    this.saveTimer = null;
    this.claudeInfo = {
      available: null,
      checkedAt: 0,
      version: '',
    };

    this.store = this.loadStore();
    this.windowRuns = new Map();
    this.refreshClaudeInfo(true);
  }

  registerIpc() {
    if (this.handlersRegistered) {
      return;
    }

    ipcMain.handle('desktop:get-app-state', () => this.getAppState());
    ipcMain.handle('desktop:pick-workspace', (event) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      return this.pickWorkspaceDirectory(browserWindow);
    });
    ipcMain.handle('desktop:add-workspace', (_event, workspacePath) => this.addWorkspace(workspacePath));
    ipcMain.handle('desktop:create-session', (_event, workspaceId) => this.createSession(workspaceId));
    ipcMain.handle('desktop:select-workspace', (_event, workspaceId) => this.selectWorkspace(workspaceId));
    ipcMain.handle('desktop:select-session', (_event, payload) => this.selectSession(payload?.workspaceId, payload?.sessionId));
    ipcMain.handle('desktop:send-message', (event, payload) => this.sendMessage(event.sender, payload));
    ipcMain.handle('desktop:stop-run', (event) => this.stopRun(event.sender));

    this.handlersRegistered = true;
  }

  getAppState() {
    this.refreshClaudeInfo();

    const selectedWorkspace = this.getSelectedWorkspace();
    const selectedSession = this.getSelectedSession();
    const activeRun = Array.from(this.windowRuns.values()).find((run) => run.process);

    return {
      claude: {
        available: Boolean(this.claudeInfo.available),
        busy: Boolean(activeRun),
        version: this.claudeInfo.version,
      },
      platform: process.platform,
      selectedSessionId: this.store.selectedSessionId,
      selectedWorkspaceId: this.store.selectedWorkspaceId,
      workspaces: this.store.workspaces
        .slice()
        .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))
        .map((workspace) => serializeWorkspace(workspace, activeRun)),
      activeSession: selectedWorkspace && selectedSession
        ? serializeSession(selectedWorkspace, selectedSession, activeRun)
        : null,
    };
  }

  async pickWorkspaceDirectory(browserWindow) {
    const result = await dialog.showOpenDialog(browserWindow, {
      buttonLabel: '选择工作目录',
      defaultPath: this.getSelectedWorkspace()?.path || this.defaultPickerPath,
      properties: ['openDirectory', 'createDirectory'],
      title: '添加 Claude Code 工作目录',
    });

    if (result.canceled || !result.filePaths.length) {
      return null;
    }

    return result.filePaths[0];
  }

  addWorkspace(rawWorkspacePath) {
    const workspacePath = this.resolveWorkspacePath(rawWorkspacePath);
    this.assertDirectory(workspacePath);

    const existingWorkspace = this.store.workspaces.find((workspace) => workspace.path === workspacePath);
    if (existingWorkspace) {
      this.store.selectedWorkspaceId = existingWorkspace.id;
      this.store.selectedSessionId = getLatestSession(existingWorkspace)?.id || null;
      this.touchWorkspace(existingWorkspace);
      this.scheduleSave();
      return this.getAppState();
    }

    const now = new Date().toISOString();
    const workspace = {
      createdAt: now,
      id: randomUUID(),
      name: path.basename(workspacePath) || workspacePath,
      path: workspacePath,
      sessions: [],
      updatedAt: now,
    };

    this.store.workspaces.push(workspace);
    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = null;
    this.scheduleSave();

    return this.getAppState();
  }

  createSession(workspaceId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const now = new Date().toISOString();
    const session = {
      claudeSessionId: null,
      createdAt: now,
      id: randomUUID(),
      messages: [],
      model: '',
      status: 'idle',
      title: `新对话 ${formatShortTime(now)}`,
      updatedAt: now,
    };

    workspace.sessions.unshift(session);
    this.touchWorkspace(workspace, now);
    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;
    this.scheduleSave();

    return this.getAppState();
  }

  selectWorkspace(workspaceId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = getLatestSession(workspace)?.id || null;
    this.scheduleSave();

    return this.getAppState();
  }

  selectSession(workspaceId, sessionId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const session = workspace.sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error('找不到对应的历史对话。');
    }

    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;
    this.scheduleSave();

    return this.getAppState();
  }

  async sendMessage(webContents, payload) {
    const workspace = this.findWorkspace(payload?.workspaceId || this.store.selectedWorkspaceId);
    if (!workspace) {
      throw new Error('请先选择一个工作目录。');
    }

    const session = workspace.sessions.find((item) => item.id === (payload?.sessionId || this.store.selectedSessionId));
    if (!session) {
      throw new Error('请先新建一个对话。');
    }

    const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
    if (!prompt) {
      throw new Error('消息内容不能为空。');
    }

    this.refreshClaudeInfo(true);
    if (!this.claudeInfo.available) {
      throw new Error('未检测到可用的 Claude Code CLI。');
    }

    const runState = this.getRunState(webContents.id);
    if (runState.process) {
      throw new Error('当前已有正在运行的 Claude 任务，请等待完成或先停止。');
    }

    this.assertDirectory(workspace.path);

    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;

    const now = new Date().toISOString();
    const userMessage = createStoredMessage({
      content: prompt,
      createdAt: now,
      role: 'user',
    });
    runState.assistantMessageId = null;
    runState.currentAssistantText = '';
    runState.stderrBuffer = '';
    runState.seenToolResultIds.clear();
    runState.seenToolUseIds.clear();
    runState.sessionId = session.id;
    runState.workspaceId = workspace.id;

    const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
    if (session.claudeSessionId) {
      args.push('--resume', session.claudeSessionId);
    }

    const proc = spawn(CLAUDE_BIN, args, {
      cwd: workspace.path,
      env: { ...process.env },
    });

    session.messages.push(userMessage);
    session.status = 'running';
    session.updatedAt = now;
    session.model = session.model || '';

    if (isDefaultSessionTitle(session.title) && countRoleMessages(session.messages, 'user') === 1) {
      session.title = createSessionTitleFromPrompt(prompt);
    }

    runState.process = proc;
    this.touchWorkspace(workspace, now);
    this.scheduleSave();
    this.emitState(webContents);

    let buffer = '';

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        this.processLine(webContents, line);
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = stripAnsi(chunk.toString());
      if (!text.trim()) {
        return;
      }

      runState.stderrBuffer = truncateText(`${runState.stderrBuffer}${text}`, STDERR_BUFFER_LIMIT);
    });

    proc.on('close', (code) => {
      if (buffer.trim()) {
        this.processLine(webContents, buffer);
      }

      const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
      if (sessionRef) {
        let assistant = this.getAssistantMessage(sessionRef.session, runState);
        if (!assistant && code === 0 && !this.hasRecentErrorEvent(sessionRef.session)) {
          assistant = this.ensureAssistantMessage(sessionRef.session, runState, new Date().toISOString());
          assistant.content = EMPTY_ASSISTANT_TEXT;
        }

        if (assistant) {
          const hadContent = Boolean(assistant.content);
          assistant.streaming = false;
          assistant.content = assistant.content || EMPTY_ASSISTANT_TEXT;
          assistant.error = code !== 0 && !hadContent;
        }

        if (code !== 0 && !this.hasRecentErrorEvent(sessionRef.session)) {
          this.appendEventMessage(sessionRef.workspace, sessionRef.session, {
            kind: 'error',
            status: 'error',
            title: 'Claude 运行失败',
            content: formatProcessFailure(code, runState.stderrBuffer),
          });
        }

        sessionRef.session.status = code === 0 ? 'idle' : 'error';
        sessionRef.session.updatedAt = new Date().toISOString();
        this.touchWorkspace(sessionRef.workspace, sessionRef.session.updatedAt);
      }

      runState.assistantMessageId = null;
      runState.currentAssistantText = '';
      runState.process = null;
      runState.sessionId = null;
      runState.workspaceId = null;
      runState.stderrBuffer = '';
      runState.seenToolResultIds.clear();
      runState.seenToolUseIds.clear();

      this.scheduleSave();
      this.emitState(webContents);
    });

    proc.on('error', (error) => {
      const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
      if (sessionRef) {
        this.appendEventMessage(sessionRef.workspace, sessionRef.session, {
          kind: 'error',
          status: 'error',
          title: 'Claude 启动失败',
          content: formatProcessFailure(null, `${error.message}\n${runState.stderrBuffer}`),
        });

        const assistant = this.getAssistantMessage(sessionRef.session, runState);
        if (assistant) {
          assistant.streaming = false;
          assistant.error = true;
          assistant.content = `错误: ${error.message}`;
        }

        sessionRef.session.status = 'error';
        sessionRef.session.updatedAt = new Date().toISOString();
        this.touchWorkspace(sessionRef.workspace, sessionRef.session.updatedAt);
      }

      runState.assistantMessageId = null;
      runState.currentAssistantText = '';
      runState.process = null;
      runState.sessionId = null;
      runState.workspaceId = null;
      runState.stderrBuffer = '';
      runState.seenToolResultIds.clear();
      runState.seenToolUseIds.clear();

      this.scheduleSave();
      this.emitState(webContents);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    return { ok: true };
  }

  stopRun(webContents) {
    const runState = this.getRunState(webContents.id);
    if (!runState.process) {
      return this.getAppState();
    }

    const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
    if (sessionRef) {
      const assistant = this.getAssistantMessage(sessionRef.session, runState)
        || this.ensureAssistantMessage(sessionRef.session, runState, new Date().toISOString());
      if (assistant) {
        assistant.streaming = false;
        assistant.content = assistant.content || '（运行已停止）';
      }

      sessionRef.session.status = 'idle';
      sessionRef.session.updatedAt = new Date().toISOString();
      this.touchWorkspace(sessionRef.workspace, sessionRef.session.updatedAt);
    }

    runState.process.kill('SIGTERM');
    runState.process = null;
    runState.workspaceId = null;
    runState.sessionId = null;
    runState.assistantMessageId = null;
    runState.currentAssistantText = '';
    runState.stderrBuffer = '';
    runState.seenToolUseIds.clear();
    runState.seenToolResultIds.clear();

    this.scheduleSave();
    this.emitState(webContents);

    return this.getAppState();
  }

  disposeWindow(contentsId) {
    const runState = this.windowRuns.get(contentsId);
    if (runState?.process) {
      const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
      if (sessionRef) {
        const assistant = this.getAssistantMessage(sessionRef.session, runState)
          || this.ensureAssistantMessage(sessionRef.session, runState, new Date().toISOString());
        if (assistant) {
          assistant.streaming = false;
          assistant.content = assistant.content || '（应用关闭时本轮运行被终止）';
        }
        sessionRef.session.status = 'idle';
      }

      runState.process.kill('SIGTERM');
    }
    this.windowRuns.delete(contentsId);
  }

  disposeAll() {
    for (const contentsId of Array.from(this.windowRuns.keys())) {
      this.disposeWindow(contentsId);
    }

    this.flushSave();
  }

  processLine(webContents, line) {
    if (!line.trim()) {
      return;
    }

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    const runState = this.getRunState(webContents.id);
    const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
    if (!sessionRef) {
      return;
    }

    this.handleClaudeEvent(sessionRef.workspace, sessionRef.session, runState, event);
    this.scheduleSave();
    this.emitState(webContents);
  }

  handleClaudeEvent(workspace, session, runState, event) {
    const now = new Date().toISOString();

    if (event.session_id && event.session_id !== session.claudeSessionId) {
      session.claudeSessionId = event.session_id;
      session.updatedAt = now;
    }

    if (event.type === 'system') {
      this.handleSystemEvent(workspace, session, event);
      return;
    }

    if (event.type === 'stream_event') {
      this.handleStreamEvent(workspace, session, runState, event.event);
      return;
    }

    if (event.type === 'assistant') {
      this.handleAssistantEvent(workspace, session, runState, event);
      return;
    }

    if (event.type === 'user') {
      this.handleUserEvent(workspace, session, runState, event);
      return;
    }

    if (event.type === 'result') {
      const assistant = this.getAssistantMessage(session, runState)
        || (!event.is_error
          ? this.ensureAssistantMessage(session, runState, now)
          : null);
      if (assistant) {
        assistant.streaming = false;
        assistant.content = event.result || assistant.content || EMPTY_ASSISTANT_TEXT;
        assistant.error = Boolean(event.is_error);
      }

      session.status = event.is_error ? 'error' : 'idle';
      session.updatedAt = now;
      this.touchWorkspace(workspace, now);

      if (event.is_error) {
        this.appendEventMessage(workspace, session, {
          kind: 'error',
          status: 'error',
          title: 'Claude 返回错误',
          content: formatClaudeError(event, runState.stderrBuffer),
        });
      }
    }
  }

  handleSystemEvent(workspace, session, event) {
    const now = new Date().toISOString();

    if (event.subtype === 'init') {
      session.model = event.model || session.model;
      session.updatedAt = now;
      this.touchWorkspace(workspace, now);
      return;
    }

    if (event.subtype === 'task_started') {
      this.appendEventMessage(workspace, session, {
        kind: 'agent',
        status: 'running',
        title: '子代理任务已启动',
        content: event.description || event.prompt || 'Claude 启动了一个本地 Agent 来处理当前步骤。',
      });
      return;
    }

    if (event.subtype === 'task_notification') {
      this.appendEventMessage(workspace, session, {
        kind: 'agent',
        status: event.status === 'completed' ? 'completed' : 'info',
        title: event.status === 'completed' ? '子代理任务已完成' : '子代理状态更新',
        content: event.summary || formatTaskUsage(event.usage),
      });
    }
  }

  handleStreamEvent(workspace, session, runState, streamEvent) {
    if (!streamEvent?.type) {
      return;
    }

    if (streamEvent.type === 'content_block_start') {
      const block = streamEvent.content_block;

      if (block?.type === 'tool_use') {
        this.emitToolUse(workspace, session, runState, block);
        return;
      }

      if (block?.type === 'text' && block.text) {
        this.updateAssistantMessage(session, runState, block.text, false);
      }
      return;
    }

    if (streamEvent.type === 'content_block_delta') {
      if (streamEvent.delta?.type === 'text_delta' && streamEvent.delta.text) {
        runState.currentAssistantText += streamEvent.delta.text;
        this.updateAssistantMessage(session, runState, runState.currentAssistantText, false);
        return;
      }
    }
  }

  handleAssistantEvent(workspace, session, runState, event) {
    const content = Array.isArray(event.message?.content) ? event.message.content : [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        this.emitToolUse(workspace, session, runState, block);
      }
    }

    const assistantText = extractTextBlocks(content);
    if (assistantText) {
      this.updateAssistantMessage(session, runState, assistantText, event.message?.stop_reason === 'end_turn');
    }
  }

  handleUserEvent(workspace, session, runState, event) {
    const content = Array.isArray(event.message?.content) ? event.message.content : [];

    if (event.parent_tool_use_id) {
      const forwardedText = extractTextBlocks(content);
      if (forwardedText) {
        this.appendEventMessage(workspace, session, {
          kind: 'agent',
          status: 'info',
          title: '已向子代理下发任务',
          content: truncateText(forwardedText, 220),
        });
      }
    }

    for (const block of content) {
      if (block.type !== 'tool_result') {
        continue;
      }

      if (runState.seenToolResultIds.has(block.tool_use_id)) {
        continue;
      }

      runState.seenToolResultIds.add(block.tool_use_id);

      this.appendEventMessage(workspace, session, {
        kind: 'tool_result',
        status: block.is_error ? 'error' : 'completed',
        title: block.is_error ? '工具执行失败' : '工具结果已返回',
        content: summarizeToolResult(block, event.tool_use_result),
      });
    }
  }

  emitToolUse(workspace, session, runState, block) {
    if (!block?.id || runState.seenToolUseIds.has(block.id)) {
      return;
    }

    runState.seenToolUseIds.add(block.id);

    const toolClassification = classifyTool(block.name);
    this.appendEventMessage(workspace, session, {
      kind: toolClassification.kind,
      status: 'running',
      title: toolClassification.title,
      content: summarizeToolInput(block.name, block.input),
    });
  }

  updateAssistantMessage(session, runState, text, isFinal) {
    const assistant = this.ensureAssistantMessage(session, runState, new Date().toISOString());
    if (!assistant) {
      return;
    }

    runState.currentAssistantText = text;
    assistant.content = text;
    assistant.streaming = !isFinal;
    assistant.error = false;
    session.updatedAt = new Date().toISOString();
  }

  getAssistantMessage(session, runState) {
    if (!runState.assistantMessageId) {
      return null;
    }

    return session.messages.find((message) => message.id === runState.assistantMessageId) || null;
  }

  ensureAssistantMessage(session, runState, createdAt) {
    const existingAssistant = this.getAssistantMessage(session, runState);
    if (existingAssistant) {
      return existingAssistant;
    }

    const assistantMessage = createStoredMessage({
      content: '',
      createdAt,
      role: 'assistant',
      streaming: true,
    });

    session.messages.push(assistantMessage);
    runState.assistantMessageId = assistantMessage.id;
    return assistantMessage;
  }

  appendEventMessage(workspace, session, partial) {
    const now = partial.createdAt || new Date().toISOString();
    const lastMessage = session.messages[session.messages.length - 1];

    if (
      lastMessage &&
      lastMessage.role === 'event' &&
      lastMessage.kind === partial.kind &&
      lastMessage.status === partial.status &&
      lastMessage.title === partial.title &&
      partial.status === 'running'
    ) {
      lastMessage.content = partial.content;
      lastMessage.createdAt = now;
    } else {
      session.messages.push(createEventMessage({ ...partial, createdAt: now }));
    }

    session.updatedAt = now;
    this.touchWorkspace(workspace, now);
  }

  getRunState(contentsId) {
    if (!this.windowRuns.has(contentsId)) {
      this.windowRuns.set(contentsId, {
        assistantMessageId: null,
        currentAssistantText: '',
        process: null,
        seenToolResultIds: new Set(),
        seenToolUseIds: new Set(),
        sessionId: null,
        stderrBuffer: '',
        workspaceId: null,
      });
    }

    return this.windowRuns.get(contentsId);
  }

  emitState(webContents) {
    if (!webContents || webContents.isDestroyed()) {
      return;
    }

    webContents.send('claude:event', {
      state: this.getAppState(),
      type: 'state',
    });
  }

  getSelectedWorkspace() {
    return this.findWorkspace(this.store.selectedWorkspaceId);
  }

  getSelectedSession() {
    const workspace = this.getSelectedWorkspace();
    if (!workspace) {
      return null;
    }

    return workspace.sessions.find((session) => session.id === this.store.selectedSessionId) || null;
  }

  findWorkspace(workspaceId) {
    return this.store.workspaces.find((workspace) => workspace.id === workspaceId) || null;
  }

  findSessionByIds(workspaceId, sessionId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      return null;
    }

    const session = workspace.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return null;
    }

    return { session, workspace };
  }

  touchWorkspace(workspace, timestamp = new Date().toISOString()) {
    workspace.updatedAt = timestamp;
  }

  refreshClaudeInfo(force = false) {
    const now = Date.now();
    if (!force && this.claudeInfo.checkedAt && now - this.claudeInfo.checkedAt < CLAUDE_CHECK_TTL_MS) {
      return this.claudeInfo;
    }

    try {
      const result = spawnSync(CLAUDE_BIN, ['--version'], {
        encoding: 'utf8',
      });

      const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
      this.claudeInfo = {
        available: result.status === 0,
        checkedAt: now,
        version: output || 'unknown',
      };
    } catch {
      this.claudeInfo = {
        available: false,
        checkedAt: now,
        version: '',
      };
    }

    return this.claudeInfo;
  }

  loadStore() {
    const emptyStore = {
      schemaVersion: SCHEMA_VERSION,
      selectedSessionId: null,
      selectedWorkspaceId: null,
      workspaces: [],
    };

    if (!fs.existsSync(this.configPath)) {
      return emptyStore;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(content);

      if (parsed?.workspaceDir) {
        const migratedPath = this.resolveWorkspacePath(parsed.workspaceDir);
        const migratedWorkspace = {
          createdAt: new Date().toISOString(),
          id: randomUUID(),
          name: path.basename(migratedPath) || migratedPath,
          path: migratedPath,
          sessions: [],
          updatedAt: new Date().toISOString(),
        };

        return {
          schemaVersion: SCHEMA_VERSION,
          selectedSessionId: null,
          selectedWorkspaceId: migratedWorkspace.id,
          workspaces: [migratedWorkspace],
        };
      }

      if (!Array.isArray(parsed?.workspaces)) {
        return emptyStore;
      }

      const workspaces = parsed.workspaces
        .map((workspace) => normalizeWorkspace(workspace))
        .filter(Boolean);

      const selectedWorkspaceId = workspaces.some((workspace) => workspace.id === parsed.selectedWorkspaceId)
        ? parsed.selectedWorkspaceId
        : workspaces[0]?.id || null;

      const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || null;
      const selectedSessionId = selectedWorkspace?.sessions.some((session) => session.id === parsed.selectedSessionId)
        ? parsed.selectedSessionId
        : selectedWorkspace?.sessions[0]?.id || null;

      return {
        schemaVersion: SCHEMA_VERSION,
        selectedSessionId,
        selectedWorkspaceId,
        workspaces,
      };
    } catch (error) {
      console.warn(`Failed to load desktop config from ${this.configPath}: ${error.message}`);
      return emptyStore;
    }
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  flushSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;

    const payload = {
      schemaVersion: SCHEMA_VERSION,
      selectedSessionId: this.store.selectedSessionId,
      selectedWorkspaceId: this.store.selectedWorkspaceId,
      workspaces: this.store.workspaces,
    };

    fs.writeFileSync(this.configPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  resolveWorkspacePath(input) {
    if (!input || typeof input !== 'string') {
      return this.defaultPickerPath;
    }

    const trimmed = input.trim();
    const expanded = trimmed.startsWith('~')
      ? path.join(os.homedir(), trimmed.slice(1))
      : trimmed;

    return path.resolve(expanded);
  }

  assertDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`目录不存在: ${directoryPath}`);
    }

    const stats = fs.statSync(directoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`路径不是文件夹: ${directoryPath}`);
    }
  }
}

function normalizeWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    return null;
  }

  const createdAt = workspace.createdAt || new Date().toISOString();
  const updatedAt = workspace.updatedAt || createdAt;

  return {
    createdAt,
    id: workspace.id || randomUUID(),
    name: workspace.name || path.basename(workspace.path || '') || '未命名目录',
    path: typeof workspace.path === 'string' ? workspace.path : '',
    sessions: Array.isArray(workspace.sessions)
      ? workspace.sessions.map((session) => normalizeSession(session)).filter(Boolean)
      : [],
    updatedAt,
  };
}

function normalizeSession(session) {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const createdAt = session.createdAt || new Date().toISOString();
  const updatedAt = session.updatedAt || createdAt;

  return {
    claudeSessionId: session.claudeSessionId || null,
    createdAt,
    id: session.id || randomUUID(),
    messages: Array.isArray(session.messages)
      ? session.messages.map((message) => normalizeMessage(message)).filter(Boolean)
      : [],
    model: session.model || '',
    status: session.status === 'running' ? 'idle' : (session.status || 'idle'),
    title: session.title || `新对话 ${formatShortTime(createdAt)}`,
    updatedAt,
  };
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  return {
    content: typeof message.content === 'string' ? message.content : '',
    createdAt: message.createdAt || new Date().toISOString(),
    error: Boolean(message.error),
    id: message.id || randomUUID(),
    kind: message.kind || null,
    role: message.role || 'event',
    status: message.status || null,
    streaming: false,
    title: message.title || '',
  };
}

function serializeWorkspace(workspace, activeRun) {
  const sessionMetas = workspace.sessions
    .slice()
    .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))
    .map((session) => serializeSessionMeta(workspace, session, activeRun));

  return {
    createdAt: workspace.createdAt,
    exists: directoryExists(workspace.path),
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    sessions: sessionMetas,
    updatedAt: workspace.updatedAt,
  };
}

function serializeSession(workspace, session, activeRun) {
  return {
    claudeSessionId: session.claudeSessionId,
    createdAt: session.createdAt,
    id: session.id,
    isRunning: Boolean(
      activeRun &&
      activeRun.workspaceId === workspace.id &&
      activeRun.sessionId === session.id &&
      activeRun.process,
    ),
    messages: session.messages,
    model: session.model,
    path: workspace.path,
    status: session.status,
    title: session.title,
    updatedAt: session.updatedAt,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  };
}

function serializeSessionMeta(workspace, session, activeRun) {
  const previewSource = getLatestPreviewMessage(session.messages);

  return {
    claudeSessionId: session.claudeSessionId,
    id: session.id,
    isRunning: Boolean(
      activeRun &&
      activeRun.workspaceId === workspace.id &&
      activeRun.sessionId === session.id &&
      activeRun.process,
    ),
    messageCount: session.messages.filter((message) => message.role !== 'event').length,
    preview: previewSource ? truncateText(previewSource.content, 80) : '还没有消息',
    status: session.status,
    title: session.title,
    updatedAt: session.updatedAt,
  };
}

function createStoredMessage(partial) {
  return {
    content: '',
    createdAt: new Date().toISOString(),
    error: false,
    id: randomUUID(),
    role: 'assistant',
    streaming: false,
    ...partial,
  };
}

function createEventMessage(partial) {
  return {
    content: '',
    createdAt: new Date().toISOString(),
    id: randomUUID(),
    kind: 'status',
    role: 'event',
    status: 'info',
    title: '',
    ...partial,
  };
}

function createSessionTitleFromPrompt(prompt) {
  const sanitized = prompt.replace(/\s+/g, ' ').trim();
  return truncateText(sanitized, 26) || `新对话 ${formatShortTime(new Date().toISOString())}`;
}

function isDefaultSessionTitle(title) {
  return typeof title === 'string' && title.startsWith('新对话 ');
}

function countRoleMessages(messages, role) {
  return messages.filter((message) => message.role === role).length;
}

function classifyTool(name) {
  if (name === 'Skill') {
    return {
      kind: 'skill',
      title: '正在使用 Skill',
    };
  }

  if (name === 'Agent' || name === 'Task') {
    return {
      kind: 'agent',
      title: '正在启动子代理',
    };
  }

  if (typeof name === 'string' && (name.startsWith('mcp__') || (!BUILTIN_TOOL_NAMES.has(name) && name.includes('__')))) {
    return {
      kind: 'mcp',
      title: `正在调用 MCP ${name}`,
    };
  }

  return {
    kind: 'tool',
    title: `正在调用 ${name}`,
  };
}

function extractTextBlocks(content) {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

function summarizeToolInput(name, input) {
  if (!input) {
    return 'Claude 已发起工具调用。';
  }

  if (name === 'Bash' && input.command) {
    return truncateText(input.command, 1200);
  }

  if ((name === 'Agent' || name === 'Task') && (input.description || input.prompt)) {
    return truncateText(input.description || input.prompt, 800);
  }

  if (name === 'Skill') {
    return truncateText(input.skill_name || input.command || stringifyValue(input), 800);
  }

  return truncateText(stringifyValue(input), 1200);
}

function summarizeToolResult(block, toolUseResult) {
  if (toolUseResult?.stdout) {
    return truncateText(toolUseResult.stdout, 1600);
  }

  if (toolUseResult?.stderr) {
    return truncateText(toolUseResult.stderr, 1600);
  }

  if (Array.isArray(block.content)) {
    const firstText = block.content.find((item) => item.type === 'text' && item.text);
    if (firstText?.text) {
      return truncateText(firstText.text, 1600);
    }
  }

  if (typeof block.content === 'string') {
    return truncateText(block.content, 1600);
  }

  return block.is_error ? '工具返回了错误。' : '工具执行完成。';
}

function formatTaskUsage(usage) {
  if (!usage) {
    return '子代理已更新状态。';
  }

  const duration = typeof usage.duration_ms === 'number' ? `${(usage.duration_ms / 1000).toFixed(1)}s` : null;
  const toolUses = typeof usage.tool_uses === 'number' ? `${usage.tool_uses} 次工具` : null;
  const totalTokens = typeof usage.total_tokens === 'number' ? `${usage.total_tokens} tokens` : null;

  return [duration, toolUses, totalTokens].filter(Boolean).join(' · ') || '子代理已更新状态。';
}

function formatResultMeta(event) {
  const duration = typeof event.duration_ms === 'number' ? `${(event.duration_ms / 1000).toFixed(1)}s` : null;
  const cost = typeof event.total_cost_usd === 'number' ? `$${event.total_cost_usd.toFixed(4)}` : null;
  const reason = event.stop_reason ? `stop: ${event.stop_reason}` : null;

  return [duration, cost, reason].filter(Boolean).join(' · ') || '本轮输出已完成。';
}

function formatClaudeError(event, stderrBuffer) {
  const parts = [
    event?.result,
    formatResultMeta(event),
    stderrBuffer,
  ].filter(Boolean);

  return truncateText(parts.join('\n\n'), STDERR_BUFFER_LIMIT);
}

function formatProcessFailure(code, stderrBuffer) {
  const summary = code == null ? 'Claude 进程启动失败。' : `Claude 进程异常结束，退出码 ${code}。`;
  const details = stderrBuffer ? `\n\n${stderrBuffer.trim()}` : '';
  return truncateText(`${summary}${details}`, STDERR_BUFFER_LIMIT);
}

function hasRecentErrorEvent(session) {
  const lastMessage = session.messages[session.messages.length - 1];
  return Boolean(lastMessage && lastMessage.role === 'event' && lastMessage.status === 'error');
}

function getLatestPreviewMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant' || message.role === 'user') {
      return message;
    }
  }

  return null;
}

function getLatestSession(workspace) {
  return workspace.sessions
    .slice()
    .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))[0] || null;
}

function formatShortTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function directoryExists(directoryPath) {
  try {
    return fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

function toTimestamp(value) {
  return new Date(value).getTime();
}

function stringifyValue(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateText(value, maxLength) {
  if (!value) {
    return '';
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

module.exports = {
  ClaudeDesktopRuntime,
};
