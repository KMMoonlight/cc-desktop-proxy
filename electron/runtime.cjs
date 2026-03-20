const { randomUUID } = require('crypto');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileURLToPath } = require('url');

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');

const CONFIG_FILE_NAME = 'claude-desktop-config.json';
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const DEFAULT_PROVIDER = 'claude';
const EMPTY_ASSISTANT_TEXT = '（本轮没有收到可展示的文本输出）';
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const SCHEMA_VERSION = 6;
const SAVE_DEBOUNCE_MS = 160;
const CLAUDE_CHECK_TTL_MS = 30_000;
const STDERR_BUFFER_LIMIT = 6000;
const WORKSPACE_GIT_INFO_TTL_MS = 10_000;
const PASTED_ATTACHMENT_DIR_NAME = 'pasted-attachments';
const SESSION_PERMISSION_MODES = new Set([
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
]);
const SESSION_PROVIDER_KEYS = ['claude', 'codex'];
const SESSION_PROVIDERS = new Set(SESSION_PROVIDER_KEYS);

const workspaceGitInfoCache = new Map();
let shellPathCache = {
  checkedAt: 0,
  value: '',
};

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

const IMAGE_FILE_EXTENSIONS = new Set([
  '.apng',
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
]);

const MIME_TYPE_TO_EXTENSION = {
  'application/json': '.json',
  'application/pdf': '.pdf',
  'image/apng': '.apng',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
  'text/csv': '.csv',
  'text/html': '.html',
  'text/markdown': '.md',
  'text/plain': '.txt',
};

class ClaudeDesktopRuntime {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILE_NAME);
    this.defaultPickerPath = path.resolve(process.cwd());
    this.handlersRegistered = false;
    this.saveTimer = null;
    this.claudeInfo = {
      available: null,
      checkedAt: 0,
      executablePath: '',
      models: [],
      version: '',
    };
    this.codexInfo = {
      available: null,
      checkedAt: 0,
      executablePath: '',
      models: [],
      version: '',
    };

    this.store = this.loadStore();
    this.gitDiffWindows = new Map();
    this.windowRuns = new Map();
    this.refreshProviderInfo(true);
  }

  registerIpc() {
    if (this.handlersRegistered) {
      return;
    }

    ipcMain.handle('desktop:get-app-state', () => this.getAppState());
    ipcMain.handle('desktop:get-git-diff-view-data', (_event, payload) => this.getGitDiffViewData(payload?.workspaceId));
    ipcMain.handle('desktop:get-session', (_event, payload) => this.getSession(payload?.workspaceId, payload?.sessionId));
    ipcMain.handle('desktop:open-link', (_event, href) => this.openLink(href));
    ipcMain.handle('desktop:open-git-diff-window', (event, payload) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      return this.openGitDiffWindow(browserWindow, payload?.workspaceId);
    });
    ipcMain.handle('desktop:open-workspace-in-finder', (_event, workspaceId) => this.openWorkspaceInFinder(workspaceId));
    ipcMain.handle('desktop:prepare-pasted-attachments', (_event, payload) => this.preparePastedAttachments(payload));
    ipcMain.handle('desktop:pick-attachments', (event) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      return this.pickAttachments(browserWindow);
    });
    ipcMain.handle('desktop:pick-workspace', (event) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      return this.pickWorkspaceDirectory(browserWindow);
    });
    ipcMain.handle('desktop:add-workspace', (_event, workspacePath) => this.addWorkspace(workspacePath));
    ipcMain.handle('desktop:archive-session', (_event, payload) => this.archiveSession(payload?.workspaceId, payload?.sessionId));
    ipcMain.handle('desktop:create-session', (_event, workspaceId) => this.createSession(workspaceId));
    ipcMain.handle('desktop:install-skill', (_event, payload) => (
      this.installSkill(payload?.workspaceId, payload?.sessionId, payload?.args)
    ));
    ipcMain.handle('desktop:list-skills', (_event, payload) => (
      this.listSkills(payload?.workspaceId, payload?.sessionId)
    ));
    ipcMain.handle('desktop:remove-workspace', (_event, workspaceId) => this.removeWorkspace(workspaceId));
    ipcMain.handle('desktop:run-mcp-command', (_event, payload) => (
      this.runMcpCommand(payload?.workspaceId, payload?.sessionId, payload?.args)
    ));
    ipcMain.handle('desktop:select-workspace', (_event, workspaceId) => this.selectWorkspace(workspaceId));
    ipcMain.handle('desktop:select-session', (_event, payload) => this.selectSession(payload?.workspaceId, payload?.sessionId));
    ipcMain.handle('desktop:set-expanded-workspaces', (_event, workspaceIds) => this.setExpandedWorkspaces(workspaceIds));
    ipcMain.handle('desktop:set-pane-layout', (_event, paneLayout) => this.setPaneLayout(paneLayout));
    ipcMain.handle('desktop:respond-to-approval', (event, payload) => this.respondToApproval(event.sender, payload));
    ipcMain.handle('desktop:send-message', (event, payload) => this.sendMessage(event.sender, payload));
    ipcMain.handle('desktop:stop-run', (event, payload) => this.stopRun(event.sender, payload));
    ipcMain.handle('desktop:update-session-provider', (_event, payload) => (
      this.updateSessionProvider(payload?.workspaceId, payload?.sessionId, payload?.provider)
    ));
    ipcMain.handle('desktop:set-provider-enabled', (_event, payload) => (
      this.setProviderEnabled(payload?.provider, payload?.enabled)
    ));
    ipcMain.handle('desktop:update-session-model', (_event, payload) => (
      this.updateSessionModel(payload?.workspaceId, payload?.sessionId, payload?.model)
    ));
    ipcMain.handle('desktop:update-session-permission-mode', (_event, payload) => (
      this.updateSessionPermissionMode(payload?.workspaceId, payload?.sessionId, payload?.permissionMode)
    ));

    this.handlersRegistered = true;
  }

  getAppState() {
    this.refreshProviderInfo();
    if (this.reconcileUnlockedSessionProviders()) {
      this.scheduleSave();
    }

    const selectedWorkspace = this.getSelectedWorkspace();
    const selectedSession = this.getSelectedSession();
    const activeRunLookup = this.getActiveRunLookup();
    const hasActiveRun = activeRunLookup.size > 0;
    const selectedWorkspacePath = selectedWorkspace?.path || '';
    const enabledProviders = new Set(this.getEnabledProviders());
    const providers = {
      claude: serializeProviderInfo('claude', this.claudeInfo, collectInstalledSkills(selectedWorkspacePath, 'claude'), enabledProviders.has('claude')),
      codex: serializeProviderInfo('codex', this.codexInfo, collectInstalledSkills(selectedWorkspacePath, 'codex'), enabledProviders.has('codex')),
    };

    return {
      claude: {
        ...providers.claude,
        busy: hasActiveRun,
      },
      defaultProvider: this.getDefaultProvider(),
      expandedWorkspaceIds: this.store.expandedWorkspaceIds,
      paneLayout: this.store.paneLayout,
      platform: process.platform,
      providers,
      selectedSessionId: this.store.selectedSessionId,
      selectedWorkspaceId: this.store.selectedWorkspaceId,
      workspaces: this.store.workspaces.map((workspace) => (
        serializeWorkspace(workspace, activeRunLookup, true)
      )),
      activeSession: selectedWorkspace && selectedSession
        ? serializeSession(selectedWorkspace, selectedSession, activeRunLookup)
        : null,
    };
  }

  async pickWorkspaceDirectory(browserWindow) {
    const result = await dialog.showOpenDialog(browserWindow, {
      buttonLabel: '选择工作目录',
      defaultPath: this.getSelectedWorkspace()?.path || this.defaultPickerPath,
      properties: ['openDirectory', 'createDirectory'],
      title: '添加本地工作目录',
    });

    if (result.canceled || !result.filePaths.length) {
      return null;
    }

    return result.filePaths[0];
  }

  async pickAttachments(browserWindow) {
    const result = await dialog.showOpenDialog(browserWindow, {
      buttonLabel: '选择附件',
      defaultPath: this.getSelectedWorkspace()?.path || this.defaultPickerPath,
      properties: ['openFile', 'multiSelections'],
      title: '选择要附加的文件或图片',
    });

    if (result.canceled || !result.filePaths.length) {
      return [];
    }

    return normalizeMessageAttachments(result.filePaths, { verifyExists: true });
  }

  async preparePastedAttachments(payload) {
    const entries = Array.isArray(payload?.attachments) ? payload.attachments : [];
    const attachments = [];

    for (const entry of entries) {
      const attachment = this.preparePastedAttachment(entry);
      if (attachment) {
        attachments.push(attachment);
      }
    }

    return normalizeMessageAttachments(attachments, { verifyExists: true });
  }

  preparePastedAttachment(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    if (typeof entry.path === 'string' && entry.path.trim()) {
      return {
        kind: normalizeAttachmentKind(entry.kind, entry.path),
        name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : path.basename(entry.path.trim()),
        path: entry.path.trim(),
      };
    }

    if (typeof entry.dataBase64 !== 'string' || !entry.dataBase64.trim()) {
      return null;
    }

    const targetDirectory = path.join(app.getPath('userData'), PASTED_ATTACHMENT_DIR_NAME);
    fs.mkdirSync(targetDirectory, { recursive: true });

    const fileName = createPastedAttachmentFileName(entry);
    const targetPath = path.join(targetDirectory, fileName);
    fs.writeFileSync(targetPath, Buffer.from(entry.dataBase64, 'base64'));

    return {
      kind: normalizeAttachmentKind(entry.kind, targetPath),
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : fileName,
      path: targetPath,
    };
  }

  async openLink(rawHref) {
    const href = typeof rawHref === 'string' ? rawHref.trim() : '';
    if (!href || href === '#') {
      return { ok: false };
    }

    const localPath = resolveLinkToLocalPath(href);
    if (localPath) {
      const errorMessage = await shell.openPath(localPath);
      if (errorMessage) {
        throw new Error(errorMessage);
      }

      return { ok: true, target: 'path' };
    }

    await shell.openExternal(href);
    return { ok: true, target: 'external' };
  }

  getGitDiffViewData(workspaceId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    this.assertDirectory(workspace.path);
    return serializeWorkspaceGitDiffView(workspace);
  }

  async openWorkspaceInFinder(workspaceId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    this.assertDirectory(workspace.path);
    const errorMessage = await shell.openPath(workspace.path);
    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return { ok: true };
  }

  getSession(workspaceId, sessionId) {
    const sessionRef = this.findSessionByIds(workspaceId, sessionId);
    if (!sessionRef || sessionRef.session.archived) {
      throw new Error('找不到对应的历史对话。');
    }

    return serializeSession(sessionRef.workspace, sessionRef.session, this.getActiveRunLookup());
  }

  async openGitDiffWindow(parentWindow, workspaceId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const gitInfo = getWorkspaceGitInfo(workspace.path);
    if (!gitInfo?.dirty) {
      throw new Error('当前工作目录没有可查看的 Git 文件变动。');
    }

    const existingWindow = this.gitDiffWindows.get(workspace.id);
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.focus();
      return { ok: true, reused: true };
    }

    const browserWindow = new BrowserWindow({
      width: 1260,
      height: 860,
      minWidth: 960,
      minHeight: 620,
      title: `${workspace.name} · Git 变更`,
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#f7f1e7',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: false,
      },
    });

    const query = new URLSearchParams({
      view: 'git-diff',
      workspaceId: workspace.id,
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      await browserWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${query.toString()}`);
    } else {
      await browserWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
        query: {
          view: 'git-diff',
          workspaceId: workspace.id,
        },
      });
    }

    browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const contentsId = browserWindow.webContents.id;

    this.gitDiffWindows.set(workspace.id, browserWindow);

    browserWindow.on('closed', () => {
      if (this.gitDiffWindows.get(workspace.id) === browserWindow) {
        this.gitDiffWindows.delete(workspace.id);
      }
      this.disposeWindow(contentsId);
    });

    return { ok: true, reused: false };
  }

  addWorkspace(rawWorkspacePath) {
    const workspacePath = this.resolveWorkspacePath(rawWorkspacePath);
    this.assertDirectory(workspacePath);

    const existingWorkspace = this.store.workspaces.find((workspace) => workspace.path === workspacePath);
    if (existingWorkspace) {
      throw new Error(`工作目录已存在，已取消添加: ${workspacePath}`);
    }

    const now = new Date().toISOString();
    const workspace = {
      approvalRules: [],
      createdAt: now,
      id: randomUUID(),
      name: path.basename(workspacePath) || workspacePath,
      path: workspacePath,
      sessions: [],
      updatedAt: now,
    };

    const session = createWorkspaceSession(now, this.getDefaultProvider());
    workspace.sessions.unshift(session);

    this.store.workspaces.push(workspace);
    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;
    this.scheduleSave();

    return this.getAppState();
  }

  createSession(workspaceId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const now = new Date().toISOString();
    const session = createWorkspaceSession(now, this.getDefaultProvider());

    workspace.sessions.unshift(session);
    this.touchWorkspace(workspace, now);
    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;
    this.scheduleSave();

    return this.getAppState();
  }

  removeWorkspace(workspaceId) {
    const workspaceIndex = this.store.workspaces.findIndex((workspace) => workspace.id === workspaceId);
    if (workspaceIndex === -1) {
      throw new Error('找不到对应的工作目录。');
    }

    const activeRun = this.getActiveRunStates().find((run) => run.workspaceId === workspaceId);
    if (activeRun) {
      throw new Error('正在执行中的工作目录暂时不能移除。');
    }

    this.store.workspaces.splice(workspaceIndex, 1);
    this.store.expandedWorkspaceIds = this.store.expandedWorkspaceIds.filter((id) => id !== workspaceId);

    const selectedWorkspaceStillExists = this.store.workspaces.some((workspace) => workspace.id === this.store.selectedWorkspaceId);
    if (!selectedWorkspaceStillExists) {
      const nextWorkspace = this.store.workspaces[Math.min(workspaceIndex, this.store.workspaces.length - 1)] || null;
      this.store.selectedWorkspaceId = nextWorkspace?.id || null;
      this.store.selectedSessionId = nextWorkspace ? getLatestVisibleSession(nextWorkspace)?.id || null : null;
    }

    this.scheduleSave();
    return this.getAppState();
  }

  selectWorkspace(workspaceId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = getLatestVisibleSession(workspace)?.id || null;
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

  archiveSession(workspaceId, sessionId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const session = workspace.sessions.find((item) => item.id === sessionId);
    if (!session || session.archived) {
      throw new Error('找不到对应的话题。');
    }

    const activeRun = this.findActiveRunState(workspace.id, session.id);
    if (activeRun) {
      throw new Error('正在执行中的话题暂时不能归档。');
    }

    session.archived = true;

    if (this.store.selectedWorkspaceId === workspace.id && this.store.selectedSessionId === session.id) {
      this.store.selectedSessionId = getLatestVisibleSession(workspace)?.id || null;
    }

    this.scheduleSave();
    return this.getAppState();
  }

  setExpandedWorkspaces(workspaceIds) {
    const validWorkspaceIds = new Set(this.store.workspaces.map((workspace) => workspace.id));
    this.store.expandedWorkspaceIds = Array.isArray(workspaceIds)
      ? workspaceIds.filter((workspaceId, index, items) => (
        typeof workspaceId === 'string'
        && validWorkspaceIds.has(workspaceId)
        && items.indexOf(workspaceId) === index
      ))
      : [];

    this.scheduleSave();
    return this.getAppState();
  }

  setPaneLayout(paneLayout) {
    this.store.paneLayout = normalizePaneLayoutState(paneLayout);
    this.scheduleSave();
    return this.store.paneLayout;
  }

  updateSessionModel(workspaceId, sessionId, model) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const session = workspace.sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error('找不到对应的历史对话。');
    }

    const nextModel = typeof model === 'string' ? model.trim() : '';
    const now = new Date().toISOString();

    session.model = nextModel;
    session.currentModel = nextModel;
    session.updatedAt = now;
    this.touchWorkspace(workspace, now);
    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;
    this.scheduleSave();

    return this.getAppState();
  }

  updateSessionProvider(workspaceId, sessionId, provider) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const session = workspace.sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error('找不到对应的历史对话。');
    }

    const nextProvider = normalizeSessionProvider(provider);
    if (session.provider === nextProvider) {
      return this.getAppState();
    }

    if (!this.isProviderEnabled(nextProvider)) {
      throw new Error(`${getProviderLabel(nextProvider)} 已在设置中关闭。`);
    }

    if (!this.getProviderInfo(nextProvider).available) {
      throw new Error(`未检测到可用的 ${getProviderLabel(nextProvider)} CLI。`);
    }

    const activeRun = this.findActiveRunState(workspace.id, session.id);
    if (activeRun) {
      throw new Error('运行中的对话暂时不能切换 provider。');
    }

    if (isSessionProviderLocked(session)) {
      throw new Error('这个会话已经开始对话，不能再切换 provider。');
    }

    const now = new Date().toISOString();
    const previousProvider = normalizeSessionProvider(session.provider);
    session.provider = nextProvider;
    session.claudeSessionId = null;
    session.currentModel = '';
    session.model = '';
    session.permissionMode = nextProvider === 'claude' ? session.permissionMode : 'default';
    session.updatedAt = now;
    this.touchWorkspace(workspace, now);
    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;

    if (session.messages.length > 0) {
      this.appendEventMessage(workspace, session, {
        kind: 'command',
        status: 'info',
        title: `切换到 ${getProviderLabel(nextProvider)}`,
        content: `${getProviderLabel(previousProvider)} 的远端线程不会继续复用。下一条消息会从新的 ${getProviderLabel(nextProvider)} 本地线程开始。`,
        createdAt: now,
      });
    }

    this.scheduleSave();
    return this.getAppState();
  }

  updateSessionPermissionMode(workspaceId, sessionId, permissionMode) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const session = workspace.sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error('找不到对应的历史对话。');
    }

    const nextPermissionMode = normalizeSessionPermissionMode(permissionMode);
    const now = new Date().toISOString();

    session.permissionMode = nextPermissionMode;
    session.updatedAt = now;
    this.touchWorkspace(workspace, now);
    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;
    this.scheduleSave();

    return this.getAppState();
  }

  getProviderInfo(provider) {
    return normalizeSessionProvider(provider) === 'codex' ? this.codexInfo : this.claudeInfo;
  }

  getEnabledProviders() {
    return normalizeEnabledProviders(this.store.enabledProviders);
  }

  isProviderEnabled(provider) {
    return this.getEnabledProviders().includes(normalizeSessionProvider(provider));
  }

  assertProviderEnabled(provider) {
    const normalizedProvider = normalizeSessionProvider(provider);
    if (this.isProviderEnabled(normalizedProvider)) {
      return normalizedProvider;
    }

    throw new Error(`${getProviderLabel(normalizedProvider)} 已在设置中关闭，请先重新启用后再继续这个会话。`);
  }

  getDefaultProvider() {
    const enabledProviders = this.getEnabledProviders();
    const availableEnabledProviders = enabledProviders.filter((provider) => this.getProviderInfo(provider).available);

    if (availableEnabledProviders.length > 0) {
      return availableEnabledProviders[0];
    }

    return enabledProviders[0] || DEFAULT_PROVIDER;
  }

  reconcileUnlockedSessionProviders() {
    const enabledProviders = this.getEnabledProviders();
    const nextDefaultProvider = this.getDefaultProvider();
    const hasAvailableEnabledProvider = enabledProviders.some((provider) => this.getProviderInfo(provider).available);
    const enabledProviderSet = new Set(enabledProviders);
    let changed = false;

    for (const workspace of this.store.workspaces) {
      let workspaceTouched = false;

      for (const session of workspace.sessions) {
        if (!session || isSessionProviderLocked(session) || this.findActiveRunState(workspace.id, session.id)) {
          continue;
        }

        const currentProvider = normalizeSessionProvider(session.provider);
        const shouldSwitch = (
          !enabledProviderSet.has(currentProvider)
          || (hasAvailableEnabledProvider && !this.getProviderInfo(currentProvider).available)
        );

        if (!shouldSwitch || currentProvider === nextDefaultProvider) {
          continue;
        }

        const now = new Date().toISOString();
        session.provider = nextDefaultProvider;
        session.claudeSessionId = null;
        session.currentModel = '';
        session.model = '';
        session.permissionMode = nextDefaultProvider === 'claude'
          ? normalizeSessionPermissionMode(session.permissionMode)
          : 'default';
        session.updatedAt = now;
        workspaceTouched = true;
        changed = true;
      }

      if (workspaceTouched) {
        this.touchWorkspace(workspace);
      }
    }

    return changed;
  }

  setProviderEnabled(provider, enabled) {
    const nextProvider = normalizeSessionProvider(provider);
    const nextEnabled = Boolean(enabled);
    const currentEnabledProviders = this.getEnabledProviders();
    const providerEnabled = currentEnabledProviders.includes(nextProvider);

    if (providerEnabled === nextEnabled) {
      return this.getAppState();
    }

    const nextEnabledProviders = nextEnabled
      ? SESSION_PROVIDER_KEYS.filter((key) => currentEnabledProviders.includes(key) || key === nextProvider)
      : currentEnabledProviders.filter((key) => key !== nextProvider);

    if (nextEnabledProviders.length === 0) {
      throw new Error('至少保留一个启用的 Provider。');
    }

    this.store.enabledProviders = nextEnabledProviders;
    this.reconcileUnlockedSessionProviders();
    this.scheduleSave();

    return this.getAppState();
  }

  runMcpCommand(workspaceId, sessionId, rawArgs) {
    const { workspace, session } = this.requireCommandSession(workspaceId, sessionId);
    const provider = this.assertProviderEnabled(session.provider);
    const args = tokenizeCliArgs(rawArgs);
    if (args.length === 0) {
      throw new Error('请使用 /mcp list、/mcp get <name>、/mcp add ... 或 /mcp remove <name>。');
    }

    const cliEnv = getCliProcessEnv();
    const executablePath = this.getProviderInfo(provider).executablePath || resolveProviderExecutablePath(provider, cliEnv);
    if (!executablePath) {
      throw new Error(`未检测到可用的 ${getProviderLabel(provider)} CLI。`);
    }

    const result = spawnSync(executablePath, ['mcp', ...args], {
      cwd: workspace.path,
      encoding: 'utf8',
      env: cliEnv,
    });

    const content = [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || '命令已执行，但没有返回内容。';
    this.appendEventMessage(workspace, session, {
      kind: 'command',
      status: result.status === 0 ? 'info' : 'error',
      title: `/mcp ${args.join(' ')}`,
      content: truncateText(content, STDERR_BUFFER_LIMIT),
    });
    this.scheduleSave();

    return this.getAppState();
  }

  listSkills(workspaceId, sessionId) {
    const { workspace, session } = this.requireCommandSession(workspaceId, sessionId);
    this.assertProviderEnabled(session.provider);
    const entries = collectInstalledSkills(workspace.path, normalizeSessionProvider(session.provider));
    const content = entries.length > 0
      ? entries.map((entry, index) => (
        `${index + 1}. [${entry.scope}] ${entry.name}`
        + `${entry.description ? `\n${entry.description}` : ''}`
        + `\n${entry.path}`
      )).join('\n\n')
      : '当前没有发现可用的本地 skills。';

    this.appendEventMessage(workspace, session, {
      kind: 'command',
      status: 'info',
      title: '/skills list',
      content,
    });
    this.scheduleSave();

    return this.getAppState();
  }

  installSkill(workspaceId, sessionId, rawArgs) {
    const { workspace, session } = this.requireCommandSession(workspaceId, sessionId);
    const provider = this.assertProviderEnabled(session.provider);
    const args = tokenizeCliArgs(rawArgs);
    if (args.length === 0) {
      throw new Error('请使用 /skills install <本地路径> [--scope user|project]。');
    }

    const { scope, sourceArg } = parseSkillInstallArgs(args);
    if (!sourceArg) {
      throw new Error('请提供要安装的技能目录路径。');
    }

    const sourcePath = path.resolve(workspace.path, sourceArg);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`技能目录不存在: ${sourcePath}`);
    }

    const sourceStats = fs.statSync(sourcePath);
    if (!sourceStats.isDirectory()) {
      throw new Error('当前 /skills install 只支持安装包含 SKILL.md 的本地目录。');
    }

    const manifestPath = path.join(sourcePath, 'SKILL.md');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('技能目录中缺少 SKILL.md，无法按 skill 安装。');
    }

    const targetRoot = scope === 'project'
      ? path.join(workspace.path, getProjectProviderDirectoryName(provider), 'skills')
      : path.join(getProviderHome(provider), 'skills');
    const targetPath = path.join(targetRoot, path.basename(sourcePath));

    fs.mkdirSync(targetRoot, { recursive: true });
    if (fs.existsSync(targetPath)) {
      throw new Error(`目标位置已存在同名 skill: ${targetPath}`);
    }

    fs.cpSync(sourcePath, targetPath, { recursive: true, errorOnExist: true, force: false });

    this.appendEventMessage(workspace, session, {
      kind: 'command',
      status: 'completed',
      title: '/skills install',
      content: `已安装 skill：${path.basename(sourcePath)}\n作用域：${scope}\n目标路径：${targetPath}`,
    });
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
    const attachments = normalizeMessageAttachments(payload?.attachments, { verifyExists: true });
    const provider = this.assertProviderEnabled(session.provider || this.getDefaultProvider());
    const providerLabel = getProviderLabel(provider);
    const providerPrompt = buildPromptWithAttachments(prompt, attachments);
    if (!providerPrompt) {
      throw new Error('消息内容不能为空。');
    }
    const displayPrompt = typeof payload?.displayPrompt === 'string' && payload.displayPrompt.trim()
      ? payload.displayPrompt.trim()
      : prompt;
    const displayKind = typeof payload?.displayKind === 'string' ? payload.displayKind.trim() : '';
    const displayTitle = typeof payload?.displayTitle === 'string' && payload.displayTitle.trim()
      ? payload.displayTitle.trim()
      : displayPrompt;

    this.refreshProviderInfo(true);
    const providerInfo = this.getProviderInfo(provider);
    if (!providerInfo.available) {
      throw new Error(`未检测到可用的 ${providerLabel} CLI。`);
    }

    const existingRun = this.findActiveRunState(workspace.id, session.id);
    if (existingRun) {
      throw new Error(`当前已有正在运行的 ${providerLabel} 任务，请等待完成或先停止。`);
    }
    const runState = this.getRunState(webContents.id, workspace.id, session.id);

    this.assertDirectory(workspace.path);

    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;

    const now = new Date().toISOString();
    const userMessage = displayKind === 'command'
      ? createEventMessage({
        content: '',
        createdAt: now,
        kind: 'command',
        role: 'event',
        status: 'info',
        title: displayTitle,
      })
      : createStoredMessage({
        attachments,
        content: displayPrompt,
        createdAt: now,
        role: 'user',
      });
    runState.assistantMessageId = null;
    runState.currentAssistantText = '';
    runState.hasStreamedAssistantText = false;
    runState.stderrBuffer = '';
    runState.seenToolResultIds.clear();
    runState.seenToolUseIds.clear();
    runState.toolUses.clear();
    runState.resultIsError = false;
    runState.resultReceived = false;
    runState.provider = provider;
    runState.sessionId = session.id;
    runState.workspaceId = workspace.id;
    runState.runToken = randomUUID();
    const runToken = runState.runToken;

    const extraAttachmentDirs = collectAttachmentDirectories(workspace.path, attachments);
    const cliEnv = getCliProcessEnv();
    const executablePath = providerInfo.executablePath || resolveProviderExecutablePath(provider, cliEnv);
    if (!executablePath) {
      throw new Error(`未检测到可用的 ${providerLabel} CLI。`);
    }

    const args = provider === 'codex'
      ? buildCodexExecArgs({
        attachments,
        extraAttachmentDirs,
        model: session.model,
        prompt: providerPrompt,
        sessionId: session.claudeSessionId,
      })
      : buildClaudeExecArgs({
        extraAttachmentDirs,
        model: session.model,
        permissionMode: session.permissionMode,
        sessionId: session.claudeSessionId,
      });

    const proc = spawn(executablePath, args, {
      cwd: workspace.path,
      env: cliEnv,
    });

    session.messages.push(userMessage);
    session.status = 'running';
    session.updatedAt = now;
    session.model = session.model || '';

    if (isDefaultSessionTitle(session.title) && countInputMessages(session.messages) === 1) {
      session.title = createSessionTitleFromPrompt(displayPrompt || formatAttachmentTitle(attachments));
    }

    runState.process = proc;
    this.touchWorkspace(workspace, now);
    this.scheduleSave();
    this.emitState(webContents);

    let buffer = '';

    proc.stdout.on('data', (chunk) => {
      if (runState.runToken !== runToken) {
        return;
      }

      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        this.processLine(webContents, runState, line);
      }
    });

    proc.stderr.on('data', (chunk) => {
      if (runState.runToken !== runToken) {
        return;
      }

      const text = stripAnsi(chunk.toString());
      if (!text.trim()) {
        return;
      }

      runState.stderrBuffer = truncateText(`${runState.stderrBuffer}${text}`, STDERR_BUFFER_LIMIT);
    });

    if (provider !== 'codex') {
      proc.stdin.on('error', () => {});
    }

    proc.on('close', (code) => {
      if (runState.runToken !== runToken) {
        return;
      }

      if (buffer.trim()) {
        this.processLine(webContents, runState, buffer);
      }

      const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
      if (sessionRef) {
        finalizeRunningToolMessages(sessionRef.session, code === 0 ? 'completed' : 'error');
        let assistant = this.getAssistantMessage(sessionRef.session, runState);
        if (!assistant && code === 0 && !hasRecentErrorEvent(sessionRef.session) && !runState.hasStreamedAssistantText) {
          assistant = this.ensureAssistantMessage(sessionRef.session, runState, new Date().toISOString());
          assistant.content = EMPTY_ASSISTANT_TEXT;
        }

        if (assistant) {
          const hadContent = Boolean(assistant.content);
          assistant.streaming = false;
          assistant.content = assistant.content || EMPTY_ASSISTANT_TEXT;
          assistant.error = code !== 0 && !hadContent;
        }

        if (code !== 0 && !hasRecentErrorEvent(sessionRef.session)) {
          this.appendEventMessage(sessionRef.workspace, sessionRef.session, {
            kind: 'error',
            status: 'error',
            title: `${providerLabel} 运行失败`,
            content: formatProcessFailure(providerLabel, code, runState.stderrBuffer),
          });
        }

        sessionRef.session.status = runState.resultReceived
          ? (runState.resultIsError ? 'error' : 'idle')
          : (code === 0 ? 'idle' : 'error');
        sessionRef.session.updatedAt = new Date().toISOString();
        this.touchWorkspace(sessionRef.workspace, sessionRef.session.updatedAt);
      }

      this.resetRunState(runState);
      this.deleteRunState(webContents.id, workspace.id, session.id);

      this.scheduleSave();
      this.emitState(webContents);
    });

    proc.on('error', (error) => {
      if (runState.runToken !== runToken) {
        return;
      }

      const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
      if (sessionRef) {
        finalizeRunningToolMessages(sessionRef.session, 'error');
        this.appendEventMessage(sessionRef.workspace, sessionRef.session, {
          kind: 'error',
          status: 'error',
          title: `${providerLabel} 启动失败`,
          content: formatProcessFailure(providerLabel, null, `${error.message}\n${runState.stderrBuffer}`),
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

      this.resetRunState(runState);
      this.deleteRunState(webContents.id, workspace.id, session.id);

      this.scheduleSave();
      this.emitState(webContents);
    });

    if (provider !== 'codex') {
      writeJsonLine(proc.stdin, createStreamJsonUserMessage(providerPrompt, session.claudeSessionId, providerLabel));
    }

    return { ok: true };
  }

  respondToApproval(webContents, payload) {
    const requestId = typeof payload?.requestId === 'string' ? payload.requestId.trim() : '';
    const decision = typeof payload?.decision === 'string' ? payload.decision.trim().toLowerCase() : '';
    const runState = this.findRunStateByApprovalRequest(
      webContents.id,
      requestId,
      payload?.workspaceId,
      payload?.sessionId,
    );

    if (!runState?.process) {
      throw new Error('当前没有正在运行的任务。');
    }

    if (!requestId) {
      throw new Error('缺少审批请求 ID。');
    }

    if (decision !== 'allow' && decision !== 'allow_always' && decision !== 'deny') {
      throw new Error('无效的审批结果。');
    }

    const pendingApproval = runState.pendingApprovalRequests.get(requestId);
    if (!pendingApproval) {
      throw new Error('找不到对应的审批请求。');
    }

    if (decision === 'allow_always') {
      const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
      if (sessionRef) {
        addWorkspaceApprovalRule(sessionRef.workspace, createApprovalRuleFromPendingApproval(pendingApproval));
        this.touchWorkspace(sessionRef.workspace);
        this.scheduleSave();
      }
    }

    writeJsonLine(
      runState.process.stdin,
      createApprovalControlResponse(pendingApproval, decision === 'allow_always' ? 'allow' : decision),
    );

    runState.pendingApprovalRequests.delete(requestId);
    this.emitState(webContents);
    return this.getAppState();
  }

  stopRun(webContents, payload) {
    const runState = this.findRunStateForSession(webContents.id, payload?.workspaceId, payload?.sessionId);
    if (!runState?.process) {
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

      finalizeRunningToolMessages(sessionRef.session, 'stopped');
      sessionRef.session.status = 'idle';
      sessionRef.session.updatedAt = new Date().toISOString();
      this.touchWorkspace(sessionRef.workspace, sessionRef.session.updatedAt);
    }

    runState.process.kill('SIGTERM');
    this.resetRunState(runState);
    this.deleteRunState(webContents.id, sessionRef?.workspace.id, sessionRef?.session.id);

    this.scheduleSave();
    this.emitState(webContents);

    return this.getAppState();
  }

  disposeWindow(contentsId) {
    const windowRuns = this.windowRuns.get(contentsId);
    if (!windowRuns) {
      return;
    }

    for (const runState of windowRuns.values()) {
      if (runState?.process) {
        const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
        if (sessionRef) {
          const assistant = this.getAssistantMessage(sessionRef.session, runState)
            || this.ensureAssistantMessage(sessionRef.session, runState, new Date().toISOString());
          if (assistant) {
            assistant.streaming = false;
            assistant.content = assistant.content || '（应用关闭时本轮运行被终止）';
          }
          finalizeRunningToolMessages(sessionRef.session, 'stopped');
          sessionRef.session.status = 'idle';
        }

        runState.process.kill('SIGTERM');
      }

      this.resetRunState(runState);
    }

    this.windowRuns.delete(contentsId);
  }

  disposeAll() {
    for (const browserWindow of this.gitDiffWindows.values()) {
      if (!browserWindow.isDestroyed()) {
        browserWindow.destroy();
      }
    }
    this.gitDiffWindows.clear();

    for (const contentsId of Array.from(this.windowRuns.keys())) {
      this.disposeWindow(contentsId);
    }

    this.flushSave();
  }

  processLine(webContents, runState, line) {
    if (!line.trim()) {
      return;
    }

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
    if (!sessionRef) {
      return;
    }

    if (normalizeSessionProvider(runState.provider || sessionRef.session.provider) === 'codex') {
      this.handleCodexEvent(webContents, sessionRef.workspace, sessionRef.session, runState, event);
    } else {
      this.handleClaudeEvent(webContents, sessionRef.workspace, sessionRef.session, runState, event);
    }
    this.scheduleSave();
    this.emitState(webContents);
  }

  handleClaudeEvent(webContents, workspace, session, runState, event) {
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
      this.handleStreamEvent(webContents, workspace, session, runState, event.event);
      return;
    }

    if (event.type === 'assistant') {
      this.handleAssistantEvent(webContents, workspace, session, runState, event);
      return;
    }

    if (event.type === 'control_request') {
      this.handleControlRequest(webContents, workspace, session, runState, event);
      return;
    }

    if (event.type === 'user') {
      this.handleUserEvent(webContents, workspace, session, runState, event);
      return;
    }

    if (event.type === 'result') {
      const shouldUseResultText = !runState.hasStreamedAssistantText;
      const assistant = this.getAssistantMessage(session, runState)
        || (!event.is_error && shouldUseResultText && event.result
          ? this.ensureAssistantMessage(session, runState, now)
          : null);
      if (assistant) {
        assistant.streaming = false;
        assistant.content = shouldUseResultText
          ? (event.result || assistant.content)
          : assistant.content;
        assistant.error = Boolean(event.is_error);
      }

      runState.resultIsError = Boolean(event.is_error);
      runState.resultReceived = true;
      session.status = event.is_error ? 'error' : session.status;
      session.updatedAt = now;
      this.touchWorkspace(workspace, now);
      runState.pendingApprovalRequests.clear();
      closeClaudeInput(runState.process);

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

  handleCodexEvent(_webContents, workspace, session, runState, event) {
    const now = new Date().toISOString();

    if (event.type === 'thread.started') {
      if (event.thread_id && event.thread_id !== session.claudeSessionId) {
        session.claudeSessionId = event.thread_id;
        session.updatedAt = now;
        this.touchWorkspace(workspace, now);
      }
      return;
    }

    if (event.type === 'turn.started') {
      session.status = 'running';
      session.updatedAt = now;
      this.touchWorkspace(workspace, now);
      return;
    }

    if (event.type === 'turn.completed') {
      runState.resultReceived = true;
      session.status = runState.resultIsError ? 'error' : 'idle';
      session.updatedAt = now;
      this.touchWorkspace(workspace, now);
      return;
    }

    if (event.type === 'turn.failed') {
      runState.resultIsError = true;
      runState.resultReceived = true;
      session.status = 'error';
      session.updatedAt = now;
      this.touchWorkspace(workspace, now);
      this.appendEventMessage(workspace, session, {
        kind: 'error',
        status: 'error',
        title: 'Codex 返回错误',
        content: formatCodexTurnFailure(event, runState.stderrBuffer),
      });
      return;
    }

    if (event.type === 'error') {
      runState.resultIsError = true;
      session.status = 'error';
      session.updatedAt = now;
      this.touchWorkspace(workspace, now);
      this.appendEventMessage(workspace, session, {
        kind: 'error',
        status: 'error',
        title: 'Codex 返回错误',
        content: formatCodexTurnFailure(event, runState.stderrBuffer),
      });
      return;
    }

    if (event.type === 'agent_message_delta') {
      const textDelta = extractCodexAssistantText(event);
      if (textDelta) {
        runState.hasStreamedAssistantText = true;
        runState.currentAssistantText += textDelta;
        this.updateAssistantMessage(session, runState, runState.currentAssistantText, false);
      }
      return;
    }

    if (event.type === 'agent_message') {
      const text = extractCodexAssistantText(event);
      if (text) {
        runState.hasStreamedAssistantText = true;
        this.updateAssistantMessage(session, runState, text, true);
      }
      return;
    }

    if (event.type === 'item.started') {
      this.handleCodexItemStarted(workspace, session, runState, event.item);
      return;
    }

    if (event.type === 'item.completed') {
      this.handleCodexItemCompleted(workspace, session, runState, event.item);
    }
  }

  handleCodexItemStarted(workspace, session, runState, item) {
    const itemSummary = describeCodexItem(item);
    if (!itemSummary?.toolUseId) {
      return;
    }

    if (runState.seenToolUseIds.has(itemSummary.toolUseId)) {
      this.refreshCodexItemMessage(session, itemSummary.toolUseId, itemSummary, 'running');
      return;
    }

    runState.seenToolUseIds.add(itemSummary.toolUseId);
    runState.toolUses.set(itemSummary.toolUseId, itemSummary);
    this.finalizeAssistantSegment(session, runState);

    this.appendEventMessage(workspace, session, {
      kind: itemSummary.kind,
      status: 'running',
      title: itemSummary.runningTitle,
      content: itemSummary.detail,
      toolCategory: itemSummary.category,
      toolLabel: itemSummary.detail,
      toolMeta: itemSummary.toolMeta || null,
      toolName: itemSummary.name,
      toolUseId: itemSummary.toolUseId,
    });
  }

  handleCodexItemCompleted(workspace, session, runState, item) {
    const assistantText = extractCodexAssistantText(item);
    if (assistantText) {
      runState.hasStreamedAssistantText = true;
      this.updateAssistantMessage(session, runState, assistantText, true);
      return;
    }

    const itemSummary = describeCodexItem(item);
    if (!itemSummary) {
      return;
    }

    const nextStatus = itemSummary.status || 'completed';
    if (itemSummary.toolUseId) {
      runState.toolUses.set(itemSummary.toolUseId, itemSummary);
      const updated = this.refreshCodexItemMessage(session, itemSummary.toolUseId, itemSummary, nextStatus);
      if (!updated) {
        this.appendEventMessage(workspace, session, {
          kind: itemSummary.kind,
          status: nextStatus,
          title: nextStatus === 'error' ? itemSummary.errorTitle : itemSummary.completedTitle,
          content: itemSummary.completedDetail || itemSummary.detail,
          toolCategory: itemSummary.category,
          toolLabel: itemSummary.completedDetail || itemSummary.detail,
          toolMeta: itemSummary.toolMeta || null,
          toolName: itemSummary.name,
          toolUseId: itemSummary.toolUseId,
        });
      }
      runState.toolUses.delete(itemSummary.toolUseId);
      return;
    }

    this.appendEventMessage(workspace, session, {
      kind: itemSummary.kind,
      status: nextStatus,
      title: nextStatus === 'error' ? itemSummary.errorTitle : itemSummary.completedTitle,
      content: itemSummary.completedDetail || itemSummary.detail,
      toolCategory: itemSummary.category,
      toolLabel: itemSummary.completedDetail || itemSummary.detail,
      toolMeta: itemSummary.toolMeta || null,
      toolName: itemSummary.name,
    });
  }

  refreshCodexItemMessage(session, toolUseId, itemSummary, status) {
    if (!toolUseId) {
      return false;
    }

    let updated = false;
    for (const message of session.messages) {
      if (message?.role !== 'event' || message.toolUseId !== toolUseId) {
        continue;
      }

      message.kind = itemSummary.kind;
      message.status = status;
      message.title = status === 'error' ? itemSummary.errorTitle : (status === 'running' ? itemSummary.runningTitle : itemSummary.completedTitle);
      message.content = status === 'running'
        ? itemSummary.detail
        : (itemSummary.completedDetail || itemSummary.detail);
      message.toolCategory = itemSummary.category;
      message.toolLabel = message.content;
      message.toolMeta = itemSummary.toolMeta || null;
      message.toolName = itemSummary.name;
      updated = true;
    }

    if (updated) {
      session.updatedAt = new Date().toISOString();
    }

    return updated;
  }

  handleSystemEvent(workspace, session, event) {
    const now = new Date().toISOString();

    if (event.subtype === 'init') {
      session.currentModel = event.model || session.currentModel || session.model;
      session.updatedAt = now;
      this.touchWorkspace(workspace, now);
      return;
    }

    if (event.subtype === 'task_started') {
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

  handleStreamEvent(webContents, workspace, session, runState, streamEvent) {
    if (!streamEvent?.type) {
      return;
    }

    if (streamEvent.type === 'content_block_start') {
      const block = streamEvent.content_block;

      if (block?.type === 'tool_use') {
        this.emitToolUse(workspace, session, runState, block);
        this.emitState(webContents);
        return;
      }

      if (block?.type === 'text' && block.text) {
        runState.hasStreamedAssistantText = true;
        this.updateAssistantMessage(session, runState, block.text, false);
      }
      return;
    }

    if (streamEvent.type === 'content_block_delta') {
      if (streamEvent.delta?.type === 'text_delta' && streamEvent.delta.text) {
        runState.hasStreamedAssistantText = true;
        runState.currentAssistantText += streamEvent.delta.text;
        this.updateAssistantMessage(session, runState, runState.currentAssistantText, false);
        return;
      }
    }
  }

  handleAssistantEvent(webContents, workspace, session, runState, event) {
    const content = Array.isArray(event.message?.content) ? event.message.content : [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        if (this.emitToolUse(workspace, session, runState, block)) {
          this.emitState(webContents);
        }
      }
    }

    const assistantText = extractTextBlocks(content);
    if (assistantText && !runState.hasStreamedAssistantText) {
      this.updateAssistantMessage(session, runState, assistantText, event.message?.stop_reason === 'end_turn');
    }
  }

  handleUserEvent(webContents, workspace, session, runState, event) {
    const content = Array.isArray(event.message?.content) ? event.message.content : [];

    for (const block of content) {
      if (block.type !== 'tool_result') {
        continue;
      }

      if (runState.seenToolResultIds.has(block.tool_use_id)) {
        continue;
      }

      runState.seenToolResultIds.add(block.tool_use_id);
      const toolUse = runState.toolUses.get(block.tool_use_id) || describeToolUse('', null);

      this.appendEventMessage(workspace, session, {
        kind: toolUse.kind,
        status: block.is_error ? 'error' : 'completed',
        title: block.is_error ? toolUse.errorTitle : toolUse.completedTitle,
        content: toolUse.detail,
        toolCategory: toolUse.category,
        toolLabel: toolUse.detail,
        toolMeta: toolUse.toolMeta || null,
        toolName: toolUse.name,
        toolUseId: block.tool_use_id,
      });

      clearPendingApprovalByToolUseId(runState, block.tool_use_id);
      runState.toolUses.delete(block.tool_use_id);
      this.emitState(webContents);
    }
  }

  handleControlRequest(webContents, workspace, session, runState, event) {
    const request = event?.request;
    if (!request || request.subtype !== 'can_use_tool') {
      return;
    }

    const requestId = typeof event.request_id === 'string' ? event.request_id.trim() : '';
    if (!requestId) {
      return;
    }

    const toolUse = describeToolUse(request.tool_name, request.input);
    const now = new Date().toISOString();
    const approvalInput = request.input && typeof request.input === 'object' ? request.input : {};
    const approvalCategory = inferApprovalCategory({
      category: toolUse.category,
      display_name: typeof request.display_name === 'string' ? request.display_name : '',
      input: approvalInput,
      title: typeof request.title === 'string' ? request.title : '',
      tool_name: typeof request.tool_name === 'string' ? request.tool_name : '',
    });

    const pendingApproval = {
      blockedPath: typeof request.blocked_path === 'string' ? request.blocked_path : '',
      category: approvalCategory,
      createdAt: now,
      decisionReason: typeof request.decision_reason === 'string' ? request.decision_reason : '',
      description: typeof request.description === 'string' ? request.description : '',
      detail: toolUse.detail,
      displayName: typeof request.display_name === 'string' ? request.display_name : '',
      input: approvalInput,
      requestId,
      title: typeof request.title === 'string' ? request.title : '',
      toolName: typeof request.tool_name === 'string' ? request.tool_name : '',
      toolUseId: typeof request.tool_use_id === 'string' ? request.tool_use_id : '',
    };

    if (workspaceHasMatchingApprovalRule(workspace, pendingApproval)) {
      writeJsonLine(
        runState.process.stdin,
        createApprovalControlResponse(pendingApproval, 'allow'),
      );
      return;
    }

    runState.pendingApprovalRequests.set(requestId, pendingApproval);

    session.updatedAt = now;
    this.touchWorkspace(workspace, now);
    this.emitState(webContents);
  }

  emitToolUse(workspace, session, runState, block) {
    if (!block?.id) {
      return false;
    }

    const toolUse = describeToolUse(block.name, block.input);
    if (toolUse.kind === 'agent') {
      return false;
    }

    if (runState.seenToolUseIds.has(block.id)) {
      return this.refreshToolUse(session, runState, block.id, toolUse);
    }

    runState.seenToolUseIds.add(block.id);
    this.finalizeAssistantSegment(session, runState);
    runState.toolUses.set(block.id, toolUse);

    this.appendEventMessage(workspace, session, {
      kind: toolUse.kind,
      status: 'running',
      title: toolUse.runningTitle,
      content: toolUse.detail,
      toolCategory: toolUse.category,
      toolLabel: toolUse.detail,
      toolMeta: toolUse.toolMeta || null,
      toolName: toolUse.name,
      toolUseId: block.id,
    });

    return true;
  }

  refreshToolUse(session, runState, toolUseId, toolUse) {
    const previousToolUse = runState.toolUses.get(toolUseId);
    if (areToolUseSummariesEqual(previousToolUse, toolUse)) {
      return false;
    }

    runState.toolUses.set(toolUseId, toolUse);

    let updated = false;
    for (const message of session.messages) {
      if (message?.role !== 'event' || message.toolUseId !== toolUseId || message.status !== 'running') {
        continue;
      }

      message.kind = toolUse.kind;
      message.title = toolUse.runningTitle;
      message.content = toolUse.detail;
      message.toolCategory = toolUse.category;
      message.toolLabel = toolUse.detail;
      message.toolMeta = toolUse.toolMeta || null;
      message.toolName = toolUse.name;
      updated = true;
    }

    if (!updated) {
      return false;
    }

    session.updatedAt = new Date().toISOString();
    return true;
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

  finalizeAssistantSegment(session, runState) {
    const assistant = this.getAssistantMessage(session, runState);
    if (!assistant) {
      return;
    }

    if (!assistant.content) {
      session.messages = session.messages.filter((message) => message.id !== assistant.id);
    } else {
      assistant.streaming = false;
    }

    runState.assistantMessageId = null;
    runState.currentAssistantText = '';
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
      !partial.toolUseId &&
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

  getWindowRunStates(contentsId) {
    if (!this.windowRuns.has(contentsId)) {
      this.windowRuns.set(contentsId, new Map());
    }

    return this.windowRuns.get(contentsId);
  }

  getRunState(contentsId, workspaceId, sessionId) {
    const windowRuns = this.getWindowRunStates(contentsId);
    const runKey = createRunKey(workspaceId, sessionId);

    if (!windowRuns.has(runKey)) {
      windowRuns.set(runKey, createRunState(workspaceId, sessionId));
    }

    return windowRuns.get(runKey);
  }

  findRunStateForSession(contentsId, workspaceId, sessionId) {
    if (!workspaceId || !sessionId) {
      return null;
    }

    const windowRuns = this.windowRuns.get(contentsId);
    if (!windowRuns) {
      return null;
    }

    return windowRuns.get(createRunKey(workspaceId, sessionId)) || null;
  }

  findRunStateByApprovalRequest(contentsId, requestId, workspaceId, sessionId) {
    if (!requestId) {
      return null;
    }

    const windowRuns = this.windowRuns.get(contentsId);
    if (!windowRuns) {
      return null;
    }

    if (workspaceId && sessionId) {
      const scopedRunState = windowRuns.get(createRunKey(workspaceId, sessionId));
      if (scopedRunState?.pendingApprovalRequests.has(requestId)) {
        return scopedRunState;
      }
    }

    for (const runState of windowRuns.values()) {
      if (runState.pendingApprovalRequests.has(requestId)) {
        return runState;
      }
    }

    return null;
  }

  getActiveRunStates() {
    const activeRuns = [];

    for (const windowRuns of this.windowRuns.values()) {
      for (const runState of windowRuns.values()) {
        if (runState.process) {
          activeRuns.push(runState);
        }
      }
    }

    return activeRuns;
  }

  getActiveRunLookup() {
    return new Map(
      this.getActiveRunStates()
        .filter((runState) => runState.workspaceId && runState.sessionId)
        .map((runState) => [createRunKey(runState.workspaceId, runState.sessionId), runState]),
    );
  }

  findActiveRunState(workspaceId, sessionId) {
    if (!workspaceId || !sessionId) {
      return null;
    }

    return this.getActiveRunLookup().get(createRunKey(workspaceId, sessionId)) || null;
  }

  resetRunState(runState) {
    if (!runState) {
      return;
    }

    runState.assistantMessageId = null;
    runState.currentAssistantText = '';
    runState.hasStreamedAssistantText = false;
    runState.process = null;
    runState.provider = DEFAULT_PROVIDER;
    runState.runToken = null;
    runState.sessionId = null;
    runState.workspaceId = null;
    runState.stderrBuffer = '';
    runState.seenToolResultIds.clear();
    runState.seenToolUseIds.clear();
    runState.toolUses.clear();
    runState.pendingApprovalRequests.clear();
    runState.resultIsError = false;
    runState.resultReceived = false;
  }

  deleteRunState(contentsId, workspaceId, sessionId) {
    if (!workspaceId || !sessionId) {
      return;
    }

    const windowRuns = this.windowRuns.get(contentsId);
    if (!windowRuns) {
      return;
    }

    windowRuns.delete(createRunKey(workspaceId, sessionId));
    if (windowRuns.size === 0) {
      this.windowRuns.delete(contentsId);
    }
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

    return workspace.sessions.find((session) => session.id === this.store.selectedSessionId && !session.archived) || null;
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

  requireCommandSession(workspaceId, sessionId) {
    const sessionRef = this.findSessionByIds(workspaceId, sessionId);
    if (!sessionRef) {
      throw new Error('请先创建或选择一个对话。');
    }

    return sessionRef;
  }

  touchWorkspace(workspace, timestamp = new Date().toISOString()) {
    workspace.updatedAt = timestamp;
  }

  refreshProviderInfo(force = false) {
    const cliEnv = getCliProcessEnv(force);
    this.claudeInfo = inspectProvider('claude', cliEnv, force, this.claudeInfo);
    this.codexInfo = inspectProvider('codex', cliEnv, force, this.codexInfo);

    return {
      claude: this.claudeInfo,
      codex: this.codexInfo,
    };
  }

  loadStore() {
    const emptyStore = {
      enabledProviders: SESSION_PROVIDER_KEYS.slice(),
      expandedWorkspaceIds: [],
      paneLayout: null,
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
          approvalRules: [],
          createdAt: new Date().toISOString(),
          id: randomUUID(),
          name: path.basename(migratedPath) || migratedPath,
          path: migratedPath,
          sessions: [],
          updatedAt: new Date().toISOString(),
        };

        return {
          enabledProviders: SESSION_PROVIDER_KEYS.slice(),
          expandedWorkspaceIds: [migratedWorkspace.id],
          paneLayout: null,
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
      const expandedWorkspaceIds = Array.isArray(parsed.expandedWorkspaceIds)
        ? parsed.expandedWorkspaceIds.filter((workspaceId, index, items) => (
          typeof workspaceId === 'string'
          && workspaces.some((workspace) => workspace.id === workspaceId)
          && items.indexOf(workspaceId) === index
        ))
        : [];

      return {
        enabledProviders: normalizeEnabledProviders(parsed.enabledProviders),
        expandedWorkspaceIds,
        paneLayout: normalizePaneLayoutState(parsed.paneLayout),
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
      enabledProviders: this.getEnabledProviders(),
      expandedWorkspaceIds: this.store.expandedWorkspaceIds,
      paneLayout: normalizePaneLayoutState(this.store.paneLayout),
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
    approvalRules: normalizeWorkspaceApprovalRules(workspace.approvalRules),
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
  const provider = normalizeSessionProvider(session.provider);
  const normalizedMessages = Array.isArray(session.messages)
    ? session.messages.map((message) => normalizeMessage(message)).filter(Boolean)
    : [];
  const normalizedStatus = session.status === 'running' ? 'idle' : (session.status || 'idle');

  return {
    archived: Boolean(session.archived),
    claudeSessionId: session.claudeSessionId || null,
    currentModel: session.currentModel || session.model || '',
    createdAt,
    id: session.id || randomUUID(),
    messages: normalizeStaleRunningEventMessages(normalizedMessages),
    model: session.model || '',
    permissionMode: normalizeSessionPermissionMode(session.permissionMode),
    provider,
    status: normalizedStatus,
    title: session.title || `新对话 ${formatShortTime(createdAt)}`,
    updatedAt,
  };
}

function normalizePaneLayoutState(paneLayout) {
  if (!paneLayout || typeof paneLayout !== 'object') {
    return null;
  }

  const normalizedPanes = Array.isArray(paneLayout.panes)
    ? paneLayout.panes
      .map((pane, index) => {
        if (!pane || typeof pane !== 'object') {
          return null;
        }

        const sessionId = typeof pane.sessionId === 'string' && pane.sessionId.trim() ? pane.sessionId.trim() : null;
        const workspaceId = typeof pane.workspaceId === 'string' && pane.workspaceId.trim() ? pane.workspaceId.trim() : null;

        return {
          id: typeof pane.id === 'string' && pane.id.trim() ? pane.id.trim() : `pane-${index + 1}`,
          sessionId,
          workspaceId,
        };
      })
      .filter(Boolean)
    : [];

  if (normalizedPanes.length === 0) {
    return null;
  }

  const focusedPaneId = normalizedPanes.some((pane) => pane.id === paneLayout.focusedPaneId)
    ? paneLayout.focusedPaneId
    : normalizedPanes[0].id;
  const recentPaneIds = Array.isArray(paneLayout.recentPaneIds)
    ? paneLayout.recentPaneIds
      .filter((paneId, index, items) => (
        typeof paneId === 'string'
        && normalizedPanes.some((pane) => pane.id === paneId)
        && items.indexOf(paneId) === index
      ))
    : [];

  return {
    focusedPaneId,
    panes: normalizedPanes,
    recentPaneIds,
  };
}

function normalizeWorkspaceApprovalRules(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const rules = [];
  const seenKeys = new Set();

  for (const entry of value) {
    const rule = normalizeWorkspaceApprovalRule(entry);
    if (!rule || seenKeys.has(rule.key)) {
      continue;
    }

    seenKeys.add(rule.key);
    rules.push(rule);
  }

  return rules;
}

function normalizeWorkspaceApprovalRule(rule) {
  if (!rule || typeof rule !== 'object') {
    return null;
  }

  const kind = typeof rule.kind === 'string' ? rule.kind.trim() : '';
  if (kind !== 'command') {
    return null;
  }

  const command = normalizeApprovalCommand(getToolInputString(rule.input, ['command', 'cmd']) || rule.command);
  if (!command) {
    return null;
  }

  return {
    command,
    createdAt: rule.createdAt || new Date().toISOString(),
    input: rule.input && typeof rule.input === 'object' ? rule.input : { command },
    key: `command:${command}`,
    kind: 'command',
    toolName: typeof rule.toolName === 'string' && rule.toolName.trim() ? rule.toolName.trim() : 'Bash',
  };
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  return {
    attachments: normalizeMessageAttachments(message.attachments),
    content: typeof message.content === 'string' ? message.content : '',
    createdAt: message.createdAt || new Date().toISOString(),
    error: Boolean(message.error),
    id: message.id || randomUUID(),
    kind: message.kind || null,
    role: message.role || 'event',
    status: message.status || null,
    streaming: false,
    title: message.title || '',
    toolCategory: typeof message.toolCategory === 'string' ? message.toolCategory : '',
    toolLabel: typeof message.toolLabel === 'string' ? message.toolLabel : '',
    toolMeta: normalizeToolMeta(message.toolMeta),
    toolName: typeof message.toolName === 'string' ? message.toolName : '',
    toolUseId: typeof message.toolUseId === 'string' ? message.toolUseId : '',
  };
}

function normalizeStaleRunningEventMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  return messages.map((message) => {
    if (message?.role !== 'event' || message.status !== 'running') {
      return message;
    }

    return {
      ...message,
      status: 'stopped',
      title: getStoppedToolTitle(message),
    };
  });
}

function normalizeToolMeta(toolMeta) {
  if (!toolMeta || typeof toolMeta !== 'object') {
    return null;
  }

  if (toolMeta.type === 'edit') {
    const filePath = typeof toolMeta.filePath === 'string' ? toolMeta.filePath : '';
    const fileNameSource = typeof toolMeta.fileName === 'string' ? toolMeta.fileName : '';
    const fileName = fileNameSource || (filePath ? path.basename(filePath) : '');

    return {
      addedLines: normalizeLineCount(toolMeta.addedLines),
      deletedLines: normalizeLineCount(toolMeta.deletedLines),
      fileName,
      filePath,
      type: 'edit',
    };
  }

  return null;
}

function normalizeSessionPermissionMode(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return SESSION_PERMISSION_MODES.has(normalized) ? normalized : 'default';
}

function normalizeSessionProvider(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SESSION_PROVIDERS.has(normalized) ? normalized : DEFAULT_PROVIDER;
}

function normalizeEnabledProviders(value) {
  if (!Array.isArray(value)) {
    return SESSION_PROVIDER_KEYS.slice();
  }

  const requestedProviders = new Set(
    value
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => SESSION_PROVIDERS.has(entry)),
  );
  const normalizedProviders = SESSION_PROVIDER_KEYS.filter((provider) => requestedProviders.has(provider));

  return normalizedProviders.length > 0 ? normalizedProviders : SESSION_PROVIDER_KEYS.slice();
}

function normalizeLineCount(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function normalizeMessageAttachments(value, options = {}) {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const normalized = [];
  const seenPaths = new Set();

  for (const entry of value) {
    const attachment = normalizeMessageAttachment(entry, options);
    if (!attachment || seenPaths.has(attachment.path)) {
      continue;
    }

    seenPaths.add(attachment.path);
    normalized.push(attachment);
  }

  return normalized;
}

function normalizeMessageAttachment(entry, options = {}) {
  const verifyExists = Boolean(options.verifyExists);
  const rawPath = typeof entry === 'string'
    ? entry
    : (typeof entry?.path === 'string' ? entry.path : '');

  const trimmedPath = rawPath.trim();
  if (!trimmedPath) {
    return null;
  }

  const resolvedPath = path.resolve(trimmedPath);
  if (verifyExists) {
    try {
      const stats = fs.statSync(resolvedPath);
      if (!stats.isFile()) {
        return null;
      }
    } catch {
      return null;
    }
  }

  const name = typeof entry?.name === 'string' && entry.name.trim()
    ? entry.name.trim()
    : path.basename(resolvedPath);
  const kind = normalizeAttachmentKind(entry?.kind, resolvedPath);

  return {
    kind,
    name,
    path: resolvedPath,
  };
}

function normalizeAttachmentKind(kind, filePath) {
  if (kind === 'image' || kind === 'file') {
    return kind;
  }

  const extension = path.extname(filePath || '').toLowerCase();
  return IMAGE_FILE_EXTENSIONS.has(extension) ? 'image' : 'file';
}

function createPastedAttachmentFileName(entry) {
  const extension = getPastedAttachmentExtension(entry);
  const rawName = typeof entry?.name === 'string' ? entry.name.trim() : '';
  const nameWithoutExtension = rawName
    ? path.basename(rawName, path.extname(rawName))
    : (entry?.kind === 'image' ? 'pasted-image' : 'pasted-file');
  const safeBaseName = sanitizeAttachmentBaseName(nameWithoutExtension) || (entry?.kind === 'image' ? 'pasted-image' : 'pasted-file');
  return `${safeBaseName}-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
}

function getPastedAttachmentExtension(entry) {
  const rawName = typeof entry?.name === 'string' ? entry.name.trim() : '';
  const nameExtension = path.extname(rawName || '');
  if (nameExtension) {
    return nameExtension.toLowerCase();
  }

  const mimeType = typeof entry?.mimeType === 'string' ? entry.mimeType.trim().toLowerCase() : '';
  const extensionFromMime = MIME_TYPE_TO_EXTENSION[mimeType];
  if (extensionFromMime) {
    return extensionFromMime;
  }

  return entry?.kind === 'image' ? '.png' : '.bin';
}

function sanitizeAttachmentBaseName(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function createRunKey(workspaceId, sessionId) {
  return `${workspaceId || ''}::${sessionId || ''}`;
}

function createRunState(workspaceId = null, sessionId = null) {
  return {
    assistantMessageId: null,
    currentAssistantText: '',
    hasStreamedAssistantText: false,
    pendingApprovalRequests: new Map(),
    process: null,
    provider: DEFAULT_PROVIDER,
    resultIsError: false,
    resultReceived: false,
    runToken: null,
    seenToolResultIds: new Set(),
    seenToolUseIds: new Set(),
    sessionId,
    stderrBuffer: '',
    toolUses: new Map(),
    workspaceId,
  };
}

function serializeWorkspace(workspace, activeRunLookup, includeGitInfo = false) {
  const gitInfo = includeGitInfo ? getWorkspaceGitInfo(workspace.path) : null;
  const sessionMetas = workspace.sessions
    .filter((session) => !session.archived)
    .slice()
    .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))
    .map((session) => serializeSessionMeta(workspace, session, activeRunLookup));

  return {
    createdAt: workspace.createdAt,
    exists: directoryExists(workspace.path),
    gitAddedLines: Number.isFinite(gitInfo?.addedLines) ? gitInfo.addedLines : 0,
    gitBranch: gitInfo?.branch || '',
    gitDeletedLines: Number.isFinite(gitInfo?.deletedLines) ? gitInfo.deletedLines : 0,
    gitDirty: Boolean(gitInfo?.dirty),
    gitRoot: gitInfo?.root || '',
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    sessions: sessionMetas,
    updatedAt: workspace.updatedAt,
  };
}

function serializeSession(workspace, session, activeRunLookup) {
  const activeRun = activeRunLookup.get(createRunKey(workspace.id, session.id)) || null;
  const pendingApprovals = activeRun
      ? Array.from(activeRun.pendingApprovalRequests.values())
        .map((approval) => serializePendingApproval(approval))
        .filter(Boolean)
      : [];

  return {
    archived: Boolean(session.archived),
    claudeSessionId: session.claudeSessionId,
    currentModel: session.currentModel || session.model || '',
    createdAt: session.createdAt,
    id: session.id,
    isRunning: Boolean(activeRun?.process),
    messages: session.messages,
    model: session.model,
    pendingApprovals,
    path: workspace.path,
    permissionMode: normalizeSessionPermissionMode(session.permissionMode),
    provider: normalizeSessionProvider(session.provider),
    providerLocked: isSessionProviderLocked(session),
    status: session.status,
    title: session.title,
    updatedAt: session.updatedAt,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  };
}

function serializeSessionMeta(workspace, session, activeRunLookup) {
  const previewSource = getLatestPreviewMessage(session.messages);
  const activeRun = activeRunLookup.get(createRunKey(workspace.id, session.id)) || null;

  return {
    archived: Boolean(session.archived),
    claudeSessionId: session.claudeSessionId,
    currentModel: session.currentModel || session.model || '',
    id: session.id,
    isRunning: Boolean(activeRun?.process),
    messageCount: session.messages.filter((message) => message.role !== 'event').length,
    permissionMode: normalizeSessionPermissionMode(session.permissionMode),
    provider: normalizeSessionProvider(session.provider),
    providerLocked: isSessionProviderLocked(session),
    preview: previewSource ? (truncateText(getMessagePreviewText(previewSource), 80) || '还没有消息') : '还没有消息',
    status: session.status,
    title: session.title,
    updatedAt: session.updatedAt,
  };
}

function serializeWorkspaceGitDiffView(workspace) {
  const gitInfo = getWorkspaceGitInfo(workspace.path);
  if (!gitInfo) {
    throw new Error('当前工作目录不是 Git 仓库。');
  }

  const files = collectWorkspaceGitDiffEntries(gitInfo.root);
  const summary = files.reduce((stats, file) => ({
    addedLines: stats.addedLines + (Number.isFinite(file.addedLines) ? file.addedLines : 0),
    deletedLines: stats.deletedLines + (Number.isFinite(file.deletedLines) ? file.deletedLines : 0),
    filesChanged: stats.filesChanged + 1,
  }), {
    addedLines: 0,
    deletedLines: 0,
    filesChanged: 0,
  });

  return {
    dirty: summary.filesChanged > 0,
    files,
    gitBranch: gitInfo.branch,
    gitRoot: gitInfo.root,
    summary,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspacePath: workspace.path,
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

function createWorkspaceSession(createdAt = new Date().toISOString(), provider = DEFAULT_PROVIDER) {
  return {
    claudeSessionId: null,
    currentModel: '',
    createdAt,
    archived: false,
    id: randomUUID(),
    messages: [],
    model: '',
    permissionMode: 'default',
    provider: normalizeSessionProvider(provider),
    status: 'idle',
    title: `新对话 ${formatShortTime(createdAt)}`,
    updatedAt: createdAt,
  };
}

function ensureWorkspaceHasVisibleSession(workspace) {
  if (!workspace || !Array.isArray(workspace.sessions)) {
    return null;
  }

  const latestVisibleSession = getLatestVisibleSession(workspace);
  if (latestVisibleSession) {
    return latestVisibleSession;
  }

  const session = createWorkspaceSession();
  workspace.sessions.unshift(session);
  return session;
}

function createApprovalRuleFromPendingApproval(approval) {
  if (!approval || inferApprovalCategory(approval) !== 'command') {
    return null;
  }

  const command = normalizeApprovalCommand(getToolInputString(approval.input, ['command', 'cmd']));
  if (!command) {
    return null;
  }

  return {
    command,
    createdAt: new Date().toISOString(),
    input: approval.input && typeof approval.input === 'object' ? approval.input : { command },
    key: `command:${command}`,
    kind: 'command',
    toolName: typeof approval.toolName === 'string' && approval.toolName.trim() ? approval.toolName.trim() : 'Bash',
  };
}

function addWorkspaceApprovalRule(workspace, rule) {
  if (!workspace || !rule) {
    return false;
  }

  const existingRules = normalizeWorkspaceApprovalRules(workspace.approvalRules);
  if (existingRules.some((entry) => entry.key === rule.key)) {
    workspace.approvalRules = existingRules;
    return false;
  }

  workspace.approvalRules = [...existingRules, rule];
  return true;
}

function workspaceHasMatchingApprovalRule(workspace, approval) {
  if (!workspace || !approval || inferApprovalCategory(approval) !== 'command') {
    return false;
  }

  const command = normalizeApprovalCommand(getToolInputString(approval.input, ['command', 'cmd']));
  if (!command) {
    return false;
  }

  const targetKey = `command:${command}`;
  const rules = normalizeWorkspaceApprovalRules(workspace.approvalRules);
  if (rules.length !== (Array.isArray(workspace.approvalRules) ? workspace.approvalRules.length : 0)) {
    workspace.approvalRules = rules;
  }

  return rules.some((rule) => rule.key === targetKey);
}

function normalizeApprovalCommand(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferApprovalCategory(approval) {
  if (!approval || typeof approval !== 'object') {
    return 'generic';
  }

  const explicitCategory = typeof approval.category === 'string'
    ? approval.category.trim().toLowerCase()
    : '';

  if (explicitCategory && explicitCategory !== 'generic') {
    return explicitCategory;
  }

  const command = normalizeApprovalCommand(getToolInputString(approval.input, ['command', 'cmd']));
  if (command) {
    return 'command';
  }

  const text = [
    approval.toolName,
    approval.tool_name,
    approval.displayName,
    approval.display_name,
    approval.title,
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    .toLowerCase();

  if (/\bbash\b|\bshell\b|\bcommand\b/.test(text)) {
    return 'command';
  }

  return explicitCategory || 'generic';
}

function serializePendingApproval(approval) {
  if (!approval || typeof approval !== 'object') {
    return null;
  }

  return {
    blockedPath: typeof approval.blockedPath === 'string' ? approval.blockedPath : '',
    category: inferApprovalCategory(approval),
    createdAt: approval.createdAt || new Date().toISOString(),
    decisionReason: typeof approval.decisionReason === 'string' ? approval.decisionReason : '',
    description: typeof approval.description === 'string' ? approval.description : '',
    detail: typeof approval.detail === 'string' ? approval.detail : '',
    displayName: typeof approval.displayName === 'string' ? approval.displayName : '',
    requestId: typeof approval.requestId === 'string' ? approval.requestId : '',
    title: typeof approval.title === 'string' ? approval.title : '',
    toolName: typeof approval.toolName === 'string' ? approval.toolName : '',
    toolUseId: typeof approval.toolUseId === 'string' ? approval.toolUseId : '',
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

function formatAttachmentTitle(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return '';
  }

  const names = attachments
    .map((attachment) => attachment?.name || path.basename(attachment?.path || ''))
    .filter(Boolean)
    .slice(0, 2);

  if (names.length === 0) {
    return '';
  }

  if (attachments.length > names.length) {
    names.push(`+${attachments.length - names.length}`);
  }

  return names.join(' ');
}

function collectAttachmentDirectories(workspacePath, attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const directories = new Set();
  for (const attachment of attachments) {
    if (!attachment?.path) {
      continue;
    }

    if (isPathWithin(workspacePath, attachment.path)) {
      continue;
    }

    directories.add(path.dirname(attachment.path));
  }

  return Array.from(directories);
}

function isPathWithin(basePath, candidatePath) {
  const relativePath = path.relative(path.resolve(basePath), path.resolve(candidatePath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function resolveLinkToLocalPath(href) {
  if (typeof href !== 'string' || !href) {
    return '';
  }

  if (href.startsWith('file://')) {
    try {
      return fileURLToPath(href);
    } catch {
      return '';
    }
  }

  if (!path.isAbsolute(href)) {
    return '';
  }

  return stripPathHashAndQuery(href);
}

function stripPathHashAndQuery(value) {
  const hashIndex = value.indexOf('#');
  const queryIndex = value.indexOf('?');
  const endIndexCandidates = [hashIndex, queryIndex].filter((index) => index >= 0);
  const endIndex = endIndexCandidates.length > 0 ? Math.min(...endIndexCandidates) : value.length;
  return value.slice(0, endIndex);
}

function buildPromptWithAttachments(prompt, attachments) {
  const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return trimmedPrompt;
  }

  const fileReferences = attachments
    .filter((attachment) => attachment.kind !== 'image')
    .map((attachment) => `@${attachment.path}`);
  const imageReferences = attachments
    .filter((attachment) => attachment.kind === 'image')
    .map((attachment) => attachment.path);
  const sections = [];

  if (fileReferences.length > 0) {
    sections.push(`Attached files:\n${fileReferences.join('\n')}`);
  }

  if (imageReferences.length > 0) {
    sections.push(`Attached images:\n${imageReferences.join('\n')}`);
  }

  sections.push(`User request:\n${trimmedPrompt || 'Please inspect the attached files and images and help me with them.'}`);
  return sections.join('\n\n').trim();
}

function buildClaudeExecArgs({ extraAttachmentDirs, model, permissionMode, sessionId }) {
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--replay-user-messages',
    '--permission-prompt-tool',
    'stdio',
    '--verbose',
  ];

  if (Array.isArray(extraAttachmentDirs) && extraAttachmentDirs.length > 0) {
    args.push('--add-dir', ...extraAttachmentDirs);
  }

  if (model) {
    args.push('--model', model);
  }

  args.push('--permission-mode', normalizeSessionPermissionMode(permissionMode));

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  return args;
}

function buildCodexExecArgs({ attachments, extraAttachmentDirs, model, prompt, sessionId }) {
  const options = ['--json', '--skip-git-repo-check'];
  if (model) {
    options.push('--model', model);
  }

  if (Array.isArray(extraAttachmentDirs) && extraAttachmentDirs.length > 0) {
    options.push('--add-dir', ...extraAttachmentDirs);
  }

  const imageAttachments = Array.isArray(attachments)
    ? attachments.filter((attachment) => attachment?.kind === 'image' && attachment.path)
    : [];
  if (imageAttachments.length > 0) {
    options.push('-i', ...imageAttachments.map((attachment) => attachment.path));
  }

  if (sessionId) {
    return ['exec', 'resume', ...options, sessionId, prompt];
  }

  return ['exec', ...options, prompt];
}

function createStreamJsonUserMessage(prompt, sessionId, providerLabel = 'Claude') {
  return {
    message: {
      content: prompt,
      role: 'user',
    },
    parent_tool_use_id: null,
    session_id: typeof sessionId === 'string' ? sessionId : '',
    type: 'user',
  };
}

function createApprovalControlResponse(approval, decision) {
  const toolUseId = typeof approval?.toolUseId === 'string' && approval.toolUseId
    ? approval.toolUseId
    : undefined;

  const response = decision === 'allow'
    ? {
      behavior: 'allow',
      ...(toolUseId ? { toolUseID: toolUseId } : {}),
      updatedInput: approval?.input && typeof approval.input === 'object' ? approval.input : {},
    }
    : {
      behavior: 'deny',
      message: 'User denied approval.',
      ...(toolUseId ? { toolUseID: toolUseId } : {}),
    };

  return {
    response: {
      request_id: approval?.requestId || '',
      response,
      subtype: 'success',
    },
    type: 'control_response',
  };
}

function writeJsonLine(stream, payload) {
  if (!stream || stream.destroyed || typeof stream.write !== 'function' || stream.writableEnded) {
    throw new Error('输入流已关闭。');
  }

  stream.write(`${JSON.stringify(payload)}\n`);
}

function closeClaudeInput(proc) {
  const input = proc?.stdin;
  if (!input || input.destroyed || input.writableEnded || typeof input.end !== 'function') {
    return;
  }

  try {
    input.end();
  } catch {
    // Ignore teardown races when Claude exits on its own.
  }
}

function finalizeRunningToolMessages(session, finalStatus = 'stopped') {
  if (!session || !Array.isArray(session.messages)) {
    return false;
  }

  let updated = false;
  for (const message of session.messages) {
    if (message?.role !== 'event' || message.status !== 'running') {
      continue;
    }

    message.status = finalStatus;
    if (finalStatus === 'stopped') {
      message.title = getStoppedToolTitle(message);
    }
    updated = true;
  }

  if (updated) {
    session.updatedAt = new Date().toISOString();
  }

  return updated;
}

function getStoppedToolTitle(message) {
  const category = message?.toolCategory || inferLegacyToolCategory(message);

  if (category === 'read') {
    return '已停止浏览文件';
  }

  if (category === 'browse') {
    return '已停止浏览目录';
  }

  if (category === 'search') {
    return '已停止执行搜索';
  }

  if (category === 'command') {
    return '已停止运行命令';
  }

  if (category === 'edit') {
    return '已停止编辑文件';
  }

  if (category === 'fetch') {
    return '已停止获取网页';
  }

  if (category === 'todo') {
    return '已停止更新待办';
  }

  if (category === 'mcp') {
    return '已停止调用 MCP';
  }

  if (category === 'skill') {
    return '已停止使用 Skill';
  }

  return '已停止执行操作';
}

function clearPendingApprovalByToolUseId(runState, toolUseId) {
  if (!runState?.pendingApprovalRequests || !toolUseId) {
    return false;
  }

  let deleted = false;
  for (const [requestId, approval] of runState.pendingApprovalRequests.entries()) {
    if (approval?.toolUseId !== toolUseId) {
      continue;
    }

    runState.pendingApprovalRequests.delete(requestId);
    deleted = true;
  }

  return deleted;
}

function isDefaultSessionTitle(title) {
  return typeof title === 'string' && title.startsWith('新对话 ');
}

function countRoleMessages(messages, role) {
  return messages.filter((message) => message.role === role).length;
}

function countInputMessages(messages) {
  return messages.filter((message) => (
    message.role === 'user'
    || (message.role === 'event' && message.kind === 'command')
  )).length;
}

function isSessionProviderLocked(session) {
  if (!session || !Array.isArray(session.messages)) {
    return false;
  }

  return countInputMessages(session.messages) > 0;
}

function classifyTool(name) {
  if (name === 'Skill') {
    return {
      kind: 'skill',
    };
  }

  if (name === 'Agent' || name === 'Task') {
    return {
      kind: 'agent',
    };
  }

  if (typeof name === 'string' && (name.startsWith('mcp__') || (!BUILTIN_TOOL_NAMES.has(name) && name.includes('__')))) {
    return {
      kind: 'mcp',
    };
  }

  return {
    kind: 'tool',
  };
}

function extractTextBlocks(content) {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

function describeToolUse(name, input) {
  const classification = classifyTool(name);

  if (name === 'Read') {
    return {
      category: 'read',
      completedTitle: '已浏览文件',
      detail: formatReadToolDetail(input),
      errorTitle: '浏览文件失败',
      kind: classification.kind,
      name,
      runningTitle: '正在浏览文件',
    };
  }

  if (name === 'Glob' || name === 'LS') {
    return {
      category: 'browse',
      completedTitle: '已浏览目录',
      detail: formatBrowseToolDetail(input),
      errorTitle: '浏览目录失败',
      kind: classification.kind,
      name,
      runningTitle: '正在浏览目录',
    };
  }

  if (name === 'Grep' || name === 'WebSearch') {
    return {
      category: 'search',
      completedTitle: '已执行搜索',
      detail: name === 'WebSearch' ? formatWebSearchToolDetail(input) : formatSearchToolDetail(input),
      errorTitle: '搜索失败',
      kind: classification.kind,
      name,
      runningTitle: '正在执行搜索',
    };
  }

  if (name === 'Bash') {
    return {
      category: 'command',
      completedTitle: '已运行命令',
      detail: formatCommandToolDetail(input),
      errorTitle: '命令运行失败',
      kind: classification.kind,
      name,
      runningTitle: '正在运行命令',
    };
  }

  if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') {
    return {
      category: 'edit',
      completedTitle: '已编辑文件',
      detail: formatEditToolDetail(name, input),
      errorTitle: '编辑文件失败',
      kind: classification.kind,
      name,
      runningTitle: '正在编辑文件',
      toolMeta: createEditToolMeta(name, input),
    };
  }

  if (name === 'WebFetch') {
    return {
      category: 'fetch',
      completedTitle: '已获取网页',
      detail: formatWebFetchToolDetail(input),
      errorTitle: '获取网页失败',
      kind: classification.kind,
      name,
      runningTitle: '正在获取网页',
    };
  }

  if (name === 'TodoWrite') {
    return {
      category: 'todo',
      completedTitle: '已更新待办',
      detail: 'Updated todo list',
      errorTitle: '更新待办失败',
      kind: classification.kind,
      name,
      runningTitle: '正在更新待办',
    };
  }

  if (classification.kind === 'skill') {
    return {
      category: 'skill',
      completedTitle: '已使用 Skill',
      detail: formatSkillToolDetail(input),
      errorTitle: 'Skill 执行失败',
      kind: classification.kind,
      name,
      runningTitle: '正在使用 Skill',
    };
  }

  if (classification.kind === 'mcp') {
    return {
      category: 'mcp',
      completedTitle: '已调用 MCP',
      detail: formatMcpToolDetail(name, input),
      errorTitle: 'MCP 调用失败',
      kind: classification.kind,
      name,
      runningTitle: '正在调用 MCP',
    };
  }

  return {
    category: 'generic',
    completedTitle: '已执行操作',
    detail: formatGenericToolDetail(name, input),
    errorTitle: '操作执行失败',
    kind: classification.kind,
    name,
    runningTitle: '正在执行操作',
  };
}

function formatReadToolDetail(input) {
  const filePath = getToolInputString(input, ['file_path', 'path']);
  return filePath ? `Read ${truncateText(filePath, 180)}` : 'Read file';
}

function formatBrowseToolDetail(input) {
  const pattern = getToolInputString(input, ['pattern', 'glob']);
  const directory = getToolInputString(input, ['path']);

  if (pattern && directory) {
    return `Browsed ${truncateText(`${directory}/${pattern}`, 180)}`;
  }

  if (pattern) {
    return `Browsed ${truncateText(pattern, 180)}`;
  }

  if (directory) {
    return `Browsed ${truncateText(directory, 180)}`;
  }

  return 'Browsed files';
}

function formatSearchToolDetail(input) {
  const pattern = getToolInputString(input, ['pattern', 'query']);
  const target = getToolInputString(input, ['include', 'glob', 'path']);

  if (pattern && target) {
    return `Searched for ${truncateText(pattern, 96)} in ${truncateText(target, 96)}`;
  }

  if (pattern) {
    return `Searched for ${truncateText(pattern, 160)}`;
  }

  if (target) {
    return `Searched ${truncateText(target, 160)}`;
  }

  return 'Searched files';
}

function formatCommandToolDetail(input) {
  const command = getToolInputString(input, ['command', 'cmd']);
  if (command) {
    return truncateText(command, 220);
  }

  const description = getToolInputString(input, ['description', 'prompt']);
  return description ? truncateText(description, 220) : 'Run command';
}

function formatEditToolDetail(name, input) {
  const filePath = getToolInputString(input, ['file_path', 'path']);
  const verb = name === 'Write' ? 'Wrote' : (name === 'NotebookEdit' ? 'Updated' : 'Edited');
  return filePath ? `${verb} ${truncateText(filePath, 180)}` : `${verb} file`;
}

function createEditToolMeta(name, input) {
  const filePath = getToolInputString(input, ['file_path', 'path']);
  const fileName = filePath ? path.basename(filePath) : '';

  if (!filePath) {
    return null;
  }

  if (name === 'Write') {
    const content = getToolInputText(input, ['content']);
    return {
      addedLines: countTextLines(content),
      deletedLines: 0,
      fileName,
      filePath,
      type: 'edit',
    };
  }

  const oldText = getToolInputText(input, ['old_string', 'old_content', 'old_source', 'old_text']);
  const newText = getToolInputText(input, ['new_string', 'new_content', 'new_source', 'new_text', 'content']);
  const addedLines = countTextLines(newText);
  const deletedLines = countTextLines(oldText);

  return {
    addedLines,
    deletedLines,
    fileName,
    filePath,
    type: 'edit',
  };
}

function formatWebFetchToolDetail(input) {
  const url = getToolInputString(input, ['url']);
  return url ? `Fetched ${truncateText(url, 180)}` : 'Fetched webpage';
}

function formatWebSearchToolDetail(input) {
  const query = getToolInputString(input, ['query', 'prompt']);
  return query ? `Searched web for ${truncateText(query, 180)}` : 'Searched the web';
}

function formatSkillToolDetail(input) {
  const skillName = getToolInputString(input, ['skill', 'skill_name', 'command', 'name']);
  return skillName ? truncateText(skillName, 180) : 'Skill';
}

function areToolUseSummariesEqual(previousToolUse, nextToolUse) {
  if (!previousToolUse || !nextToolUse) {
    return false;
  }

  return previousToolUse.category === nextToolUse.category
    && previousToolUse.completedTitle === nextToolUse.completedTitle
    && previousToolUse.detail === nextToolUse.detail
    && previousToolUse.errorTitle === nextToolUse.errorTitle
    && previousToolUse.kind === nextToolUse.kind
    && previousToolUse.name === nextToolUse.name
    && previousToolUse.runningTitle === nextToolUse.runningTitle
    && areToolMetaEqual(previousToolUse.toolMeta, nextToolUse.toolMeta);
}

function areToolMetaEqual(previousToolMeta, nextToolMeta) {
  if (!previousToolMeta && !nextToolMeta) {
    return true;
  }

  if (!previousToolMeta || !nextToolMeta) {
    return false;
  }

  return previousToolMeta.type === nextToolMeta.type
    && previousToolMeta.fileName === nextToolMeta.fileName
    && previousToolMeta.filePath === nextToolMeta.filePath
    && previousToolMeta.addedLines === nextToolMeta.addedLines
    && previousToolMeta.deletedLines === nextToolMeta.deletedLines;
}

function formatMcpToolDetail(name, input) {
  const detail = summarizeGenericToolLabel(input, 180);
  const prefix = name || 'MCP tool';
  return detail ? truncateText(`${prefix} ${detail}`, 220) : truncateText(prefix, 220);
}

function formatGenericToolDetail(name, input) {
  const detail = summarizeGenericToolLabel(input, 180);
  return detail ? truncateText(`${name || 'Tool'} ${detail}`, 220) : (name || 'Tool');
}

function summarizeGenericToolLabel(input, maxLength) {
  if (input == null) {
    return '';
  }

  const value = getToolInputString(input, [
    'file_path',
    'path',
    'pattern',
    'query',
    'url',
    'command',
    'description',
    'prompt',
  ]);

  if (value) {
    return truncateText(value, maxLength);
  }

  const serialized = truncateText(stringifyValue(input), maxLength);
  return serialized === '{}' ? '' : serialized;
}

function getToolInputString(input, keys) {
  if (!input || typeof input !== 'object') {
    return '';
  }

  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key].trim()) {
      return input[key].trim();
    }
  }

  return '';
}

function getToolInputText(input, keys) {
  if (!input || typeof input !== 'object') {
    return '';
  }

  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key].length > 0) {
      return input[key];
    }
  }

  return '';
}

function countTextLines(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 0;
  }

  const normalized = value.replace(/\r\n/g, '\n');
  const segments = normalized.split('\n');
  while (segments.length > 1 && segments[segments.length - 1] === '') {
    segments.pop();
  }

  return segments.length;
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

function formatProcessFailure(providerLabel, code, stderrBuffer) {
  const summary = code == null
    ? `${providerLabel} 进程启动失败。`
    : `${providerLabel} 进程异常结束，退出码 ${code}。`;
  const details = stderrBuffer ? `\n\n${stderrBuffer.trim()}` : '';
  return truncateText(`${summary}${details}`, STDERR_BUFFER_LIMIT);
}

function formatCodexTurnFailure(event, stderrBuffer) {
  const parts = [
    event?.error?.message,
    event?.message,
    stderrBuffer,
  ].filter(Boolean);

  return truncateText(parts.join('\n\n'), STDERR_BUFFER_LIMIT);
}

function extractCodexAssistantText(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  if (typeof payload.text === 'string' && payload.text.trim()) {
    return payload.text;
  }

  if (typeof payload.delta === 'string' && payload.delta.trim()) {
    return payload.delta;
  }

  const item = payload.item && typeof payload.item === 'object' ? payload.item : payload;
  if (item.type === 'assistant_message' || item.type === 'agent_message' || item.type === 'message') {
    if (typeof item.text === 'string' && item.text.trim()) {
      return item.text;
    }

    if (Array.isArray(item.content)) {
      const text = item.content
        .map((block) => {
          if (typeof block === 'string') {
            return block;
          }

          if (typeof block?.text === 'string') {
            return block.text;
          }

          return '';
        })
        .join('');
      if (text.trim()) {
        return text;
      }
    }
  }

  return '';
}

function describeCodexItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const type = typeof item.type === 'string' ? item.type.trim() : '';
  if (!type || type === 'assistant_message' || type === 'agent_message' || type === 'message') {
    return null;
  }

  if (type === 'command_execution') {
    const command = truncateText(item.command || item.cmd || 'Run command', 220);
    const output = truncateText(item.aggregated_output || item.output || '', STDERR_BUFFER_LIMIT);
    return {
      category: 'command',
      completedDetail: output ? `${command}\n\n${output}` : command,
      completedTitle: '命令已完成',
      detail: command,
      errorTitle: '命令执行失败',
      kind: 'command',
      name: 'command_execution',
      runningTitle: '正在执行命令',
      status: Number.isFinite(item.exit_code) && item.exit_code !== 0 ? 'error' : 'completed',
      toolUseId: item.call_id || item.id || '',
    };
  }

  if (type === 'mcp_tool_call') {
    const server = typeof item.server === 'string' ? item.server.trim() : '';
    const tool = typeof item.tool === 'string' ? item.tool.trim() : '';
    const detail = [server, tool].filter(Boolean).join(' · ') || 'MCP tool';
    const resultText = truncateText(item.result || item.output || '', STDERR_BUFFER_LIMIT);
    return {
      category: 'mcp',
      completedDetail: resultText ? `${detail}\n\n${resultText}` : detail,
      completedTitle: 'MCP 已完成',
      detail,
      errorTitle: 'MCP 调用失败',
      kind: 'mcp',
      name: 'mcp_tool_call',
      runningTitle: '正在调用 MCP',
      status: item.error ? 'error' : 'completed',
      toolUseId: item.call_id || item.id || '',
    };
  }

  if (type === 'file_change') {
    const filePath = typeof item.path === 'string' ? item.path.trim() : '';
    const changeKind = typeof item.change_type === 'string' ? item.change_type.trim() : '';
    const detail = [changeKind, filePath].filter(Boolean).join(' · ') || 'Updated file';
    return {
      category: 'edit',
      completedDetail: detail,
      completedTitle: '文件已更新',
      detail,
      errorTitle: '文件更新失败',
      kind: 'edit',
      name: 'file_change',
      runningTitle: '正在更新文件',
      status: 'completed',
      toolMeta: createEditToolMetaFromCodexItem(item),
      toolUseId: item.call_id || item.id || filePath,
    };
  }

  if (type === 'web_search') {
    const query = truncateText(item.query || item.prompt || 'Web search', 220);
    return {
      category: 'fetch',
      completedDetail: query,
      completedTitle: '已完成检索',
      detail: query,
      errorTitle: '检索失败',
      kind: 'status',
      name: 'web_search',
      runningTitle: '正在检索',
      status: 'completed',
      toolUseId: item.call_id || item.id || query,
    };
  }

  if (type === 'reasoning') {
    return null;
  }

  const detail = truncateText(stringifyValue(item), 220);
  return {
    category: 'generic',
    completedDetail: detail,
    completedTitle: '操作已完成',
    detail,
    errorTitle: '操作失败',
    kind: 'status',
    name: type || 'item',
    runningTitle: '正在执行操作',
    status: 'completed',
    toolUseId: item.call_id || item.id || '',
  };
}

function createEditToolMetaFromCodexItem(item) {
  const filePath = typeof item?.path === 'string' ? item.path.trim() : '';
  if (!filePath) {
    return null;
  }

  return {
    addedLines: null,
    deletedLines: null,
    fileName: path.basename(filePath),
    filePath,
    type: 'edit',
  };
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

function getMessagePreviewText(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }

  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if (content) {
    return content;
  }

  return formatAttachmentTitle(message.attachments);
}

function getLatestVisibleSession(workspace) {
  return workspace.sessions
    .filter((session) => !session.archived)
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

function getWorkspaceGitInfo(workspacePath) {
  if (!directoryExists(workspacePath)) {
    return null;
  }

  const cached = workspaceGitInfoCache.get(workspacePath);
  const now = Date.now();
  if (cached && now - cached.checkedAt < WORKSPACE_GIT_INFO_TTL_MS) {
    return cached.value;
  }

  const value = resolveWorkspaceGitInfo(workspacePath);
  workspaceGitInfoCache.set(workspacePath, {
    checkedAt: now,
    value,
  });
  return value;
}

function collectWorkspaceGitDiffEntries(repoPath) {
  const baseRef = resolveGitDiffBaseRef(repoPath);
  const trackedEntries = getTrackedGitDiffEntries(repoPath, baseRef);
  const untrackedEntries = getUntrackedGitDiffEntries(repoPath);
  const entries = [...trackedEntries, ...untrackedEntries];

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function resolveGitDiffBaseRef(repoPath) {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: 1500,
  });

  return result.status === 0 ? 'HEAD' : EMPTY_TREE_HASH;
}

function getTrackedGitDiffEntries(repoPath, baseRef) {
  const nameStatusBuffer = runGitCommand(repoPath, ['diff', '--name-status', '-z', '--find-renames=1%', baseRef], 'buffer');
  const numstatBuffer = runGitCommand(repoPath, ['diff', '--numstat', '-z', '--find-renames=1%', baseRef], 'buffer');
  const patchText = runGitCommand(repoPath, ['diff', '--patch', '--no-ext-diff', '--find-renames=1%', baseRef], 'text');

  const patchMap = parseGitPatchMap(patchText);
  const numstatMap = parseGitNumstatMap(numstatBuffer);

  return parseGitNameStatusEntries(nameStatusBuffer).map((entry) => {
    const stats = numstatMap.get(entry.key) || { addedLines: 0, deletedLines: 0 };

    return {
      addedLines: stats.addedLines,
      deletedLines: stats.deletedLines,
      diff: patchMap.get(entry.key) || '',
      oldPath: entry.oldPath || '',
      path: entry.path,
      status: entry.status,
    };
  });
}

function getUntrackedGitDiffEntries(repoPath) {
  const output = runGitCommand(repoPath, ['ls-files', '--others', '--exclude-standard', '-z'], 'buffer');
  if (!output) {
    return [];
  }

  return output.toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((relativePath) => {
      const diff = getGitUntrackedDiff(repoPath, relativePath);
      const stats = parseUnifiedDiffStats(diff);

      return {
        addedLines: stats.addedLines,
        deletedLines: stats.deletedLines,
        diff,
        oldPath: '',
        path: relativePath,
        status: 'untracked',
      };
    });
}

function runGitCommand(repoPath, args, outputType = 'text') {
  try {
    const result = spawnSync('git', args, {
      cwd: repoPath,
      encoding: outputType === 'buffer' ? 'buffer' : 'utf8',
      timeout: 1500,
    });

    if (result.error) {
      return outputType === 'buffer' ? Buffer.alloc(0) : '';
    }

    if (outputType === 'buffer') {
      return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || '', 'utf8');
    }

    return typeof result.stdout === 'string' ? result.stdout : String(result.stdout || '');
  } catch {
    return outputType === 'buffer' ? Buffer.alloc(0) : '';
  }
}

function parseGitNameStatusEntries(buffer) {
  if (!buffer || !buffer.length) {
    return [];
  }

  const tokens = buffer.toString('utf8').split('\0').filter(Boolean);
  const entries = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }

    const statusCode = token[0];
    if (statusCode === 'R' || statusCode === 'C') {
      const oldPath = tokens[index + 1] || '';
      const nextPath = tokens[index + 2] || '';
      entries.push({
        key: nextPath,
        oldPath,
        path: nextPath,
        status: normalizeGitDiffStatus(statusCode),
      });
      index += 2;
      continue;
    }

    const nextPath = tokens[index + 1] || '';
    entries.push({
      key: nextPath,
      oldPath: '',
      path: nextPath,
      status: normalizeGitDiffStatus(statusCode),
    });
    index += 1;
  }

  return entries;
}

function parseGitNumstatMap(buffer) {
  const entries = new Map();
  if (!buffer || !buffer.length) {
    return entries;
  }

  const tokens = buffer.toString('utf8').split('\0').filter((token, index, items) => (
    token !== '' || index !== items.length - 1
  ));

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }

    const [addedRaw, deletedRaw, filePath] = token.split('\t');
    if (filePath) {
      entries.set(filePath, {
        addedLines: parseGitNumstatCount(addedRaw),
        deletedLines: parseGitNumstatCount(deletedRaw),
      });
      continue;
    }

    const oldPath = tokens[index + 1] || '';
    const nextPath = tokens[index + 2] || '';
    if (oldPath || nextPath) {
      entries.set(nextPath, {
        addedLines: parseGitNumstatCount(addedRaw),
        deletedLines: parseGitNumstatCount(deletedRaw),
      });
      index += 2;
    }
  }

  return entries;
}

function parseGitNumstatCount(value) {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) ? count : 0;
}

function parseGitPatchMap(diffText) {
  const patches = new Map();
  if (!diffText) {
    return patches;
  }

  const chunks = diffText
    .split(/(?=^diff --git )/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const key = resolveGitPatchKey(chunk);
    if (key) {
      patches.set(key, chunk);
    }
  }

  return patches;
}

function resolveGitPatchKey(patchText) {
  const lines = patchText.split(/\r?\n/);
  const renameTo = matchGitPatchPath(lines, 'rename to ');
  if (renameTo) {
    return renameTo;
  }

  const copyTo = matchGitPatchPath(lines, 'copy to ');
  if (copyTo) {
    return copyTo;
  }

  const plusPath = normalizeGitPatchPath(matchGitPatchPath(lines, '+++ '));
  if (plusPath && plusPath !== '/dev/null') {
    return plusPath;
  }

  const minusPath = normalizeGitPatchPath(matchGitPatchPath(lines, '--- '));
  if (minusPath && minusPath !== '/dev/null') {
    return minusPath;
  }

  const diffHeader = lines[0]?.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (diffHeader?.[2]) {
    return diffHeader[2];
  }

  return '';
}

function matchGitPatchPath(lines, prefix) {
  const line = lines.find((entry) => entry.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

function normalizeGitPatchPath(value) {
  if (!value) {
    return '';
  }

  if (value === '/dev/null') {
    return value;
  }

  return value.replace(/^[ab]\//, '');
}

function getGitUntrackedDiff(repoPath, relativePath) {
  try {
    const result = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', '/dev/null', relativePath], {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 1500,
    });

    return typeof result.stdout === 'string' ? result.stdout.trim() : '';
  } catch {
    return '';
  }
}

function parseUnifiedDiffStats(diffText) {
  return diffText.split(/\r?\n/).reduce((stats, line) => {
    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      return stats;
    }

    if (line.startsWith('+')) {
      stats.addedLines += 1;
      return stats;
    }

    if (line.startsWith('-')) {
      stats.deletedLines += 1;
    }

    return stats;
  }, { addedLines: 0, deletedLines: 0 });
}

function normalizeGitDiffStatus(statusCode) {
  switch (statusCode) {
    case 'A':
      return 'added';
    case 'C':
      return 'copied';
    case 'D':
      return 'deleted';
    case 'M':
      return 'modified';
    case 'R':
      return 'renamed';
    case 'T':
      return 'type-changed';
    case 'U':
      return 'unmerged';
    default:
      return 'modified';
  }
}

function resolveWorkspaceGitInfo(workspacePath) {
  try {
    const options = {
      cwd: workspacePath,
      encoding: 'utf8',
      timeout: 1500,
    };
    const insideWorkTree = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], options);
    if (insideWorkTree.status !== 0 || insideWorkTree.stdout.trim() !== 'true') {
      return null;
    }

    const rootResult = spawnSync('git', ['rev-parse', '--show-toplevel'], options);
    const repoPath = rootResult.status === 0 ? rootResult.stdout.trim() : workspacePath;
    const repoOptions = {
      ...options,
      cwd: repoPath,
    };
    const branchResult = spawnSync('git', ['branch', '--show-current'], repoOptions);
    const statusResult = spawnSync('git', ['status', '--porcelain'], repoOptions);
    let branch = branchResult.status === 0 ? branchResult.stdout.trim() : '';

    if (!branch) {
      const detachedHeadResult = spawnSync('git', ['rev-parse', '--short', 'HEAD'], repoOptions);
      const commitSha = detachedHeadResult.status === 0 ? detachedHeadResult.stdout.trim() : '';
      branch = commitSha ? `detached@${commitSha}` : '';
    }

    if (!branch) {
      return null;
    }

    const stagedStats = getGitDiffLineStats(repoPath, ['diff', '--numstat', '--cached', '--find-renames', '--find-copies', '--no-ext-diff']);
    const unstagedStats = getGitDiffLineStats(repoPath, ['diff', '--numstat', '--find-renames', '--find-copies', '--no-ext-diff']);
    const untrackedStats = getGitUntrackedLineStats(repoPath);
    const diffStats = mergeGitLineStats(stagedStats, unstagedStats, untrackedStats);

    return {
      addedLines: diffStats.addedLines,
      branch,
      deletedLines: diffStats.deletedLines,
      dirty: statusResult.status === 0 && statusResult.stdout.trim().length > 0,
      root: repoPath,
    };
  } catch {
    return null;
  }
}

function getGitDiffLineStats(repoPath, args) {
  try {
    const result = spawnSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 1500,
    });

    if (result.status !== 0) {
      return { addedLines: 0, deletedLines: 0 };
    }

    return parseGitNumstatOutput(result.stdout);
  } catch {
    return { addedLines: 0, deletedLines: 0 };
  }
}

function getGitUntrackedLineStats(repoPath) {
  try {
    const result = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 1500,
    });

    if (result.status !== 0 || !result.stdout) {
      return { addedLines: 0, deletedLines: 0 };
    }

    let addedLines = 0;
    for (const relativePath of result.stdout.split('\0').filter(Boolean)) {
      addedLines += countTextFileLines(path.join(repoPath, relativePath));
    }

    return { addedLines, deletedLines: 0 };
  } catch {
    return { addedLines: 0, deletedLines: 0 };
  }
}

function parseGitNumstatOutput(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce((stats, line) => {
      const [addedRaw, deletedRaw] = line.split('\t');
      const addedLines = Number.parseInt(addedRaw, 10);
      const deletedLines = Number.parseInt(deletedRaw, 10);

      if (Number.isFinite(addedLines)) {
        stats.addedLines += addedLines;
      }

      if (Number.isFinite(deletedLines)) {
        stats.deletedLines += deletedLines;
      }

      return stats;
    }, { addedLines: 0, deletedLines: 0 });
}

function mergeGitLineStats(...entries) {
  return entries.reduce((stats, entry) => ({
    addedLines: stats.addedLines + (Number.isFinite(entry?.addedLines) ? entry.addedLines : 0),
    deletedLines: stats.deletedLines + (Number.isFinite(entry?.deletedLines) ? entry.deletedLines : 0),
  }), { addedLines: 0, deletedLines: 0 });
}

function countTextFileLines(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return 0;
    }

    const content = fs.readFileSync(filePath);
    if (content.length === 0 || content.includes(0)) {
      return 0;
    }

    let lineCount = 0;
    for (let index = 0; index < content.length; index += 1) {
      if (content[index] === 10) {
        lineCount += 1;
      }
    }

    return content[content.length - 1] === 10 ? lineCount : lineCount + 1;
  } catch {
    return 0;
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

function inspectProvider(provider, env, force, previousInfo = null) {
  const normalizedProvider = normalizeSessionProvider(provider);
  const previousCheckedAt = Number.isFinite(previousInfo?.checkedAt) ? previousInfo.checkedAt : 0;
  const now = Date.now();
  if (!force && previousCheckedAt && now - previousCheckedAt < CLAUDE_CHECK_TTL_MS) {
    return previousInfo;
  }

  const executablePath = resolveProviderExecutablePath(normalizedProvider, env);
  if (!executablePath) {
    return createUnavailableProviderInfo(normalizedProvider, now);
  }

  try {
    const result = spawnSync(executablePath, ['--version'], {
      encoding: 'utf8',
      env,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    return {
      available: result.status === 0,
      checkedAt: now,
      executablePath: result.status === 0 ? executablePath : '',
      models: result.status === 0 ? extractProviderModelCatalog(normalizedProvider, executablePath, env) : [],
      version: output || 'unknown',
    };
  } catch {
    return createUnavailableProviderInfo(normalizedProvider, now);
  }
}

function createUnavailableProviderInfo(provider, checkedAt = Date.now()) {
  return {
    available: false,
    checkedAt,
    executablePath: '',
    models: [],
    version: '',
  };
}

function serializeProviderInfo(provider, info, skills = [], enabled = true) {
  return {
    available: Boolean(info?.available),
    enabled: Boolean(enabled),
    key: normalizeSessionProvider(provider),
    label: getProviderLabel(provider),
    models: Array.isArray(info?.models) ? info.models : [],
    skills: Array.isArray(skills) ? skills : [],
    version: typeof info?.version === 'string' ? info.version : '',
  };
}

function extractProviderModelCatalog(provider, executablePath, env) {
  if (normalizeSessionProvider(provider) === 'codex') {
    return extractCodexModelCatalog(getProviderHome('codex'));
  }

  return extractClaudeModelCatalog(executablePath, env);
}

function extractClaudeModelCatalog(executablePath) {
  if (!executablePath) {
    return [];
  }

  try {
    const result = spawnSync('strings', [executablePath], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    const output = typeof result.stdout === 'string' ? result.stdout : '';

    if (result.status !== 0 || !output) {
      return [];
    }

    return parseClaudeModelCatalog(output);
  } catch {
    return [];
  }
}

function extractCodexModelCatalog(codexHome) {
  const cachePath = path.join(codexHome, 'models_cache.json');
  if (!fs.existsSync(cachePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const models = Array.isArray(parsed?.models) ? parsed.models : [];
    return models
      .filter((model) => model && typeof model.slug === 'string' && model.slug.trim())
      .filter((model) => model.visibility !== 'hidden')
      .sort((left, right) => (left.priority || 0) - (right.priority || 0))
      .map((model) => ({
        description: typeof model.description === 'string' ? model.description.trim() : '',
        label: typeof model.display_name === 'string' && model.display_name.trim() ? model.display_name.trim() : model.slug.trim(),
        summary: typeof model.description === 'string' ? model.description.trim() : '',
        value: model.slug.trim(),
      }));
  } catch {
    return [];
  }
}

function resolveProviderExecutablePath(provider, env = process.env) {
  return resolveCliExecutablePath(getProviderExecutableName(provider), env);
}

function resolveCliExecutablePath(commandName, env = process.env) {
  if (!commandName || typeof commandName !== 'string') {
    return '';
  }

  const trimmed = commandName.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes(path.sep)) {
    return resolveExecutableCandidate(trimmed);
  }

  const pathResolved = findExecutableInPath(trimmed, env?.PATH || '');
  if (pathResolved) {
    return pathResolved;
  }

  const shellResolved = resolveExecutableFromUserShell(trimmed);
  if (shellResolved) {
    return shellResolved;
  }

  for (const candidate of getCommonExecutableCandidates(trimmed)) {
    const resolved = resolveExecutableCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return '';
}

function getCliProcessEnv(force = false) {
  const shellPath = getShellPathValue(force);
  if (!shellPath) {
    return { ...process.env };
  }

  return {
    ...process.env,
    PATH: shellPath,
  };
}

function getShellPathValue(force = false) {
  const now = Date.now();
  if (!force && shellPathCache.checkedAt && now - shellPathCache.checkedAt < CLAUDE_CHECK_TTL_MS) {
    return shellPathCache.value || process.env.PATH || '';
  }

  const shellPath = readPathFromUserShell();
  shellPathCache = {
    checkedAt: now,
    value: shellPath || process.env.PATH || '',
  };

  return shellPathCache.value;
}

function readPathFromUserShell() {
  const shellExecutable = getUserShellExecutable();
  if (!shellExecutable) {
    return '';
  }

  const marker = '__CLI_PROXY_PATH__';

  try {
    const result = spawnSync(shellExecutable, ['-ilc', `printf '${marker}%s' "$PATH"`], {
      encoding: 'utf8',
      env: { ...process.env },
      maxBuffer: 512 * 1024,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    const markerIndex = output.lastIndexOf(marker);
    if (markerIndex === -1) {
      return '';
    }

    return output.slice(markerIndex + marker.length).trim();
  } catch {
    return '';
  }
}

function getUserShellExecutable() {
  const shellExecutable = typeof process.env.SHELL === 'string' && process.env.SHELL.trim()
    ? process.env.SHELL.trim()
    : '/bin/zsh';

  return resolveExecutableCandidate(shellExecutable) || '/bin/zsh';
}

function resolveExecutableFromUserShell(commandName) {
  const shellExecutable = getUserShellExecutable();
  if (!shellExecutable || !commandName) {
    return '';
  }

  const marker = '__CLI_PROXY_BIN__';
  const escapedCommand = escapeShellArg(commandName);

  try {
    const result = spawnSync(shellExecutable, ['-ilc', `printf '${marker}%s' "$(command -v ${escapedCommand} 2>/dev/null)"`], {
      encoding: 'utf8',
      env: { ...process.env },
      maxBuffer: 256 * 1024,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    const markerIndex = output.lastIndexOf(marker);
    if (markerIndex === -1) {
      return '';
    }

    return resolveExecutableCandidate(output.slice(markerIndex + marker.length).trim());
  } catch {
    return '';
  }
}

function findExecutableInPath(commandName, pathValue) {
  if (!commandName || !pathValue) {
    return '';
  }

  for (const segment of String(pathValue).split(path.delimiter)) {
    const directoryPath = segment && segment.trim() ? segment.trim() : '';
    if (!directoryPath) {
      continue;
    }

    const candidatePath = path.join(directoryPath, commandName);
    const resolved = resolveExecutableCandidate(candidatePath);
    if (resolved) {
      return resolved;
    }
  }

  return '';
}

function getCommonExecutableCandidates(commandName) {
  const homeDirectory = os.homedir();
  const candidates = [
    path.join('/opt/homebrew/bin', commandName),
    path.join('/usr/local/bin', commandName),
    path.join(homeDirectory, '.local', 'bin', commandName),
    path.join(homeDirectory, 'Library', 'pnpm', commandName),
  ];

  return [
    ...candidates,
    ...collectVersionedExecutableCandidates(path.join(homeDirectory, '.nvm', 'versions', 'node'), commandName),
    ...collectCellarNvmExecutableCandidates('/opt/homebrew/Cellar/nvm', commandName),
    ...collectCellarNvmExecutableCandidates('/usr/local/Cellar/nvm', commandName),
  ];
}

function collectVersionedExecutableCandidates(rootPath, commandName, nestedSegments = []) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return [];
  }

  try {
    return fs.readdirSync(rootPath)
      .map((entry) => path.join(rootPath, entry, ...nestedSegments, 'bin', commandName))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function collectCellarNvmExecutableCandidates(rootPath, commandName) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return [];
  }

  try {
    return fs.readdirSync(rootPath)
      .flatMap((entry) => collectVersionedExecutableCandidates(path.join(rootPath, entry, 'versions', 'node'), commandName));
  } catch {
    return [];
  }
}

function resolveExecutableCandidate(candidatePath) {
  if (!candidatePath || typeof candidatePath !== 'string') {
    return '';
  }

  try {
    fs.accessSync(candidatePath, fs.constants.X_OK);
    return fs.realpathSync(candidatePath);
  } catch {
    return '';
  }
}

function escapeShellArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function getProviderExecutableName(provider) {
  return normalizeSessionProvider(provider) === 'codex' ? CODEX_BIN : CLAUDE_BIN;
}

function getProviderLabel(provider) {
  return normalizeSessionProvider(provider) === 'codex' ? 'Codex' : 'Claude';
}

function getProjectProviderDirectoryName(provider) {
  return normalizeSessionProvider(provider) === 'codex' ? '.codex' : '.claude';
}

function parseClaudeModelCatalog(source) {
  if (!source) {
    return [];
  }

  const modelsByValue = new Map();
  const staticEntryPattern = /(KyD|er9|To9|NyD|MBA)=\{value:"([^"]+)",label:"([^"]+)",description:"([^"]+)"\}/g;

  for (const match of source.matchAll(staticEntryPattern)) {
    const [, , value, label, description] = match;
    modelsByValue.set(value, {
      description: normalizeClaudeModelText(description),
      label: normalizeClaudeModelText(label),
      value,
    });
  }

  const detailedEntries = [
    ['sonnet', /function jBA\(\)\{return\{value:"sonnet",label:"([^"]+)",description:[^,]+,descriptionForModel:"([^"]+)"/],
    ['sonnet[1m]', /function qo9\(\)\{return\{value:"sonnet\[1m\]",label:"([^"]+)",description:[^,]+,descriptionForModel:"([^"]+)"/],
    ['opus[1m]', /function Oo9\(T=!1\)\{[^}]*label:"([^"]+)",description:[^,]+,descriptionForModel:"([^"]+)"/],
    ['haiku', /function Go9\(\)\{return\{value:"haiku",label:"([^"]+)",description:[^,]+,descriptionForModel:"([^"]+)"/],
    ['opus', /Ho9=\(T=!1\)=>\{[^}]*value:"opus",label:R\?"[^"]+":"([^"]+)",description:[^,]+,descriptionForModel:R\?"[^"]+":"([^"]+)"/],
  ];

  for (const [value, pattern] of detailedEntries) {
    const match = source.match(pattern);
    if (!match) {
      continue;
    }

    const [, label, description] = match;
    const existing = modelsByValue.get(value);
    modelsByValue.set(value, {
      description: normalizeClaudeModelText(description),
      label: normalizeClaudeModelText(label),
      value,
      ...(existing ? { summary: existing.description } : {}),
    });
  }

  const orderedValues = ['opus', 'opus[1m]', 'haiku', 'sonnet', 'sonnet[1m]'];
  return orderedValues
    .map((value) => modelsByValue.get(value))
    .filter(Boolean);
}

function normalizeClaudeModelText(value) {
  return String(value || '')
    .replace(/\\xB7/g, '·')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeCliArgs(rawArgs) {
  if (typeof rawArgs !== 'string') {
    return [];
  }

  const tokens = [];
  let current = '';
  let quote = '';
  let escaping = false;

  for (const character of rawArgs.trim()) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = '';
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === '\'') {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function parseSkillInstallArgs(args) {
  let scope = 'user';
  let sourceArg = '';

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--scope') {
      const nextValue = args[index + 1];
      if (nextValue === 'user' || nextValue === 'project') {
        scope = nextValue;
        index += 1;
        continue;
      }

      throw new Error('请使用 --scope user 或 --scope project。');
    }

    if (!sourceArg) {
      sourceArg = token;
    }
  }

  return { scope, sourceArg };
}

function collectInstalledSkills(workspacePath, provider = DEFAULT_PROVIDER) {
  const normalizedProvider = normalizeSessionProvider(provider);
  const roots = [
    { path: path.join(getProviderHome(normalizedProvider), 'skills'), scope: 'user' },
  ];
  if (workspacePath) {
    roots.push({ path: path.join(workspacePath, getProjectProviderDirectoryName(normalizedProvider), 'skills'), scope: 'project' });
  }
  const entries = [];
  const seen = new Set();

  for (const root of roots) {
    if (!fs.existsSync(root.path)) {
      continue;
    }

    let directoryEntries = [];
    try {
      directoryEntries = fs.readdirSync(root.path, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of directoryEntries) {
      const skillPath = path.join(root.path, entry.name);
      let skillStats;
      try {
        skillStats = fs.statSync(skillPath);
      } catch {
        continue;
      }
      if (!skillStats.isDirectory()) {
        continue;
      }
      if (!fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
        continue;
      }
      const metadata = readSkillMetadata(skillPath, entry.name);
      let resolvedPath = skillPath;
      try {
        resolvedPath = fs.realpathSync(skillPath);
      } catch {
        // Fall back to the visible path when realpath resolution fails.
      }
      const dedupeKey = `${root.scope}:${resolvedPath}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      entries.push({
        commandName: metadata.commandName,
        description: metadata.description,
        name: metadata.name,
        path: skillPath,
        scope: root.scope,
      });
    }
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

function getProviderHome(provider = DEFAULT_PROVIDER) {
  if (normalizeSessionProvider(provider) === 'codex') {
    const configuredCodexHome = typeof process.env.CODEX_HOME === 'string' ? process.env.CODEX_HOME.trim() : '';
    return configuredCodexHome || path.join(os.homedir(), '.codex');
  }

  const configured = typeof process.env.CLAUDE_CONFIG_DIR === 'string' ? process.env.CLAUDE_CONFIG_DIR.trim() : '';
  return configured || path.join(os.homedir(), '.claude');
}

function readSkillMetadata(skillPath, fallbackName) {
  const normalizedFallback = sanitizeSkillCommandName(fallbackName) || fallbackName || 'skill';
  const manifestPath = path.join(skillPath, 'SKILL.md');
  let manifestText = '';

  try {
    manifestText = fs.readFileSync(manifestPath, 'utf8');
  } catch {
    return {
      commandName: normalizedFallback,
      description: '',
      name: normalizedFallback,
    };
  }

  const frontmatterMatch = manifestText.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!frontmatterMatch) {
    return {
      commandName: normalizedFallback,
      description: '',
      name: normalizedFallback,
    };
  }

  const frontmatter = frontmatterMatch[1];
  const metadata = {};
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    metadata[key.trim().toLowerCase()] = rawValue.trim().replace(/^['"]|['"]$/g, '');
  }

  const metadataName = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  const commandName = sanitizeSkillCommandName(metadataName) || normalizedFallback;

  return {
    commandName,
    description: typeof metadata.description === 'string' ? metadata.description.trim() : '',
    name: metadataName || commandName,
  };
}

function sanitizeSkillCommandName(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/^\/+/, '').replace(/\s+/g, '-').toLowerCase();
}

module.exports = {
  ClaudeDesktopRuntime,
};
