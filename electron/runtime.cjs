const { randomUUID } = require('crypto');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const tls = require('tls');
const { fileURLToPath } = require('url');

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  webContents: electronWebContents,
} = require('electron');

const CONFIG_FILE_NAME = 'claude-desktop-config.json';
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const DEFAULT_PROVIDER = 'claude';
const EMPTY_ASSISTANT_TEXT = '（本轮没有收到可展示的文本输出）';
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const SCHEMA_VERSION = 9;
const SAVE_DEBOUNCE_MS = 160;
const CLAUDE_CHECK_TTL_MS = 30_000;
const CODE_EDITOR_CHECK_TTL_MS = 30_000;
const DEFAULT_NETWORK_PROXY_TEST_TARGET = 'google.com';
const NETWORK_PROXY_TEST_TIMEOUT_MS = 8_000;
const SKILL_LIST_CACHE_TTL_MS = 30_000;
const STDERR_BUFFER_LIMIT = 6000;
const SESSION_MESSAGE_SUMMARY_CACHE_MAX_SIZE = 600;
const SERIALIZED_WORKSPACE_CACHE_MAX_SIZE = 120;
const WORKSPACE_GIT_INFO_TTL_MS = 10_000;
const STATE_EMIT_THROTTLE_MS = 120;
const PASTED_ATTACHMENT_DIR_NAME = 'pasted-attachments';
const SESSION_PERMISSION_MODES = new Set([
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
]);
const SESSION_REASONING_EFFORTS = new Set([
  '',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);
const CODEX_SANDBOX_MODES = new Set([
  'read-only',
  'workspace-write',
  'danger-full-access',
]);
const SESSION_PROVIDER_KEYS = ['claude', 'codex'];
const SESSION_PROVIDERS = new Set(SESSION_PROVIDER_KEYS);
const PROXY_ENV_KEYS = ['ALL_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];
const SOCKET_BUFFER_KEY = Symbol('socketBuffer');
const DEFAULT_CODE_EDITOR_KEY = 'vscode';
const MAC_APPLICATION_SCAN_DEPTH = 3;
let codexConfigDefaultsCache = {
  mtimeMs: -1,
  parsed: null,
  path: '',
};
const CODE_EDITOR_CANDIDATES = [
  {
    commands: ['code'],
    key: 'vscode',
    label: 'Visual Studio Code',
    macCliRelativePath: 'Contents/Resources/app/bin/code',
    macAppNames: ['Visual Studio Code.app'],
  },
  {
    commands: ['cursor'],
    key: 'cursor',
    label: 'Cursor',
    macCliRelativePath: 'Contents/Resources/app/bin/cursor',
    macAppNames: ['Cursor.app'],
  },
  {
    commands: ['windsurf'],
    key: 'windsurf',
    label: 'Windsurf',
    macCliRelativePath: 'Contents/Resources/app/bin/windsurf',
    macAppNames: ['Windsurf.app'],
  },
  {
    commands: ['zed'],
    key: 'zed',
    label: 'Zed',
    macAppNames: ['Zed.app'],
  },
  {
    commands: ['codium'],
    key: 'vscodium',
    label: 'VSCodium',
    macCliRelativePath: 'Contents/Resources/app/bin/codium',
    macAppNames: ['VSCodium.app'],
  },
  {
    commands: ['code-insiders'],
    key: 'vscode_insiders',
    label: 'Visual Studio Code - Insiders',
    macCliRelativePath: 'Contents/Resources/app/bin/code-insiders',
    macAppNames: ['Visual Studio Code - Insiders.app'],
  },
  {
    key: 'xcode',
    label: 'Xcode',
    macAppNames: ['Xcode.app'],
  },
  {
    key: 'intellij_idea',
    label: 'IntelliJ IDEA',
    macAppNames: ['IntelliJ IDEA.app', 'IntelliJ IDEA CE.app'],
  },
  {
    key: 'webstorm',
    label: 'WebStorm',
    macAppNames: ['WebStorm.app'],
  },
  {
    key: 'pycharm',
    label: 'PyCharm',
    macAppNames: ['PyCharm.app', 'PyCharm CE.app'],
  },
  {
    key: 'goland',
    label: 'GoLand',
    macAppNames: ['GoLand.app'],
  },
  {
    key: 'clion',
    label: 'CLion',
    macAppNames: ['CLion.app'],
  },
  {
    key: 'rider',
    label: 'Rider',
    macAppNames: ['Rider.app'],
  },
  {
    key: 'rubymine',
    label: 'RubyMine',
    macAppNames: ['RubyMine.app'],
  },
  {
    key: 'phpstorm',
    label: 'PhpStorm',
    macAppNames: ['PhpStorm.app'],
  },
  {
    key: 'android_studio',
    label: 'Android Studio',
    macAppNames: ['Android Studio.app'],
  },
  {
    commands: ['nova'],
    key: 'nova',
    label: 'Nova',
    macAppNames: ['Nova.app'],
  },
  {
    commands: ['subl'],
    key: 'sublime_text',
    label: 'Sublime Text',
    macCliRelativePath: 'Contents/SharedSupport/bin/subl',
    macAppNames: ['Sublime Text.app'],
  },
  {
    commands: ['bbedit'],
    key: 'bbedit',
    label: 'BBEdit',
    macAppNames: ['BBEdit.app'],
  },
];
const CODE_EDITOR_KEY_ALIASES = new Map(
  CODE_EDITOR_CANDIDATES.flatMap((editor) => ([
    [editor.key, editor.key],
    [editor.label.toLowerCase(), editor.key],
  ])),
);
const VS_CODE_LIKE_EDITOR_KEYS = new Set([
  'cursor',
  'vscode',
  'vscode_insiders',
  'vscodium',
  'windsurf',
]);
const MULTI_TARGET_GOTO_EDITOR_KEYS = new Set([
  'sublime_text',
  'zed',
]);

const workspaceGitInfoCache = new Map();
const skillListCache = new Map();
const sessionMessageSummaryCache = new Map();
const serializedWorkspaceCache = new Map();
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
    this.pendingStateEmitTimers = new Map();
    this.saveTimer = null;
    this.claudeInfo = {
      available: null,
      checkedAt: 0,
      executablePath: '',
      models: [],
      status: null,
      version: '',
    };
    this.codexInfo = {
      available: null,
      checkedAt: 0,
      executablePath: '',
      models: [],
      status: null,
      version: '',
    };
    this.codeEditorInfo = {
      checkedAt: 0,
      editors: [],
    };

    this.store = this.loadStore();
    this.gitDiffWindows = new Map();
    this.settingsWindow = null;
    this.windowRuns = new Map();
    this.refreshProviderInfo(true);
    this.refreshCodeEditors(true);
  }

  registerIpc() {
    if (this.handlersRegistered) {
      return;
    }

    const registerStateHandler = (channel, handler, options = {}) => {
      ipcMain.handle(channel, async (event, payload) => {
        const result = await handler(event, payload);
        this.emitState(event.sender, {
          excludeSender: options.excludeSender === true,
        });
        return this.projectResultForSender(event.sender, result);
      });
    };

    ipcMain.handle('desktop:get-app-state', (event) => this.getAppStateForRecipient(event.sender));
    registerStateHandler('desktop:refresh-provider-status', () => this.getAppState({ forceProviderRefresh: true }));
    ipcMain.handle('desktop:get-git-diff-view-data', (_event, payload) => this.getGitDiffViewData(payload?.workspaceId));
    ipcMain.handle('desktop:open-git-diff-file-in-code-editor', (_event, payload) => (
      this.openGitDiffFileInCodeEditor(payload?.workspaceId, payload?.path)
    ));
    ipcMain.handle('desktop:get-session', (_event, payload) => this.getSession(payload?.workspaceId, payload?.sessionId));
    ipcMain.handle('desktop:open-link', (_event, href) => this.openLink(href));
    ipcMain.handle('desktop:open-git-diff-window', (event, payload) => {
      const browserWindow = this.resolveBrowserWindowForSender(event.sender);
      return this.openGitDiffWindow(browserWindow, payload?.workspaceId);
    });
    ipcMain.handle('desktop:open-settings-window', () => this.openSettingsWindow());
    ipcMain.handle('desktop:open-workspace-in-code-editor', (_event, workspaceId) => this.openWorkspaceInCodeEditor(workspaceId));
    ipcMain.handle('desktop:open-workspace-in-finder', (_event, workspaceId) => this.openWorkspaceInFinder(workspaceId));
    ipcMain.handle('desktop:prepare-pasted-attachments', (_event, payload) => this.preparePastedAttachments(payload));
    ipcMain.handle('desktop:pick-attachments', (event) => {
      const browserWindow = this.resolveBrowserWindowForSender(event.sender);
      return this.pickAttachments(browserWindow);
    });
    ipcMain.handle('desktop:pick-workspace', (event) => {
      const browserWindow = this.resolveBrowserWindowForSender(event.sender);
      return this.pickWorkspaceDirectory(browserWindow);
    });
    registerStateHandler('desktop:add-workspace', (_event, workspacePath) => this.addWorkspace(workspacePath));
    registerStateHandler('desktop:archive-session', (_event, payload) => this.archiveSession(payload?.workspaceId, payload?.sessionId));
    registerStateHandler('desktop:create-session', (_event, payload) => (
      this.createSession(
        typeof payload === 'string' ? payload : payload?.workspaceId,
        typeof payload === 'string' ? '' : payload?.preferredProvider,
      )
    ));
    registerStateHandler('desktop:install-skill', (_event, payload) => (
      this.installSkill(payload?.workspaceId, payload?.sessionId, payload?.args)
    ));
    registerStateHandler('desktop:list-skills', (_event, payload) => (
      this.listSkills(payload?.workspaceId, payload?.sessionId)
    ));
    registerStateHandler('desktop:remove-workspace', (_event, workspaceId) => this.removeWorkspace(workspaceId));
    registerStateHandler('desktop:run-mcp-command', (_event, payload) => (
      this.runMcpCommand(payload?.workspaceId, payload?.sessionId, payload?.args)
    ));
    registerStateHandler('desktop:select-workspace', (_event, workspaceId) => this.selectWorkspace(workspaceId));
    registerStateHandler(
      'desktop:select-session',
      (_event, payload) => this.selectSession(payload?.workspaceId, payload?.sessionId),
    );
    registerStateHandler('desktop:set-expanded-workspaces', (_event, workspaceIds) => this.setExpandedWorkspaces(workspaceIds));
    registerStateHandler(
      'desktop:set-pane-layout',
      (_event, paneLayout) => this.setPaneLayout(paneLayout),
    );
    ipcMain.handle('desktop:respond-to-approval', async (event, payload) => (
      this.projectResultForSender(event.sender, await this.respondToApproval(event.sender, payload))
    ));
    ipcMain.handle('desktop:send-message', async (event, payload) => (
      this.projectResultForSender(event.sender, await this.sendMessage(event.sender, payload))
    ));
    ipcMain.handle('desktop:stop-run', async (event, payload) => (
      this.projectResultForSender(event.sender, await this.stopRun(event.sender, payload))
    ));
    registerStateHandler('desktop:update-session-provider', (_event, payload) => (
      this.updateSessionProvider(payload?.workspaceId, payload?.sessionId, payload?.provider)
    ));
    registerStateHandler('desktop:set-code-editor', (_event, payload) => (
      this.setCodeEditor(payload?.codeEditor)
    ));
    registerStateHandler('desktop:set-network-proxy', (_event, payload) => (
      this.setNetworkProxy(payload?.networkProxy)
    ));
    ipcMain.handle('desktop:test-network-proxy', (_event, payload) => (
      this.testNetworkProxy(payload?.networkProxy, payload?.testTarget)
    ));
    registerStateHandler('desktop:set-provider-enabled', (_event, payload) => (
      this.setProviderEnabled(payload?.provider, payload?.enabled)
    ));
    registerStateHandler('desktop:set-provider-system-prompt', (_event, payload) => (
      this.setProviderSystemPrompt(payload?.provider, payload?.systemPrompt)
    ));
    registerStateHandler('desktop:update-session-model', (_event, payload) => (
      this.updateSessionModel(payload?.workspaceId, payload?.sessionId, payload?.model)
    ));
    registerStateHandler('desktop:update-session-reasoning-effort', (_event, payload) => (
      this.updateSessionReasoningEffort(payload?.workspaceId, payload?.sessionId, payload?.reasoningEffort)
    ));
    registerStateHandler('desktop:update-session-permission-mode', (_event, payload) => (
      this.updateSessionPermissionMode(payload?.workspaceId, payload?.sessionId, payload?.permissionMode)
    ));

    this.handlersRegistered = true;
  }

  projectResultForSender(sender, result) {
    if (!isSerializedAppState(result)) {
      return result;
    }

    return this.getAppStateForRecipient(sender);
  }

  createStateSerializationContext(options = {}) {
    const forceProviderRefresh = options?.forceProviderRefresh === true;
    const isLightweight = options?.lightweight === true;

    if (forceProviderRefresh || !isLightweight) {
      this.refreshProviderInfo(forceProviderRefresh);
      this.refreshCodeEditors(forceProviderRefresh);
    }

    if (!isLightweight && this.reconcileUnlockedSessionProviders()) {
      this.scheduleSave();
    }

    const activeRunLookup = this.getActiveRunLookup();
    const hasActiveRun = Array.from(activeRunLookup.values()).some((runState) => Boolean(runState?.process));
    const enabledProviders = new Set(this.getEnabledProviders());
    const codeEditors = this.getAvailableCodeEditors();
    const selectedCodeEditor = this.getSelectedCodeEditor(codeEditors);

    return {
      activeRunLookup,
      codeEditors,
      enabledProviders,
      hasActiveRun,
      selectedCodeEditor,
    };
  }

  createProviderSnapshot(context, workspacePath = '') {
    return {
      claude: serializeProviderInfo(
        'claude',
        this.claudeInfo,
        collectInstalledSkills(workspacePath, 'claude'),
        context.enabledProviders.has('claude'),
        this.getProviderSystemPrompt('claude'),
      ),
      codex: serializeProviderInfo(
        'codex',
        this.codexInfo,
        collectInstalledSkills(workspacePath, 'codex'),
        context.enabledProviders.has('codex'),
        this.getProviderSystemPrompt('codex'),
      ),
    };
  }

  createAppStatePayload(context, options = {}) {
    const providers = this.createProviderSnapshot(context, options?.providerWorkspacePath || '');
    const activeSession = options?.activeSession || null;
    const selectedWorkspaceId = options?.selectedWorkspaceId || null;
    const selectedSessionId = options?.selectedSessionId || null;
    const workspaces = Array.isArray(options?.workspaces) ? options.workspaces : [];

    return {
      claude: {
        ...providers.claude,
        busy: context.hasActiveRun,
      },
      appInfo: {
        arch: process.arch || '',
        chromeVersion: process.versions?.chrome || '',
        electronVersion: process.versions?.electron || '',
        name: app.getName(),
        nodeVersion: process.versions?.node || '',
        userDataPath: app.getPath('userData'),
        version: app.getVersion(),
      },
      codeEditors: context.codeEditors,
      defaultProvider: this.getDefaultProvider(),
      expandedWorkspaceIds: this.store.expandedWorkspaceIds,
      networkProxy: normalizeNetworkProxySettings(this.store.networkProxy),
      paneLayout: this.store.paneLayout,
      platform: process.platform,
      providers,
      selectedCodeEditor: context.selectedCodeEditor,
      selectedSessionId,
      selectedWorkspaceId,
      workspaces,
      activeSession,
    };
  }

  serializeWorkspacesByIds(workspaceIds, activeRunLookup, includeGitInfo = false) {
    const orderedWorkspaceIds = Array.from(new Set(
      (Array.isArray(workspaceIds) ? workspaceIds : [])
        .filter((workspaceId) => typeof workspaceId === 'string' && workspaceId.trim()),
    ));

    return orderedWorkspaceIds
      .map((workspaceId) => this.findWorkspace(workspaceId))
      .filter(Boolean)
      .map((workspace) => serializeWorkspace(workspace, activeRunLookup, includeGitInfo));
  }

  buildGlobalAppState(context, options = {}) {
    const selectedWorkspace = this.getSelectedWorkspace();
    const selectedSession = this.getSelectedSession();
    const activeSession = options?.includeActiveSession === false
      ? null
      : (selectedWorkspace && selectedSession
        ? serializeSession(selectedWorkspace, selectedSession, context.activeRunLookup)
        : null);

    return this.createAppStatePayload(context, {
      activeSession,
      providerWorkspacePath: selectedWorkspace?.path || '',
      selectedSessionId: this.store.selectedSessionId,
      selectedWorkspaceId: this.store.selectedWorkspaceId,
      workspaces: this.store.workspaces.map((workspace) => (
        serializeWorkspace(workspace, context.activeRunLookup, true)
      )),
    });
  }

  buildPaneAppState(recipientContext, context) {
    const resolvedRecipientContext = this.resolvePaneRecipientContext(recipientContext);
    const paneWorkspace = this.findWorkspace(resolvedRecipientContext?.workspaceId);
    const paneSession = paneWorkspace?.sessions.find((session) => session.id === resolvedRecipientContext?.sessionId && !session.archived) || null;
    const selectedWorkspaceId = paneWorkspace?.id || this.store.selectedWorkspaceId || null;
    const selectedSessionId = paneSession?.id || (paneWorkspace ? null : this.store.selectedSessionId);
    const providerWorkspacePath = paneWorkspace?.path
      || this.findWorkspace(selectedWorkspaceId)?.path
      || '';
    const activeSession = paneWorkspace && paneSession
      ? serializeSession(paneWorkspace, paneSession, context.activeRunLookup)
      : null;

    return this.createAppStatePayload(context, {
      activeSession,
      providerWorkspacePath,
      selectedSessionId,
      selectedWorkspaceId,
      workspaces: this.serializeWorkspacesByIds(
        [selectedWorkspaceId, paneWorkspace?.id || ''],
        context.activeRunLookup,
        true,
      ),
    });
  }

  resolvePaneRecipientContext(recipientContext) {
    if (recipientContext?.view !== 'pane' || !recipientContext.paneId) {
      return recipientContext;
    }

    const pane = Array.isArray(this.store.paneLayout?.panes)
      ? this.store.paneLayout.panes.find((entry) => entry?.id === recipientContext.paneId) || null
      : null;
    if (!pane) {
      return recipientContext;
    }

    return {
      ...recipientContext,
      sessionId: pane.sessionId || '',
      workspaceId: pane.workspaceId || '',
    };
  }

  getAppState(options = {}) {
    const context = this.createStateSerializationContext(options);
    return this.buildGlobalAppState(context, options);
  }

  getAppStateForRecipient(contents, options = {}) {
    const context = this.createStateSerializationContext(options);
    const recipientContext = this.resolvePaneRecipientContext(getStateRecipientContext(contents));

    if (recipientContext?.view === 'pane') {
      return this.buildPaneAppState(recipientContext, context);
    }

    return this.buildGlobalAppState(context, options);
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
    const attachments = (await Promise.all(entries.map((entry) => this.preparePastedAttachment(entry))))
      .filter(Boolean);

    return normalizeMessageAttachments(attachments, { verifyExists: true });
  }

  async preparePastedAttachment(entry) {
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

    const fileContents = getPastedAttachmentBuffer(entry);
    if (!fileContents) {
      return null;
    }

    const targetDirectory = path.join(app.getPath('userData'), PASTED_ATTACHMENT_DIR_NAME);
    await fs.promises.mkdir(targetDirectory, { recursive: true });

    const fileName = createPastedAttachmentFileName(entry);
    const targetPath = path.join(targetDirectory, fileName);
    await fs.promises.writeFile(targetPath, fileContents);

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

    const localTarget = resolveLocalLinkTarget(href);
    if (localTarget?.path) {
      const localPathStats = getPathStats(localTarget.path);
      if (!localPathStats) {
        throw new Error('找不到链接对应的本地路径。');
      }

      const selectedCodeEditor = this.getSelectedCodeEditorInfo({ forceRefresh: true });
      if (!selectedCodeEditor?.path) {
        throw new Error('当前没有可用的代码编辑器。');
      }

      openPathInCodeEditor(selectedCodeEditor, localTarget.path, {
        column: localTarget.column,
        line: localTarget.line,
        workspacePath: this.getCodeEditorWorkspacePath(localTarget.path),
      });
      return {
        codeEditor: selectedCodeEditor.key,
        ok: true,
        target: 'editor',
      };
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

  async openWorkspaceInCodeEditor(workspaceId) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    this.assertDirectory(workspace.path);
    const selectedCodeEditor = this.getSelectedCodeEditorInfo({ forceRefresh: true });
    if (!selectedCodeEditor?.path) {
      throw new Error('当前没有可用的代码编辑器。');
    }

    openPathInCodeEditor(selectedCodeEditor, workspace.path, {
      workspacePath: workspace.path,
    });
    return {
      codeEditor: selectedCodeEditor.key,
      ok: true,
    };
  }

  async openGitDiffFileInCodeEditor(workspaceId, relativeFilePath) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const gitInfo = getWorkspaceGitInfo(workspace.path);
    if (!gitInfo?.root) {
      throw new Error('当前工作目录不是 Git 仓库。');
    }

    const normalizedRelativeFilePath = typeof relativeFilePath === 'string'
      ? relativeFilePath.trim().replace(/^[/\\]+/, '')
      : '';
    if (!normalizedRelativeFilePath) {
      throw new Error('缺少要打开的文件路径。');
    }

    const targetPath = path.join(gitInfo.root, normalizedRelativeFilePath);
    const targetStats = getPathStats(targetPath);
    if (!targetStats?.isFile()) {
      throw new Error('当前文件在工作目录中不存在，可能已被删除。');
    }

    const selectedCodeEditor = this.getSelectedCodeEditorInfo({ forceRefresh: true });
    if (!selectedCodeEditor?.path) {
      throw new Error('当前没有可用的代码编辑器。');
    }

    openPathInCodeEditor(selectedCodeEditor, targetPath, {
      workspacePath: gitInfo.root,
    });

    return {
      codeEditor: selectedCodeEditor.key,
      ok: true,
    };
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

  async openSettingsWindow() {
    const existingWindow = this.settingsWindow;
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.focus();
      return { ok: true, reused: true };
    }

    const browserWindow = new BrowserWindow({
      width: 1080,
      height: 820,
      minWidth: 920,
      minHeight: 620,
      title: `${app.getName()} · Settings`,
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
      view: 'settings',
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      await browserWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${query.toString()}`);
    } else {
      await browserWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
        query: {
          view: 'settings',
        },
      });
    }

    browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const contentsId = browserWindow.webContents.id;

    this.settingsWindow = browserWindow;

    browserWindow.on('closed', () => {
      if (this.settingsWindow === browserWindow) {
        this.settingsWindow = null;
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
      revision: 1,
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

  createSession(workspaceId, preferredProvider = '') {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const now = new Date().toISOString();
    const session = createWorkspaceSession(now, this.getPreferredProvider(preferredProvider));

    workspace.sessions.unshift(session);
    this.touchWorkspace(workspace, now);
    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;
    this.scheduleSave();

    const activeRunLookup = this.getActiveRunLookup();
    return {
      activeSession: serializeSession(workspace, session, activeRunLookup),
      selectedSessionId: session.id,
      selectedWorkspaceId: workspace.id,
      sessionMeta: serializeSessionMeta(workspace, session, activeRunLookup),
      workspaceUpdatedAt: workspace.updatedAt,
    };
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

    const now = new Date().toISOString();
    session.archived = true;
    session.updatedAt = now;
    this.touchWorkspace(workspace, now);

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
    return this.store.expandedWorkspaceIds;
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

  updateSessionReasoningEffort(workspaceId, sessionId, reasoningEffort) {
    const workspace = this.findWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('找不到对应的工作目录。');
    }

    const session = workspace.sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error('找不到对应的历史对话。');
    }

    const now = new Date().toISOString();

    session.reasoningEffort = normalizeSessionReasoningEffort(reasoningEffort);
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
    session.codexPlanModeActive = false;
    session.currentModel = '';
    session.model = '';
    session.reasoningEffort = '';
    session.permissionMode = nextProvider === 'claude' ? session.permissionMode : 'default';
    session.updatedAt = now;
    this.touchWorkspace(workspace, now);
    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;

    if (session.messages.length > 0) {
      this.appendEventMessage(workspace, session, {
        commandSource: 'system',
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

  getProviderSystemPrompt(provider) {
    return getProviderSystemPromptValue(this.store.providerSystemPrompts, provider);
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
    return this.getPreferredProvider();
  }

  getPreferredProvider(preferredProvider = '') {
    const requestedProvider = typeof preferredProvider === 'string'
      ? preferredProvider.trim().toLowerCase()
      : '';
    const enabledProviders = this.getEnabledProviders();
    const availableEnabledProviders = enabledProviders.filter((provider) => this.getProviderInfo(provider).available);

    if (SESSION_PROVIDERS.has(requestedProvider)) {
      if (availableEnabledProviders.includes(requestedProvider)) {
        return requestedProvider;
      }

      if (availableEnabledProviders.length > 0) {
        return availableEnabledProviders[0];
      }

      if (enabledProviders.includes(requestedProvider)) {
        return requestedProvider;
      }
    }

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
        session.codexPlanModeActive = false;
        session.currentModel = '';
        session.model = '';
        session.reasoningEffort = '';
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

  setProviderSystemPrompt(provider, systemPrompt) {
    const nextProvider = normalizeSessionProvider(provider);
    const nextSystemPrompt = normalizeProviderSystemPrompt(systemPrompt);
    const currentSystemPrompts = normalizeProviderSystemPrompts(this.store.providerSystemPrompts);

    if (currentSystemPrompts[nextProvider] === nextSystemPrompt) {
      return this.getAppState();
    }

    this.store.providerSystemPrompts = {
      ...currentSystemPrompts,
      [nextProvider]: nextSystemPrompt,
    };
    this.scheduleSave();

    return this.getAppState();
  }

  setCodeEditor(codeEditor) {
    this.refreshCodeEditors(true);

    const nextCodeEditor = resolveSelectedCodeEditorKey(codeEditor, this.getAvailableCodeEditors());
    if (nextCodeEditor === this.store.codeEditor) {
      return this.getAppState();
    }

    this.store.codeEditor = nextCodeEditor;
    this.scheduleSave();

    return this.getAppState();
  }

  setNetworkProxy(networkProxy) {
    const nextNetworkProxy = normalizeNetworkProxySettings(networkProxy);
    if (areNetworkProxySettingsEqual(this.store.networkProxy, nextNetworkProxy)) {
      return this.getAppState();
    }

    this.store.networkProxy = nextNetworkProxy;
    this.scheduleSave();

    return this.getAppState({ forceProviderRefresh: true });
  }

  async testNetworkProxy(networkProxy, testTarget) {
    return testNetworkProxyConnections(networkProxy, testTarget);
  }

  runMcpCommand(workspaceId, sessionId, rawArgs) {
    const { workspace, session } = this.requireCommandSession(workspaceId, sessionId);
    const provider = this.assertProviderEnabled(session.provider);
    const args = tokenizeCliArgs(rawArgs);
    if (args.length === 0) {
      throw new Error('请使用 /mcp list、/mcp get <name>、/mcp add ... 或 /mcp remove <name>。');
    }

    const cliEnv = getCliProcessEnv(false, this.store.networkProxy);
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
      commandSource: 'slash',
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
      commandSource: 'slash',
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
    skillListCache.clear();

    this.appendEventMessage(workspace, session, {
      commandSource: 'slash',
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
    const providerSystemPrompt = this.getProviderSystemPrompt(provider);
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

    this.assertDirectory(workspace.path);

    this.store.selectedWorkspaceId = workspace.id;
    this.store.selectedSessionId = session.id;

    const autoApprovedCodexSandboxMode = getAutoApprovedCodexSandboxMode(workspace, session) || undefined;
    if (
      provider === 'codex'
      && shouldQueueCodexWriteApproval(session)
      && !autoApprovedCodexSandboxMode
      && resolveCodexSandboxMode(session.permissionMode, autoApprovedCodexSandboxMode) === 'read-only'
      && promptLikelyNeedsCodexWorkspaceWrite(prompt, displayPrompt, displayKind)
    ) {
      const runState = this.getRunState(webContents.id, workspace.id, session.id);
      this.enqueueCodexWriteApproval(webContents, workspace, session, runState, {
        attachments,
        displayKind,
        displayPrompt,
        displayTitle,
        prompt,
      });
      return this.getAppState();
    }

    return this.startSessionRun(webContents, workspace, session, {
      attachments,
      codexSandboxMode: autoApprovedCodexSandboxMode,
      displayKind,
      displayPrompt,
      displayTitle,
      prompt,
    });
  }

  enqueueCodexWriteApproval(webContents, workspace, session, runState, options) {
    const attachments = normalizeMessageAttachments(options?.attachments, { verifyExists: true });
    const displayPrompt = typeof options?.displayPrompt === 'string' ? options.displayPrompt.trim() : '';
    const displayKind = typeof options?.displayKind === 'string' ? options.displayKind.trim() : '';
    const displayTitle = typeof options?.displayTitle === 'string' ? options.displayTitle.trim() : '';
    const now = typeof options?.pendingApproval?.createdAt === 'string' && options.pendingApproval.createdAt
      ? options.pendingApproval.createdAt
      : new Date().toISOString();
    const userMessage = createOutboundUserMessage({
      attachments,
      displayKind,
      displayPrompt,
      displayTitle,
      now,
    });
    const pendingApproval = options?.pendingApproval && typeof options.pendingApproval === 'object'
      ? options.pendingApproval
      : createCodexWritePendingApproval(workspace, {
        attachments,
        displayKind,
        displayPrompt,
        displayTitle,
        now,
        prompt: typeof options?.prompt === 'string' ? options.prompt.trim() : '',
      });

    resetRunStateForExecution(runState, 'codex', workspace.id, session.id);
    runState.pendingApprovalRequests.set(pendingApproval.requestId, pendingApproval);

    session.messages.push(userMessage);
    session.updatedAt = now;
    session.model = session.model || '';

    if (shouldRefreshSessionTitle(session, userMessage, displayPrompt, attachments)) {
      session.title = createSessionTitleFromPrompt(displayPrompt || formatAttachmentTitle(attachments));
    }

    this.touchWorkspace(workspace, now);
    this.scheduleSave();
    this.scheduleStateEmit(webContents);
    return { ok: true };
  }

  startSessionRun(webContents, workspace, session, options = {}) {
    const attachments = normalizeMessageAttachments(options.attachments, { verifyExists: true });
    const prompt = typeof options.prompt === 'string' ? options.prompt.trim() : '';
    const provider = this.assertProviderEnabled(session.provider || this.getDefaultProvider());
    const providerLabel = getProviderLabel(provider);
    const providerSystemPrompt = this.getProviderSystemPrompt(provider);
    const providerPrompt = buildPromptWithAttachments(prompt, attachments);
    if (!providerPrompt) {
      throw new Error('消息内容不能为空。');
    }

    const displayPrompt = typeof options.displayPrompt === 'string' && options.displayPrompt.trim()
      ? options.displayPrompt.trim()
      : prompt;
    const displayKind = typeof options.displayKind === 'string' ? options.displayKind.trim() : '';
    const displayTitle = typeof options.displayTitle === 'string' && options.displayTitle.trim()
      ? options.displayTitle.trim()
      : displayPrompt;
    const appendUserMessage = options.appendUserMessage !== false;
    const now = new Date().toISOString();

    this.refreshProviderInfo(true);
    const providerInfo = this.getProviderInfo(provider);
    if (!providerInfo.available) {
      throw new Error(`未检测到可用的 ${providerLabel} CLI。`);
    }

    const runState = this.getRunState(webContents.id, workspace.id, session.id);
    const userMessage = appendUserMessage
      ? createOutboundUserMessage({
        attachments,
        displayKind,
        displayPrompt,
        displayTitle,
        now,
      })
      : null;

    resetRunStateForExecution(runState, provider, workspace.id, session.id);
    runState.runToken = randomUUID();
    const runToken = runState.runToken;

    const extraAttachmentDirs = collectAttachmentDirectories(workspace.path, attachments);
    const cliEnv = getCliProcessEnv(false, this.store.networkProxy);
    const executablePath = providerInfo.executablePath || resolveProviderExecutablePath(provider, cliEnv);
    if (!executablePath) {
      throw new Error(`未检测到可用的 ${providerLabel} CLI。`);
    }

    const codexTurn = provider === 'codex'
      ? buildCodexTurnRequest(session, providerPrompt)
      : { prompt: providerPrompt, targetPlanModeActive: null };

    const args = provider === 'codex'
      ? buildCodexExecArgs({
        attachments,
        developerInstructions: providerSystemPrompt,
        sandboxMode: resolveCodexSandboxMode(session.permissionMode, options.codexSandboxMode),
        extraAttachmentDirs,
        model: session.model,
        prompt: codexTurn.prompt,
        reasoningEffort: session.reasoningEffort,
        sessionId: session.claudeSessionId,
      })
      : buildClaudeExecArgs({
        extraAttachmentDirs,
        model: session.model,
        permissionMode: session.permissionMode,
        sessionId: session.claudeSessionId,
        systemPrompt: providerSystemPrompt,
      });

    const proc = spawn(executablePath, args, {
      cwd: workspace.path,
      env: cliEnv,
    });
    const codexSandboxMode = provider === 'codex'
      ? resolveCodexSandboxMode(session.permissionMode, options.codexSandboxMode)
      : '';

    if (userMessage) {
      session.messages.push(userMessage);
    }
    session.status = 'running';
    session.updatedAt = now;
    session.model = session.model || '';

    if (shouldRefreshSessionTitle(session, userMessage, displayPrompt, attachments)) {
      session.title = createSessionTitleFromPrompt(displayPrompt || formatAttachmentTitle(attachments));
    }

    runState.process = proc;
    runState.responseStartIndex = session.messages.length;
    runState.codexApprovalPayload = shouldQueueCodexWriteApproval(session)
      ? {
        prompt: typeof options.approvalPrompt === 'string' ? options.approvalPrompt.trim() : prompt,
        attachments,
        displayKind,
        displayPrompt,
        displayTitle,
      }
      : null;
    runState.codexSandboxMode = codexSandboxMode;
    runState.targetCodexPlanModeActive = codexTurn.targetPlanModeActive;
    this.touchWorkspace(workspace, now);
    this.scheduleSave();
    this.scheduleStateEmit(webContents);

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
      let postRunApproval = null;
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

        postRunApproval = maybeCreateCodexEscalationApproval(sessionRef.workspace, sessionRef.session, runState, assistant);
        if (postRunApproval && assistant) {
          assistant.error = false;
        }

        if (code !== 0 && !postRunApproval && !hasRecentErrorEvent(sessionRef.session)) {
          const codexCapabilityFailure = normalizeSessionProvider(runState.provider || sessionRef.session.provider) === 'codex'
            ? (typeof runState.codexCapabilityFailure === 'string' ? runState.codexCapabilityFailure.trim() : '')
            : '';
          this.appendEventMessage(sessionRef.workspace, sessionRef.session, {
            kind: 'error',
            status: 'error',
            title: codexCapabilityFailure ? 'Codex 返回错误' : `${providerLabel} 运行失败`,
            content: codexCapabilityFailure || formatProcessFailure(providerLabel, code, runState.stderrBuffer),
          });
        }

        if (
          normalizeSessionProvider(runState.provider || sessionRef.session.provider) === 'codex'
          && code === 0
          && !runState.resultIsError
          && typeof runState.targetCodexPlanModeActive === 'boolean'
        ) {
          sessionRef.session.codexPlanModeActive = runState.targetCodexPlanModeActive;
        }

        sessionRef.session.status = postRunApproval
          ? 'idle'
          : (
            runState.resultReceived
              ? (runState.resultIsError ? 'error' : 'idle')
              : (code === 0 ? 'idle' : 'error')
          );
        sessionRef.session.updatedAt = new Date().toISOString();
        this.touchWorkspace(sessionRef.workspace, sessionRef.session.updatedAt);
      }

      if (postRunApproval) {
        rewindSessionMessagesForPendingApproval(sessionRef.session, runState);
        prepareRunStateForPendingApproval(runState, postRunApproval);
        this.scheduleSave();
        this.emitState(webContents);
        return;
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
    if (!requestId) {
      throw new Error('缺少审批请求 ID。');
    }

    if (decision !== 'allow' && decision !== 'allow_always' && decision !== 'deny') {
      throw new Error('无效的审批结果。');
    }

    const runState = this.findRunStateByApprovalRequest(
      webContents.id,
      requestId,
      payload?.workspaceId,
      payload?.sessionId,
    );
    if (!runState) {
      throw new Error('当前没有正在运行的任务。');
    }

    const pendingApproval = runState.pendingApprovalRequests.get(requestId);
    if (!pendingApproval) {
      throw new Error('找不到对应的审批请求。');
    }

    if (!runState.process) {
      if (!isQueuedCodexWriteApproval(pendingApproval)) {
        throw new Error('当前没有正在运行的任务。');
      }

      const sessionRef = this.findSessionByIds(runState.workspaceId, runState.sessionId);
      if (!sessionRef) {
        throw new Error('找不到对应的历史对话。');
      }

      runState.pendingApprovalRequests.delete(requestId);
      if (decision === 'allow_always') {
        addWorkspaceApprovalRule(sessionRef.workspace, createApprovalRuleFromPendingApproval(pendingApproval));
        this.touchWorkspace(sessionRef.workspace);
        this.scheduleSave();
      }
      if (decision === 'deny') {
        this.resetRunState(runState);
        this.deleteRunState(webContents.id, sessionRef.workspace.id, sessionRef.session.id);
        this.scheduleSave();
        this.emitState(webContents);
        return this.getAppState();
      }

      const queuedApprovalOptions = getQueuedCodexWriteApprovalOptions(pendingApproval);
      const approvedSandboxMode = getQueuedCodexApprovalSandboxMode(pendingApproval) || 'workspace-write';
      this.startSessionRun(webContents, sessionRef.workspace, sessionRef.session, {
        ...queuedApprovalOptions,
        approvalPrompt: queuedApprovalOptions?.prompt || '',
        appendUserMessage: false,
        codexSandboxMode: approvedSandboxMode,
        prompt: buildCodexApprovedPrompt(queuedApprovalOptions?.prompt || '', approvedSandboxMode),
      });
      return this.getAppState();
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
    this.clearPendingStateEmit(contentsId);
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
    this.scheduleStateEmit(webContents);
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
      const failureContent = formatCodexTurnFailure(event, runState.stderrBuffer);
      const pendingCapabilityApproval = shouldQueueCodexWriteApproval(session)
        ? captureCodexCapabilityFailure(runState, failureContent)
        : '';
      if (!pendingCapabilityApproval) {
        this.appendEventMessage(workspace, session, {
          kind: 'error',
          status: 'error',
          title: 'Codex 返回错误',
          content: failureContent,
        });
      }
      return;
    }

    if (event.type === 'error') {
      runState.resultIsError = true;
      session.status = 'error';
      session.updatedAt = now;
      this.touchWorkspace(workspace, now);
      const failureContent = formatCodexTurnFailure(event, runState.stderrBuffer);
      const pendingCapabilityApproval = shouldQueueCodexWriteApproval(session)
        ? captureCodexCapabilityFailure(runState, failureContent)
        : '';
      if (!pendingCapabilityApproval) {
        this.appendEventMessage(workspace, session, {
          kind: 'error',
          status: 'error',
          title: 'Codex 返回错误',
          content: failureContent,
        });
      }
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
      commandSource: itemSummary.commandSource || '',
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
          commandSource: itemSummary.commandSource || '',
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
      commandSource: itemSummary.commandSource || '',
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
      message.commandSource = itemSummary.commandSource || '';
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
        this.emitToolUse(workspace, session, runState, block);
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
    const partialCommandSource = inferCommandEventSource(partial);

    if (
      !partial.toolUseId &&
      lastMessage &&
      lastMessage.role === 'event' &&
      lastMessage.kind === partial.kind &&
      inferCommandEventSource(lastMessage) === partialCommandSource &&
      lastMessage.status === partial.status &&
      lastMessage.title === partial.title &&
      partial.status === 'running'
    ) {
      lastMessage.content = partial.content;
      lastMessage.createdAt = now;
    } else {
      session.messages.push(createEventMessage({
        ...partial,
        ...(partialCommandSource ? { commandSource: partialCommandSource } : {}),
        createdAt: now,
      }));
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
        if (runState.process || runState.pendingApprovalRequests.size > 0) {
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
    runState.codexApprovalPayload = null;
    runState.codexCapabilityFailure = '';
    runState.codexSandboxMode = '';
    runState.currentAssistantText = '';
    runState.hasStreamedAssistantText = false;
    runState.process = null;
    runState.provider = DEFAULT_PROVIDER;
    runState.responseStartIndex = 0;
    runState.runToken = null;
    runState.sessionId = null;
    runState.workspaceId = null;
    runState.stderrBuffer = '';
    runState.targetCodexPlanModeActive = null;
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

  clearPendingStateEmit(contentsId) {
    const timer = this.pendingStateEmitTimers.get(contentsId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.pendingStateEmitTimers.delete(contentsId);
  }

  scheduleStateEmit(webContents) {
    if (!webContents || webContents.isDestroyed()) {
      return;
    }

    const contentsId = webContents.id;
    if (this.pendingStateEmitTimers.has(contentsId)) {
      return;
    }

    const timer = setTimeout(() => {
      this.pendingStateEmitTimers.delete(contentsId);
      this.emitState(webContents, { lightweight: true });
    }, STATE_EMIT_THROTTLE_MS);

    this.pendingStateEmitTimers.set(contentsId, timer);
  }

  resolveBrowserWindowForSender(sender) {
    if (!sender || sender.isDestroyed()) {
      return null;
    }

    const directWindow = BrowserWindow.fromWebContents(sender);
    if (directWindow) {
      return directWindow;
    }

    const hostContents = sender.hostWebContents;
    if (!hostContents || hostContents.isDestroyed()) {
      return null;
    }

    return BrowserWindow.fromWebContents(hostContents);
  }

  getStateRecipients() {
    return electronWebContents.getAllWebContents().filter((contents) => {
      if (!contents || contents.isDestroyed()) {
        return false;
      }

      const type = typeof contents.getType === 'function' ? contents.getType() : '';
      return type === 'window' || type === 'webview';
    });
  }

  emitState(webContents, options = {}) {
    if (webContents && !webContents.isDestroyed()) {
      this.clearPendingStateEmit(webContents.id);
    }

    const context = this.createStateSerializationContext(options);
    const stateCache = new Map();
    const senderContext = this.resolvePaneRecipientContext(getStateRecipientContext(webContents));
    const excludedSenderId = options.excludeSender && webContents && !webContents.isDestroyed()
      ? webContents.id
      : 0;

    for (const contents of this.getStateRecipients()) {
      try {
        if (excludedSenderId && contents.id === excludedSenderId) {
          continue;
        }

        const recipientContext = this.resolvePaneRecipientContext(getStateRecipientContext(contents));
        if (!shouldEmitStateToRecipient(senderContext, recipientContext, options)) {
          continue;
        }

        const cacheKey = createStateRecipientCacheKey(recipientContext, options);
        let state = stateCache.get(cacheKey);

        if (!state) {
          state = recipientContext?.view === 'pane'
            ? this.buildPaneAppState(recipientContext, context)
            : this.buildGlobalAppState(context, {
              ...options,
              includeActiveSession: options?.lightweight !== true,
            });
          stateCache.set(cacheKey, state);
        }

        contents.send('claude:event', {
          state,
          type: 'state',
        });
      } catch {
        // Ignore transient renderer teardown while broadcasting global state.
      }
    }
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
    workspace.revision = Number.isFinite(workspace.revision)
      ? workspace.revision + 1
      : 1;
  }

  refreshProviderInfo(force = false) {
    const cliEnv = getCliProcessEnv(force, this.store.networkProxy);
    this.claudeInfo = inspectProvider('claude', cliEnv, force, this.claudeInfo);
    this.codexInfo = inspectProvider('codex', cliEnv, force, this.codexInfo, {
      refreshStatusOnly: !force && this.hasActiveProviderRun('codex'),
    });

    return {
      claude: this.claudeInfo,
      codex: this.codexInfo,
    };
  }

  hasActiveProviderRun(provider) {
    const normalizedProvider = normalizeSessionProvider(provider);
    return this.getActiveRunStates().some((runState) => (
      Boolean(runState?.process)
      && normalizeSessionProvider(runState.provider) === normalizedProvider
    ));
  }

  refreshCodeEditors(force = false) {
    const now = Date.now();
    if (!force && now - this.codeEditorInfo.checkedAt < CODE_EDITOR_CHECK_TTL_MS) {
      return this.codeEditorInfo.editors;
    }

    this.codeEditorInfo = {
      checkedAt: now,
      editors: inspectCodeEditors(process.platform),
    };

    return this.codeEditorInfo.editors;
  }

  getAvailableCodeEditors() {
    return Array.isArray(this.codeEditorInfo.editors)
      ? this.codeEditorInfo.editors.slice()
      : [];
  }

  getSelectedCodeEditor(availableEditors = this.getAvailableCodeEditors()) {
    const nextCodeEditor = resolveSelectedCodeEditorKey(this.store.codeEditor, availableEditors);
    if (nextCodeEditor !== this.store.codeEditor) {
      this.store.codeEditor = nextCodeEditor;
      this.scheduleSave();
    }

    return nextCodeEditor;
  }

  getSelectedCodeEditorInfo({ forceRefresh = false } = {}) {
    if (forceRefresh) {
      this.refreshCodeEditors(true);
    }

    const availableEditors = this.getAvailableCodeEditors();
    const selectedCodeEditorKey = this.getSelectedCodeEditor(availableEditors);
    return availableEditors.find((editor) => editor.key === selectedCodeEditorKey) || null;
  }

  getCodeEditorWorkspacePath(targetPath) {
    const normalizedTargetPath = typeof targetPath === 'string' ? targetPath.trim() : '';
    if (!normalizedTargetPath) {
      return '';
    }

    const targetStats = getPathStats(normalizedTargetPath);
    if (!targetStats) {
      return '';
    }

    if (targetStats.isDirectory()) {
      return normalizedTargetPath;
    }

    const matchingWorkspace = this.store.workspaces
      .filter((workspace) => workspace?.path && directoryExists(workspace.path))
      .filter((workspace) => isPathWithin(workspace.path, normalizedTargetPath))
      .sort((left, right) => right.path.length - left.path.length)[0];

    return matchingWorkspace?.path || path.dirname(normalizedTargetPath);
  }

  loadStore() {
    const emptyStore = {
      codeEditor: '',
      enabledProviders: SESSION_PROVIDER_KEYS.slice(),
      expandedWorkspaceIds: [],
      networkProxy: normalizeNetworkProxySettings(),
      paneLayout: null,
      providerSystemPrompts: normalizeProviderSystemPrompts(),
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
          codeEditor: '',
          enabledProviders: SESSION_PROVIDER_KEYS.slice(),
          expandedWorkspaceIds: [migratedWorkspace.id],
          networkProxy: normalizeNetworkProxySettings(),
          paneLayout: null,
          providerSystemPrompts: normalizeProviderSystemPrompts(),
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
        codeEditor: normalizeCodeEditorKey(parsed.codeEditor),
        enabledProviders: normalizeEnabledProviders(parsed.enabledProviders),
        expandedWorkspaceIds,
        networkProxy: normalizeNetworkProxySettings(parsed.networkProxy),
        paneLayout: normalizePaneLayoutState(parsed.paneLayout),
        providerSystemPrompts: normalizeProviderSystemPrompts(parsed.providerSystemPrompts),
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
      codeEditor: this.getSelectedCodeEditor(),
      enabledProviders: this.getEnabledProviders(),
      expandedWorkspaceIds: this.store.expandedWorkspaceIds,
      networkProxy: normalizeNetworkProxySettings(this.store.networkProxy),
      paneLayout: normalizePaneLayoutState(this.store.paneLayout),
      providerSystemPrompts: normalizeProviderSystemPrompts(this.store.providerSystemPrompts),
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
    revision: Number.isFinite(workspace.revision) ? Math.max(1, Math.floor(workspace.revision)) : 1,
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
    codexPlanModeActive: provider === 'codex' ? Boolean(session.codexPlanModeActive) : false,
    currentModel: session.currentModel || session.model || '',
    createdAt,
    id: session.id || randomUUID(),
    messages: normalizeStaleRunningEventMessages(normalizedMessages),
    model: session.model || '',
    permissionMode: normalizeSessionPermissionMode(session.permissionMode),
    reasoningEffort: normalizeSessionReasoningEffort(session.reasoningEffort),
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
  if (kind === 'command') {
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

  if (kind === 'edit') {
    const filePath = getApprovalEditFilePath(rule);
    if (!filePath) {
      return null;
    }

    return {
      createdAt: rule.createdAt || new Date().toISOString(),
      filePath,
      input: rule.input && typeof rule.input === 'object' ? rule.input : { file_path: filePath },
      key: createEditApprovalRuleKey(filePath),
      kind: 'edit',
      toolName: typeof rule.toolName === 'string' && rule.toolName.trim() ? rule.toolName.trim() : 'Edit',
    };
  }

  if (kind === 'codex_write' || kind === 'codex_permission') {
    const blockedPath = normalizeApprovalBlockedPath(
      rule.blockedPath
      || getToolInputString(rule.input, ['workspacePath', 'blockedPath', 'path'])
      || rule.path,
    );
    const sandboxMode = kind === 'codex_write'
      ? 'workspace-write'
      : getQueuedCodexApprovalSandboxMode(rule);
    if (!blockedPath) {
      return null;
    }
    if (!sandboxMode || sandboxMode === 'read-only') {
      return null;
    }

    return {
      blockedPath,
      createdAt: rule.createdAt || new Date().toISOString(),
      input: {
        ...(rule.input && typeof rule.input === 'object' ? rule.input : {}),
        approvalKind: 'codex_permission',
        sandboxMode,
        workspacePath: blockedPath,
      },
      key: createCodexPermissionApprovalKey(blockedPath, sandboxMode),
      kind: 'codex_permission',
      sandboxMode,
      toolName: typeof rule.toolName === 'string' && rule.toolName.trim()
        ? rule.toolName.trim()
        : getCodexPermissionToolName(sandboxMode),
    };
  }

  return null;
}

function isSerializedAppState(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && Array.isArray(value.workspaces)
    && value.providers
    && typeof value.providers === 'object'
    && Object.prototype.hasOwnProperty.call(value, 'selectedWorkspaceId')
  );
}

function getStateRecipientContext(contents) {
  if (!contents || typeof contents.getURL !== 'function') {
    return null;
  }

  let currentUrl = '';
  try {
    currentUrl = contents.getURL();
  } catch {
    return null;
  }

  if (!currentUrl) {
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(currentUrl);
  } catch {
    return null;
  }

  return {
    paneId: parsedUrl.searchParams.get('paneId') || '',
    sessionId: parsedUrl.searchParams.get('sessionId') || '',
    view: parsedUrl.searchParams.get('view') || 'main',
    workspaceId: parsedUrl.searchParams.get('workspaceId') || '',
  };
}

function createStateRecipientCacheKey(recipientContext, options = {}) {
  if (recipientContext?.view === 'pane') {
    return [
      'pane',
      recipientContext.workspaceId || '',
      recipientContext.sessionId || '',
    ].join('\u0000');
  }

  return [
    'global',
    options?.lightweight === true ? 'light' : 'full',
  ].join('\u0000');
}

function shouldEmitStateToRecipient(senderContext, recipientContext, options = {}) {
  if (recipientContext?.view !== 'pane' || options?.lightweight !== true) {
    return true;
  }

  if (
    senderContext?.view !== 'pane'
    || !senderContext.workspaceId
    || !senderContext.sessionId
  ) {
    return true;
  }

  if (!recipientContext.workspaceId || !recipientContext.sessionId) {
    return true;
  }

  return (
    recipientContext.workspaceId === senderContext.workspaceId
    && recipientContext.sessionId === senderContext.sessionId
  );
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
    commandSource: inferCommandEventSource(message),
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

function normalizeCodexSandboxMode(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return CODEX_SANDBOX_MODES.has(normalized) ? normalized : '';
}

function resolveCodexSandboxMode(permissionMode, overrideMode) {
  const normalizedOverride = normalizeCodexSandboxMode(overrideMode);
  if (normalizedOverride) {
    return normalizedOverride;
  }

  const normalizedPermissionMode = normalizeSessionPermissionMode(permissionMode);
  if (normalizedPermissionMode === 'bypassPermissions') {
    return 'danger-full-access';
  }

  return normalizedPermissionMode === 'default' || normalizedPermissionMode === 'plan'
    ? 'read-only'
    : 'workspace-write';
}

function shouldQueueCodexWriteApproval(session) {
  if (normalizeSessionProvider(session?.provider) !== 'codex') {
    return false;
  }

  const permissionMode = normalizeSessionPermissionMode(session?.permissionMode);
  return permissionMode !== 'bypassPermissions';
}

function promptLikelyNeedsCodexWorkspaceWrite(prompt, displayPrompt = '', displayKind = '') {
  if (typeof displayKind === 'string' && displayKind.trim().toLowerCase() === 'command') {
    return false;
  }

  const normalized = [prompt, displayPrompt]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return false;
  }

  const negativePattern = /不要修改|别修改|不要写入|不要落盘|仅分析|只分析|不要动代码|只读即可|don't edit|do not edit|read-only|readonly|analysis only|just explain|no changes/;
  if (negativePattern.test(normalized)) {
    return false;
  }

  const englishWritePattern = /\b(edit|modify|update|change|rewrite|refactor|patch|fix|implement|create|add|delete|remove|rename|save|write)\b[\s\S]{0,80}\b(file|files|code|project|component|function|bug|issue|workspace)\b|\bapply\s+patch\b|\bmake\s+the\s+change\b|\bship\s+it\b/;
  const chineseWritePattern = /改一下|改下|修改|编辑|更新|补上|修复|实现|新增|添加|创建|新建|删除|移除|重命名|写入|落盘|保存|直接改|直接修改|改代码|改文件|修这个|修下|补这个|补一下/;
  return englishWritePattern.test(normalized) || chineseWritePattern.test(normalized);
}

function isQueuedCodexWriteApproval(approval) {
  const approvalKind = getQueuedCodexApprovalKind(approval);
  return approvalKind === 'codex_write' || approvalKind === 'codex_permission';
}

function getQueuedCodexApprovalKind(approval) {
  const topLevelKind = typeof approval?.approvalKind === 'string' ? approval.approvalKind.trim() : '';
  if (topLevelKind) {
    return topLevelKind;
  }

  return typeof approval?.input?.approvalKind === 'string' ? approval.input.approvalKind.trim() : '';
}

function getQueuedCodexApprovalSandboxMode(approval) {
  const explicitSandboxMode = normalizeCodexSandboxMode(
    approval?.sandboxMode
    || approval?.input?.sandboxMode,
  );
  if (explicitSandboxMode) {
    return explicitSandboxMode;
  }

  return getQueuedCodexApprovalKind(approval) === 'codex_write' ? 'workspace-write' : '';
}

function createCodexPermissionApprovalKey(blockedPath, sandboxMode) {
  const normalizedBlockedPath = normalizeApprovalBlockedPath(blockedPath);
  const normalizedSandboxMode = normalizeCodexSandboxMode(sandboxMode);
  return normalizedBlockedPath && normalizedSandboxMode
    ? `codex_permission:${normalizedSandboxMode}:${normalizedBlockedPath}`
    : '';
}

function getCodexPermissionToolName(sandboxMode) {
  return normalizeCodexSandboxMode(sandboxMode) === 'danger-full-access'
    ? 'codex_full_access'
    : 'codex_workspace_access';
}

function getAutoApprovedCodexSandboxMode(workspace, session) {
  if (!workspace || !shouldQueueCodexWriteApproval(session)) {
    return '';
  }

  const blockedPath = normalizeApprovalBlockedPath(workspace.path);
  if (!blockedPath) {
    return '';
  }

  const rules = normalizeWorkspaceApprovalRules(workspace.approvalRules);
  if (Array.isArray(workspace.approvalRules) && rules.length !== workspace.approvalRules.length) {
    workspace.approvalRules = rules;
  }

  if (rules.some((rule) => rule.kind === 'codex_permission' && rule.blockedPath === blockedPath && rule.sandboxMode === 'danger-full-access')) {
    return 'danger-full-access';
  }

  if (rules.some((rule) => rule.kind === 'codex_permission' && rule.blockedPath === blockedPath && rule.sandboxMode === 'workspace-write')) {
    return 'workspace-write';
  }

  return '';
}

function getQueuedCodexWriteApprovalOptions(approval) {
  if (!isQueuedCodexWriteApproval(approval)) {
    return null;
  }

  const input = approval.input && typeof approval.input === 'object' ? approval.input : {};
  return {
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    displayKind: typeof input.displayKind === 'string' ? input.displayKind : '',
    displayPrompt: typeof input.displayPrompt === 'string' ? input.displayPrompt : '',
    displayTitle: typeof input.displayTitle === 'string' ? input.displayTitle : '',
    prompt: typeof input.prompt === 'string' ? input.prompt : '',
  };
}

function createOutboundUserMessage({ attachments, displayKind, displayPrompt, displayTitle, now }) {
  return displayKind === 'command'
    ? createEventMessage({
      commandSource: 'slash',
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
}

function createCodexWritePendingApproval(workspace, options = {}) {
  const attachments = Array.isArray(options.attachments) ? options.attachments : [];
  const displayKind = typeof options.displayKind === 'string' ? options.displayKind.trim() : '';
  const displayPrompt = typeof options.displayPrompt === 'string' ? options.displayPrompt.trim() : '';
  const displayTitle = typeof options.displayTitle === 'string' ? options.displayTitle.trim() : '';
  const prompt = typeof options.prompt === 'string' ? options.prompt.trim() : '';
  const now = options.now || new Date().toISOString();
  const blockedPath = normalizeApprovalBlockedPath(workspace?.path);
  const sandboxMode = normalizeCodexSandboxMode(options.sandboxMode) || 'workspace-write';
  const needsDangerousAccess = sandboxMode === 'danger-full-access';

  return {
    approvalKind: 'codex_permission',
    blockedPath,
    category: 'generic',
    createdAt: now,
    description: needsDangerousAccess
      ? 'Codex 需要更高权限才能继续执行当前受限操作。允许后会放宽当前会话的沙箱限制，并自动重试本轮请求。'
      : 'Codex 在当前只读权限下无法继续。允许后会提升当前工作目录权限，并自动重试本轮请求。',
    detail: blockedPath,
    displayName: needsDangerousAccess ? 'Codex elevated permission' : 'Codex workspace permission',
    input: {
      approvalKind: 'codex_permission',
      attachments,
      displayKind,
      displayPrompt,
      displayTitle,
      prompt,
      sandboxMode,
      workspacePath: blockedPath,
    },
    requestId: typeof options.requestId === 'string' && options.requestId.trim() ? options.requestId.trim() : randomUUID(),
    sandboxMode,
    title: needsDangerousAccess ? 'Codex 更高权限审批' : 'Codex 权限升级',
    toolName: getCodexPermissionToolName(sandboxMode),
    toolUseId: '',
  };
}

function maybeCreateCodexEscalationApproval(workspace, session, runState, assistantMessage) {
  if (!workspace || !session || !runState || runState.pendingApprovalRequests.size > 0) {
    return null;
  }

  if (!shouldQueueCodexWriteApproval(session)) {
    return null;
  }

  const targetSandboxMode = inferCodexEscalationSandboxMode(
    getCodexEscalationContext(runState, assistantMessage),
    runState.codexSandboxMode,
  );
  if (!targetSandboxMode) {
    return null;
  }

  if (!runState.codexApprovalPayload || typeof runState.codexApprovalPayload !== 'object') {
    return null;
  }

  return createCodexWritePendingApproval(workspace, {
    ...runState.codexApprovalPayload,
    sandboxMode: targetSandboxMode,
  });
}

function getCodexEscalationContext(runState, assistantMessage) {
  return [
    typeof assistantMessage?.content === 'string' ? assistantMessage.content : '',
    typeof runState?.codexCapabilityFailure === 'string' ? runState.codexCapabilityFailure : '',
    runState?.stderrBuffer,
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n');
}

function captureCodexCapabilityFailure(runState, failureContent) {
  if (!runState) {
    return '';
  }

  const normalizedFailureContent = typeof failureContent === 'string' ? failureContent.trim() : '';
  const targetSandboxMode = inferCodexEscalationSandboxMode(normalizedFailureContent, runState.codexSandboxMode);
  runState.codexCapabilityFailure = targetSandboxMode ? normalizedFailureContent : '';
  return targetSandboxMode;
}

function inferCodexEscalationSandboxMode(text, currentSandboxMode) {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const normalizedSandboxMode = normalizeCodexSandboxMode(currentSandboxMode);
  if (normalizedSandboxMode === 'danger-full-access') {
    return '';
  }

  const englishRestrictionPattern = /read-only|readonly|operation not permitted|permission denied|write attempt failed|mounted read-only|filesystem is read-only|workspace is mounted read-only|write to .* was denied|sandbox denied|requires workspace-write|requires a writable workspace|needs workspace-write/;
  const englishFailurePattern = /can't|cannot|couldn't|unable to|failed to|denied|not permitted|could not|requires|needs/;
  const chineseRestrictionPattern = /当前环境不能落盘|当前环境没法落盘|无法落盘|不能落盘|没法落盘|没有写权限|无写权限|写权限受限|可写会话|可写权限|可写环境|可写工作区|可写目录|只读环境|当前环境只读|工作区只读|只读沙箱|只读权限|无法写入|不能写入|无法修改文件|不能修改文件|无法编辑文件|不能编辑文件|工作目录权限/;
  const chineseFailurePattern = /无法|不能|没法|未能|受限|拒绝|需要|请切到|切到|才能|才可以/;
  const englishWriteApprovalHintPattern = /writable environment|writable workspace|write access|workspace write access|workspace-write/;
  const englishWriteActionPattern = /edit|modify|update|change|patch|fix|implement|create|delete|rename|continue|complete/;
  const chineseWriteApprovalHintPattern = /可写环境|可写工作区|可写目录|可写权限|工作区只读|只读沙箱|只读权限/;
  const chineseWriteActionPattern = /修改|编辑|写入|落盘|补上|修复|创建|删除|重命名|继续|完成|处理/;
  const writePermissionDenied = (
    englishRestrictionPattern.test(normalized) && englishFailurePattern.test(normalized)
  ) || (
    chineseRestrictionPattern.test(normalized) && chineseFailurePattern.test(normalized)
  ) || (
    englishWriteApprovalHintPattern.test(normalized) && englishWriteActionPattern.test(normalized)
  ) || (
    chineseWriteApprovalHintPattern.test(normalized) && chineseWriteActionPattern.test(normalized)
  );

  const englishDangerRestrictionPattern = /network access|internet access|outbound network|socket access|dns resolution|resolve host|connection timed out|connection refused|tls handshake|certificate verify failed|outside the workspace|outside current workspace|outside of the workspace|outside the current working directory|outside the repo|not in writable roots|requires full access|dangerously-bypass-approvals-and-sandbox|blocked by sandbox|sandbox restriction|sandbox blocked|requires network|needs network|external path|outside allowed directories|environment restriction|environment restrictions|restricted environment|network is disabled|internet is disabled|host lookup|name resolution/;
  const chineseDangerRestrictionPattern = /无法联网|不能联网|没法联网|网络受限|网络访问受限|无法访问网络|不能访问网络|无法访问外网|不能访问外网|无法解析域名|不能解析域名|dns|无法下载依赖|不能下载依赖|无法访问工作目录外|不能访问工作目录外|工作目录之外|当前工作目录之外|外部路径|沙箱限制|受沙箱限制|环境限制|环境受限|当前环境受限|解除沙箱|完全访问|更高系统权限|更高权限的操作/;
  const dangerPermissionDenied = (
    englishDangerRestrictionPattern.test(normalized) && englishFailurePattern.test(normalized)
  ) || (
    chineseDangerRestrictionPattern.test(normalized) && chineseFailurePattern.test(normalized)
  );

  if (dangerPermissionDenied) {
    return 'danger-full-access';
  }

  if (normalizedSandboxMode === 'workspace-write') {
    return writePermissionDenied ? 'danger-full-access' : '';
  }

  return writePermissionDenied ? 'workspace-write' : '';
}

function prepareRunStateForPendingApproval(runState, approval) {
  if (!runState || !approval) {
    return;
  }

  runState.assistantMessageId = null;
  runState.codexCapabilityFailure = '';
  runState.currentAssistantText = '';
  runState.hasStreamedAssistantText = false;
  runState.process = null;
  runState.runToken = null;
  runState.stderrBuffer = '';
  runState.targetCodexPlanModeActive = null;
  runState.seenToolResultIds.clear();
  runState.seenToolUseIds.clear();
  runState.toolUses.clear();
  runState.pendingApprovalRequests.clear();
  runState.pendingApprovalRequests.set(approval.requestId, approval);
  runState.responseStartIndex = 0;
  runState.resultIsError = false;
  runState.resultReceived = false;
}

function rewindSessionMessagesForPendingApproval(session, runState) {
  if (!session || !Array.isArray(session.messages) || !runState) {
    return;
  }

  const responseStartIndex = Number.isInteger(runState.responseStartIndex)
    ? runState.responseStartIndex
    : session.messages.length;
  if (responseStartIndex < 0 || responseStartIndex > session.messages.length) {
    return;
  }

  session.messages = session.messages.slice(0, responseStartIndex);
  session.updatedAt = new Date().toISOString();
}

function resetRunStateForExecution(runState, provider, workspaceId, sessionId) {
  if (!runState) {
    return;
  }

  runState.assistantMessageId = null;
  runState.codexApprovalPayload = null;
  runState.codexCapabilityFailure = '';
  runState.codexSandboxMode = '';
  runState.currentAssistantText = '';
  runState.hasStreamedAssistantText = false;
  runState.process = null;
  runState.provider = provider;
  runState.runToken = null;
  runState.responseStartIndex = 0;
  runState.sessionId = sessionId;
  runState.workspaceId = workspaceId;
  runState.stderrBuffer = '';
  runState.targetCodexPlanModeActive = null;
  runState.seenToolResultIds.clear();
  runState.seenToolUseIds.clear();
  runState.toolUses.clear();
  runState.pendingApprovalRequests.clear();
  runState.resultIsError = false;
  runState.resultReceived = false;
}

function normalizeSessionPermissionMode(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return SESSION_PERMISSION_MODES.has(normalized) ? normalized : 'default';
}

function normalizeSessionReasoningEffort(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SESSION_REASONING_EFFORTS.has(normalized) ? normalized : '';
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

function normalizeProviderSystemPrompt(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProviderSystemPrompts(value) {
  const source = value && typeof value === 'object' ? value : {};
  return SESSION_PROVIDER_KEYS.reduce((prompts, provider) => {
    prompts[provider] = normalizeProviderSystemPrompt(source[provider]);
    return prompts;
  }, {});
}

function normalizeNetworkProxySettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    allProxy: normalizeNetworkProxyValue(source.allProxy ?? source.ALL_PROXY),
    enabled: source.enabled === true,
    httpProxy: normalizeNetworkProxyValue(source.httpProxy ?? source.HTTP_PROXY),
    httpsProxy: normalizeNetworkProxyValue(source.httpsProxy ?? source.HTTPS_PROXY),
    noProxy: normalizeNetworkProxyValue(source.noProxy ?? source.NO_PROXY),
  };
}

function normalizeNetworkProxyValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function areNetworkProxySettingsEqual(left, right) {
  const normalizedLeft = normalizeNetworkProxySettings(left);
  const normalizedRight = normalizeNetworkProxySettings(right);

  return normalizedLeft.enabled === normalizedRight.enabled
    && normalizedLeft.httpProxy === normalizedRight.httpProxy
    && normalizedLeft.httpsProxy === normalizedRight.httpsProxy
    && normalizedLeft.allProxy === normalizedRight.allProxy
    && normalizedLeft.noProxy === normalizedRight.noProxy;
}

async function testNetworkProxyConnections(networkProxy, testTarget) {
  const proxyTargets = buildNetworkProxyTestTargets(networkProxy);
  if (proxyTargets.length === 0) {
    throw new Error('请先填写至少一个代理地址，再测试连接。');
  }

  const normalizedTarget = parseNetworkProxyTestTarget(testTarget);

  const results = [];
  for (const proxyTarget of proxyTargets) {
    const startedAt = Date.now();

    try {
      await connectThroughProxy(
        proxyTarget.proxyUrl,
        normalizedTarget.host,
        normalizedTarget.port,
        NETWORK_PROXY_TEST_TIMEOUT_MS,
      );

      results.push({
        durationMs: Date.now() - startedAt,
        labels: proxyTarget.labels,
        message: '已成功建立代理隧道。',
        ok: true,
        proxyUrl: proxyTarget.proxyUrl,
      });
    } catch (error) {
      results.push({
        durationMs: Date.now() - startedAt,
        labels: proxyTarget.labels,
        message: normalizeErrorMessage(error),
        ok: false,
        proxyUrl: proxyTarget.proxyUrl,
      });
    }
  }

  return {
    ok: results.every((item) => item.ok),
    results,
    targetHost: normalizedTarget.host,
    targetPort: normalizedTarget.port,
    targetDisplay: normalizedTarget.display,
    timeoutMs: NETWORK_PROXY_TEST_TIMEOUT_MS,
  };
}

function buildNetworkProxyTestTargets(networkProxy) {
  const normalizedProxy = normalizeNetworkProxySettings(networkProxy);
  const groupedTargets = new Map();
  const candidates = [
    ['HTTPS_PROXY', normalizedProxy.httpsProxy],
    ['ALL_PROXY', normalizedProxy.allProxy],
    ['HTTP_PROXY', normalizedProxy.httpProxy],
  ];

  for (const [label, proxyUrl] of candidates) {
    const normalizedUrl = normalizeNetworkProxyValue(proxyUrl);
    if (!normalizedUrl) {
      continue;
    }

    const existingTarget = groupedTargets.get(normalizedUrl);
    if (existingTarget) {
      existingTarget.labels.push(label);
      continue;
    }

    groupedTargets.set(normalizedUrl, {
      labels: [label],
      proxyUrl: normalizedUrl,
    });
  }

  return Array.from(groupedTargets.values());
}

async function connectThroughProxy(proxyUrl, targetHost, targetPort, timeoutMs) {
  const proxyEndpoint = parseNetworkProxyEndpoint(proxyUrl);
  let socket = null;

  try {
    if (proxyEndpoint.protocol === 'http:') {
      socket = await connectTcpSocket(proxyEndpoint.host, proxyEndpoint.port, timeoutMs);
      await performHttpProxyConnect(socket, proxyEndpoint, targetHost, targetPort, timeoutMs);
      return;
    }

    if (proxyEndpoint.protocol === 'https:') {
      const rawSocket = await connectTcpSocket(proxyEndpoint.host, proxyEndpoint.port, timeoutMs);
      socket = await connectTlsSocket(rawSocket, proxyEndpoint.host, timeoutMs);
      await performHttpProxyConnect(socket, proxyEndpoint, targetHost, targetPort, timeoutMs);
      return;
    }

    if (['socks:', 'socks5:', 'socks5h:'].includes(proxyEndpoint.protocol)) {
      socket = await connectTcpSocket(proxyEndpoint.host, proxyEndpoint.port, timeoutMs);
      await performSocks5ProxyConnect(socket, proxyEndpoint, targetHost, targetPort, timeoutMs);
      return;
    }

    if (['socks4:', 'socks4a:'].includes(proxyEndpoint.protocol)) {
      socket = await connectTcpSocket(proxyEndpoint.host, proxyEndpoint.port, timeoutMs);
      await performSocks4ProxyConnect(socket, proxyEndpoint, targetHost, targetPort, timeoutMs);
      return;
    }

    throw new Error(`暂不支持测试 ${proxyEndpoint.protocol.replace(/:$/, '')} 代理。`);
  } finally {
    socket?.destroy();
  }
}

function parseNetworkProxyEndpoint(proxyUrl) {
  const rawValue = normalizeNetworkProxyValue(proxyUrl);
  if (!rawValue) {
    throw new Error('代理地址为空。');
  }

  const urlValue = rawValue.includes('://') ? rawValue : `http://${rawValue}`;
  let parsedUrl = null;

  try {
    parsedUrl = new URL(urlValue);
  } catch {
    throw new Error('代理地址格式无效。');
  }

  const protocol = typeof parsedUrl.protocol === 'string' ? parsedUrl.protocol.toLowerCase() : '';
  const host = parsedUrl.hostname || '';
  if (!host) {
    throw new Error('代理地址缺少主机名。');
  }

  const port = parsedUrl.port
    ? Number(parsedUrl.port)
    : getDefaultNetworkProxyPort(protocol);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('代理地址端口无效。');
  }

  return {
    host,
    password: decodeURIComponent(parsedUrl.password || ''),
    port,
    protocol,
    proxyUrl: rawValue,
    username: decodeURIComponent(parsedUrl.username || ''),
  };
}

function getDefaultNetworkProxyPort(protocol) {
  if (protocol === 'https:') {
    return 443;
  }

  if (['socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'].includes(protocol)) {
    return 1080;
  }

  return 80;
}

function parseNetworkProxyTestTarget(value) {
  const rawValue = typeof value === 'string' && value.trim()
    ? value.trim()
    : DEFAULT_NETWORK_PROXY_TEST_TARGET;
  const urlValue = rawValue.includes('://')
    ? rawValue
    : `https://${rawValue}`;
  let parsedUrl = null;

  try {
    parsedUrl = new URL(urlValue);
  } catch {
    throw new Error('测试目标格式无效。');
  }

  const protocol = typeof parsedUrl.protocol === 'string' ? parsedUrl.protocol.toLowerCase() : 'https:';
  const host = parsedUrl.hostname || '';
  if (!host) {
    throw new Error('测试目标缺少主机名。');
  }

  const port = parsedUrl.port
    ? Number(parsedUrl.port)
    : protocol === 'http:' ? 80 : 443;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('测试目标端口无效。');
  }

  return {
    display: `${host}:${port}`,
    host,
    port,
  };
}

function normalizeErrorMessage(error) {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return '连接测试失败。';
}

function connectTcpSocket(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error(`连接代理超时（>${timeoutMs}ms）。`));
      socket.destroy();
    }, timeoutMs);

    const finish = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      socket.removeListener('connect', handleConnect);
      socket.removeListener('error', handleError);

      if (error) {
        reject(error);
        return;
      }

      resolve(socket);
    };

    const handleConnect = () => finish(null);
    const handleError = (error) => finish(error);

    socket.once('connect', handleConnect);
    socket.once('error', handleError);
  });
}

function connectTlsSocket(socket, servername, timeoutMs) {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      servername,
      socket,
    });
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error(`连接 HTTPS 代理超时（>${timeoutMs}ms）。`));
      tlsSocket.destroy();
    }, timeoutMs);

    const finish = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      tlsSocket.removeListener('secureConnect', handleSecureConnect);
      tlsSocket.removeListener('error', handleError);

      if (error) {
        reject(error);
        return;
      }

      resolve(tlsSocket);
    };

    const handleSecureConnect = () => finish(null);
    const handleError = (error) => finish(error);

    tlsSocket.once('secureConnect', handleSecureConnect);
    tlsSocket.once('error', handleError);
  });
}

async function performHttpProxyConnect(socket, proxyEndpoint, targetHost, targetPort, timeoutMs) {
  const authorizationHeader = buildHttpProxyAuthorizationHeader(proxyEndpoint);
  socket.write(
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`
    + `Host: ${targetHost}:${targetPort}\r\n`
    + 'Proxy-Connection: Keep-Alive\r\n'
    + authorizationHeader
    + '\r\n',
  );

  const responseBuffer = await readSocketUntil(socket, (buffer) => {
    const headerEndIndex = buffer.indexOf('\r\n\r\n');
    return headerEndIndex >= 0 ? headerEndIndex + 4 : 0;
  }, timeoutMs);
  const responseText = responseBuffer.toString('utf8');
  const statusLine = responseText.split('\r\n')[0] || '';
  const statusMatch = statusLine.match(/^HTTP\/\d\.\d\s+(\d{3})/i);

  if (!statusMatch) {
    throw new Error('HTTP 代理返回了无法识别的响应。');
  }

  const statusCode = Number(statusMatch[1]);
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`HTTP 代理 CONNECT 失败：${statusLine}`);
  }
}

function buildHttpProxyAuthorizationHeader(proxyEndpoint) {
  if (!proxyEndpoint.username && !proxyEndpoint.password) {
    return '';
  }

  const credentials = Buffer.from(
    `${proxyEndpoint.username || ''}:${proxyEndpoint.password || ''}`,
    'utf8',
  ).toString('base64');

  return `Proxy-Authorization: Basic ${credentials}\r\n`;
}

async function performSocks5ProxyConnect(socket, proxyEndpoint, targetHost, targetPort, timeoutMs) {
  const methods = proxyEndpoint.username || proxyEndpoint.password
    ? [0x00, 0x02]
    : [0x00];

  socket.write(Buffer.from([0x05, methods.length, ...methods]));
  const negotiationResponse = await readSocketBytes(socket, 2, timeoutMs);
  if (negotiationResponse[0] !== 0x05) {
    throw new Error('SOCKS5 代理响应版本不正确。');
  }

  if (negotiationResponse[1] === 0xFF) {
    throw new Error('SOCKS5 代理不接受当前认证方式。');
  }

  if (negotiationResponse[1] === 0x02) {
    const username = Buffer.from(proxyEndpoint.username || '', 'utf8');
    const password = Buffer.from(proxyEndpoint.password || '', 'utf8');
    if (username.length > 255 || password.length > 255) {
      throw new Error('SOCKS5 用户名或密码过长。');
    }

    socket.write(Buffer.concat([
      Buffer.from([0x01, username.length]),
      username,
      Buffer.from([password.length]),
      password,
    ]));

    const authResponse = await readSocketBytes(socket, 2, timeoutMs);
    if (authResponse[1] !== 0x00) {
      throw new Error('SOCKS5 用户名或密码认证失败。');
    }
  } else if (negotiationResponse[1] !== 0x00) {
    throw new Error('SOCKS5 代理返回了未知认证方式。');
  }

  const hostBuffer = Buffer.from(targetHost, 'utf8');
  if (hostBuffer.length === 0 || hostBuffer.length > 255) {
    throw new Error('测试目标域名无效。');
  }

  socket.write(Buffer.concat([
    Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuffer.length]),
    hostBuffer,
    encodePort(targetPort),
  ]));

  const connectResponseHead = await readSocketBytes(socket, 4, timeoutMs);
  if (connectResponseHead[0] !== 0x05) {
    throw new Error('SOCKS5 CONNECT 响应版本不正确。');
  }

  if (connectResponseHead[1] !== 0x00) {
    throw new Error(getSocks5ErrorMessage(connectResponseHead[1]));
  }

  let remainingLength = 0;
  if (connectResponseHead[3] === 0x01) {
    remainingLength = 4 + 2;
  } else if (connectResponseHead[3] === 0x03) {
    const domainLengthBuffer = await readSocketBytes(socket, 1, timeoutMs);
    remainingLength = domainLengthBuffer[0] + 2;
  } else if (connectResponseHead[3] === 0x04) {
    remainingLength = 16 + 2;
  } else {
    throw new Error('SOCKS5 CONNECT 返回了未知地址类型。');
  }

  if (remainingLength > 0) {
    await readSocketBytes(socket, remainingLength, timeoutMs);
  }
}

async function performSocks4ProxyConnect(socket, proxyEndpoint, targetHost, targetPort, timeoutMs) {
  if (proxyEndpoint.password) {
    throw new Error('SOCKS4 代理不支持密码认证。');
  }

  const userId = Buffer.from(proxyEndpoint.username || '', 'utf8');
  const hostBuffer = Buffer.from(targetHost, 'utf8');
  socket.write(Buffer.concat([
    Buffer.from([0x04, 0x01]),
    encodePort(targetPort),
    Buffer.from([0x00, 0x00, 0x00, 0x01]),
    userId,
    Buffer.from([0x00]),
    hostBuffer,
    Buffer.from([0x00]),
  ]));

  const response = await readSocketBytes(socket, 8, timeoutMs);
  if (response[1] !== 0x5A) {
    throw new Error(getSocks4ErrorMessage(response[1]));
  }
}

function encodePort(port) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16BE(port, 0);
  return buffer;
}

function readSocketUntil(socket, matcher, timeoutMs) {
  const initialBuffer = getSocketBufferedData(socket);
  const initialMatchLength = matcher(initialBuffer);
  if (initialMatchLength > 0) {
    return Promise.resolve(consumeSocketBuffer(socket, initialBuffer, initialMatchLength));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let buffered = initialBuffer;
    const timer = setTimeout(() => {
      finish(new Error(`等待代理响应超时（>${timeoutMs}ms）。`));
      socket.destroy();
    }, timeoutMs);

    const finish = (error, value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      socket.removeListener('data', handleData);
      socket.removeListener('error', handleError);
      socket.removeListener('close', handleClose);

      if (error) {
        reject(error);
        return;
      }

      resolve(value);
    };

    const handleData = (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      const matchedLength = matcher(buffered);
      if (matchedLength > 0) {
        finish(null, consumeSocketBuffer(socket, buffered, matchedLength));
      }
    };

    const handleError = (error) => finish(error);
    const handleClose = () => finish(new Error('代理连接已关闭。'));

    socket.on('data', handleData);
    socket.once('error', handleError);
    socket.once('close', handleClose);
  });
}

function readSocketBytes(socket, expectedLength, timeoutMs) {
  return readSocketUntil(
    socket,
    (buffer) => (buffer.length >= expectedLength ? expectedLength : 0),
    timeoutMs,
  );
}

function getSocketBufferedData(socket) {
  return Buffer.isBuffer(socket[SOCKET_BUFFER_KEY])
    ? socket[SOCKET_BUFFER_KEY]
    : Buffer.alloc(0);
}

function consumeSocketBuffer(socket, buffered, consumedLength) {
  const nextBuffer = Buffer.isBuffer(buffered) ? buffered : Buffer.alloc(0);
  socket[SOCKET_BUFFER_KEY] = nextBuffer.subarray(consumedLength);
  return nextBuffer.subarray(0, consumedLength);
}

function getSocks5ErrorMessage(code) {
  const messages = {
    0x01: 'SOCKS5 代理报告一般性失败。',
    0x02: 'SOCKS5 规则拒绝了连接请求。',
    0x03: 'SOCKS5 网络不可达。',
    0x04: 'SOCKS5 主机不可达。',
    0x05: 'SOCKS5 目标连接被拒绝。',
    0x06: 'SOCKS5 连接超时。',
    0x07: 'SOCKS5 命令不受支持。',
    0x08: 'SOCKS5 地址类型不受支持。',
  };

  return messages[code] || `SOCKS5 代理返回错误代码 0x${code.toString(16)}。`;
}

function getSocks4ErrorMessage(code) {
  const messages = {
    0x5B: 'SOCKS4 代理拒绝了连接请求。',
    0x5C: 'SOCKS4 代理无法连接目标身份服务。',
    0x5D: 'SOCKS4 代理的身份校验失败。',
  };

  return messages[code] || `SOCKS4 代理返回错误代码 0x${code.toString(16)}。`;
}

function getProviderSystemPromptValue(systemPrompts, provider = DEFAULT_PROVIDER) {
  const normalizedProvider = normalizeSessionProvider(provider);
  const prompts = normalizeProviderSystemPrompts(systemPrompts);
  return prompts[normalizedProvider];
}

function encodeTomlString(value) {
  return JSON.stringify(typeof value === 'string' ? value : '');
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

function getPastedAttachmentBuffer(entry) {
  const rawBuffer = entry?.dataBuffer;
  if (rawBuffer instanceof ArrayBuffer) {
    return Buffer.from(rawBuffer);
  }

  if (ArrayBuffer.isView(rawBuffer)) {
    return Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);
  }

  if (Array.isArray(rawBuffer) && rawBuffer.length > 0) {
    return Buffer.from(rawBuffer);
  }

  if (typeof entry?.dataBase64 === 'string' && entry.dataBase64.trim()) {
    return Buffer.from(entry.dataBase64, 'base64');
  }

  return null;
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
    codexApprovalPayload: null,
    codexCapabilityFailure: '',
    codexSandboxMode: '',
    currentAssistantText: '',
    hasStreamedAssistantText: false,
    pendingApprovalRequests: new Map(),
    process: null,
    provider: DEFAULT_PROVIDER,
    responseStartIndex: 0,
    resultIsError: false,
    resultReceived: false,
    runToken: null,
    seenToolResultIds: new Set(),
    seenToolUseIds: new Set(),
    sessionId,
    stderrBuffer: '',
    targetCodexPlanModeActive: null,
    toolUses: new Map(),
    workspaceId,
  };
}

function serializeWorkspace(workspace, activeRunLookup, includeGitInfo = false) {
  const cacheKey = createSerializedWorkspaceCacheKey(workspace, activeRunLookup, includeGitInfo);
  const cached = serializedWorkspaceCache.get(cacheKey);
  const now = Date.now();
  if (cached && (!includeGitInfo || now - cached.checkedAt < WORKSPACE_GIT_INFO_TTL_MS)) {
    return cached.value;
  }

  const gitInfo = includeGitInfo ? getWorkspaceGitInfo(workspace.path) : null;
  const sessionMetas = workspace.sessions
    .filter((session) => !session.archived)
    .slice()
    .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))
    .map((session) => serializeSessionMeta(workspace, session, activeRunLookup));

  const serialized = {
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

  setBoundedCacheValue(serializedWorkspaceCache, cacheKey, {
    checkedAt: now,
    value: serialized,
  }, SERIALIZED_WORKSPACE_CACHE_MAX_SIZE);

  return serialized;
}

function createSerializedWorkspaceCacheKey(workspace, activeRunLookup, includeGitInfo = false) {
  const activeRunSignature = getWorkspaceActiveRunSignature(workspace, activeRunLookup);

  return [
    workspace?.id || '',
    includeGitInfo ? 'git' : 'plain',
    Number.isFinite(workspace?.revision) ? workspace.revision : 0,
    activeRunSignature,
  ].join('\u0000');
}

function serializeSession(workspace, session, activeRunLookup) {
  const activeRun = activeRunLookup.get(createRunKey(workspace.id, session.id)) || null;
  const messageSummary = getSessionMessageSummary(session);
  const pendingApprovals = activeRun
      ? Array.from(activeRun.pendingApprovalRequests.values())
        .map((approval) => serializePendingApproval(approval))
        .filter(Boolean)
      : [];
  const effectiveDefaults = getEffectiveSessionDefaults(workspace.path, session);
  const configuredReasoningEffort = normalizeSessionReasoningEffort(session.reasoningEffort);
  const contextUsage = inspectSessionContextUsage(session, workspace.path);

  return {
    archived: Boolean(session.archived),
    claudeSessionId: session.claudeSessionId,
    contextUsage,
    currentModel: session.currentModel || session.model || '',
    createdAt: session.createdAt,
    effectiveModel: session.currentModel || session.model || effectiveDefaults.model,
    effectiveReasoningEffort: configuredReasoningEffort || effectiveDefaults.reasoningEffort,
    id: session.id,
    isRunning: Boolean(activeRun?.process),
    messages: session.messages,
    model: session.model,
    pendingApprovals,
    path: workspace.path,
    permissionMode: normalizeSessionPermissionMode(session.permissionMode),
    reasoningEffort: configuredReasoningEffort,
    provider: normalizeSessionProvider(session.provider),
    providerLocked: messageSummary.providerLocked,
    status: session.status,
    title: session.title,
    updatedAt: session.updatedAt,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  };
}

function serializeSessionMeta(workspace, session, activeRunLookup) {
  const activeRun = activeRunLookup.get(createRunKey(workspace.id, session.id)) || null;
  const effectiveDefaults = getEffectiveSessionDefaults(workspace.path, session);
  const configuredReasoningEffort = normalizeSessionReasoningEffort(session.reasoningEffort);
  const messageSummary = getSessionMessageSummary(session);

  return {
    archived: Boolean(session.archived),
    claudeSessionId: session.claudeSessionId,
    currentModel: session.currentModel || session.model || '',
    effectiveModel: session.currentModel || session.model || effectiveDefaults.model,
    effectiveReasoningEffort: configuredReasoningEffort || effectiveDefaults.reasoningEffort,
    id: session.id,
    isRunning: Boolean(activeRun?.process),
    messageCount: messageSummary.messageCount,
    permissionMode: normalizeSessionPermissionMode(session.permissionMode),
    reasoningEffort: configuredReasoningEffort,
    provider: normalizeSessionProvider(session.provider),
    providerLocked: messageSummary.providerLocked,
    preview: messageSummary.preview,
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
    codexPlanModeActive: false,
    currentModel: '',
    createdAt,
    archived: false,
    id: randomUUID(),
    messages: [],
    model: '',
    permissionMode: 'default',
    reasoningEffort: '',
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
  if (!approval) {
    return null;
  }

  if (isQueuedCodexWriteApproval(approval)) {
    const blockedPath = normalizeApprovalBlockedPath(approval.blockedPath || approval.input?.workspacePath);
    const sandboxMode = getQueuedCodexApprovalSandboxMode(approval) || 'workspace-write';
    if (!blockedPath) {
      return null;
    }

    return {
      blockedPath,
      createdAt: new Date().toISOString(),
      input: {
        ...(approval.input && typeof approval.input === 'object' ? approval.input : {}),
        approvalKind: 'codex_permission',
        sandboxMode,
        workspacePath: blockedPath,
      },
      key: createCodexPermissionApprovalKey(blockedPath, sandboxMode),
      kind: 'codex_permission',
      sandboxMode,
      toolName: typeof approval.toolName === 'string' && approval.toolName.trim()
        ? approval.toolName.trim()
        : getCodexPermissionToolName(sandboxMode),
    };
  }

  if (inferApprovalCategory(approval) === 'edit') {
    const filePath = getApprovalEditFilePath(approval);
    if (!filePath) {
      return null;
    }

    return {
      createdAt: new Date().toISOString(),
      filePath,
      input: approval.input && typeof approval.input === 'object' ? approval.input : { file_path: filePath },
      key: createEditApprovalRuleKey(filePath),
      kind: 'edit',
      toolName: typeof approval.toolName === 'string' && approval.toolName.trim() ? approval.toolName.trim() : 'Edit',
    };
  }

  if (inferApprovalCategory(approval) !== 'command') {
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
  if (!workspace || !approval) {
    return false;
  }

  const targetKey = getApprovalRuleKey(approval);
  if (!targetKey) {
    return false;
  }

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

function normalizeApprovalBlockedPath(value) {
  const normalized = String(value || '').trim();
  return normalized ? path.resolve(normalized) : '';
}

function getApprovalEditFilePath(approval) {
  if (!approval || typeof approval !== 'object') {
    return '';
  }

  return normalizeApprovalBlockedPath(
    approval.filePath
    || getToolInputString(approval.input, ['file_path', 'path'])
    || approval.path
    || approval.blockedPath,
  );
}

function createEditApprovalRuleKey(filePath) {
  return `edit:${filePath}`;
}

function getApprovalRuleKey(approval) {
  if (isQueuedCodexWriteApproval(approval)) {
    const blockedPath = normalizeApprovalBlockedPath(approval.blockedPath || approval.input?.workspacePath);
    const sandboxMode = getQueuedCodexApprovalSandboxMode(approval) || 'workspace-write';
    return createCodexPermissionApprovalKey(blockedPath, sandboxMode);
  }

  if (inferApprovalCategory(approval) === 'edit') {
    const filePath = getApprovalEditFilePath(approval);
    return filePath ? createEditApprovalRuleKey(filePath) : '';
  }

  if (inferApprovalCategory(approval) !== 'command') {
    return '';
  }

  const command = normalizeApprovalCommand(getToolInputString(approval.input, ['command', 'cmd']));
  return command ? `command:${command}` : '';
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
    approvalKind: getQueuedCodexApprovalKind(approval),
    blockedPath: typeof approval.blockedPath === 'string' ? approval.blockedPath : '',
    category: inferApprovalCategory(approval),
    createdAt: approval.createdAt || new Date().toISOString(),
    decisionReason: typeof approval.decisionReason === 'string' ? approval.decisionReason : '',
    description: typeof approval.description === 'string' ? approval.description : '',
    detail: typeof approval.detail === 'string' ? approval.detail : '',
    displayName: typeof approval.displayName === 'string' ? approval.displayName : '',
    requestId: typeof approval.requestId === 'string' ? approval.requestId : '',
    sandboxMode: getQueuedCodexApprovalSandboxMode(approval),
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

function normalizeCommandEventSource(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ['slash', 'tool', 'system'].includes(normalized) ? normalized : '';
}

function inferCommandEventSource(message) {
  if (!message || message.kind !== 'command') {
    return '';
  }

  const explicitSource = normalizeCommandEventSource(message.commandSource);
  if (explicitSource) {
    return explicitSource;
  }

  if (
    (typeof message.toolUseId === 'string' && message.toolUseId.trim())
    || message.toolCategory === 'command'
    || message.toolName === 'command_execution'
  ) {
    return 'tool';
  }

  const title = typeof message.title === 'string' ? message.title.trim() : '';
  if (title.startsWith('/')) {
    return 'slash';
  }

  return 'system';
}

function createSessionTitleFromPrompt(prompt) {
  const sanitized = prompt.replace(/\s+/g, ' ').trim();
  return truncateText(sanitized, 26) || `新对话 ${formatShortTime(new Date().toISOString())}`;
}

function shouldRefreshSessionTitle(session, userMessage, displayPrompt, attachments) {
  if (!isDefaultSessionTitle(session?.title) || userMessage?.role !== 'user') {
    return false;
  }

  return Boolean(
    (typeof displayPrompt === 'string' && displayPrompt.trim())
    || formatAttachmentTitle(attachments),
  );
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

function resolveLocalLinkTarget(href) {
  if (typeof href !== 'string' || !href) {
    return null;
  }

  let resolvedPath = href.trim();
  let fragmentTarget = {
    column: null,
    line: null,
  };

  if (resolvedPath.startsWith('file://')) {
    try {
      const fileUrl = new URL(resolvedPath);
      fragmentTarget = parseCodeEditorLinkFragment(fileUrl.hash);
      resolvedPath = fileURLToPath(fileUrl);
    } catch {
      return null;
    }
  } else {
    fragmentTarget = parseCodeEditorLinkFragment(extractPathHash(resolvedPath));
  }

  if (!path.isAbsolute(resolvedPath)) {
    return null;
  }

  const strippedPath = stripPathHashAndQuery(resolvedPath);
  const { column, line, path: normalizedPath } = stripPathLineAndColumnSuffix(strippedPath);
  if (!normalizedPath) {
    return null;
  }

  return {
    column: column || fragmentTarget.column,
    line: line || fragmentTarget.line,
    path: normalizedPath,
  };
}

function extractPathHash(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const hashIndex = value.indexOf('#');
  if (hashIndex < 0) {
    return '';
  }

  const queryIndex = value.indexOf('?', hashIndex);
  return queryIndex >= 0
    ? value.slice(hashIndex, queryIndex)
    : value.slice(hashIndex);
}

function parseCodeEditorLinkFragment(value) {
  const fragment = typeof value === 'string' ? value.trim() : '';
  if (!fragment) {
    return {
      column: null,
      line: null,
    };
  }

  const match = fragment.match(/^#L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?$/i);
  if (!match) {
    return {
      column: null,
      line: null,
    };
  }

  return {
    column: match[2] ? Number.parseInt(match[2], 10) : null,
    line: Number.parseInt(match[1], 10),
  };
}

function stripPathLineAndColumnSuffix(value) {
  if (typeof value !== 'string' || !value) {
    return {
      column: null,
      line: null,
      path: '',
    };
  }

  const lineColumnMatch = value.match(/^(.*):(\d+)(?::(\d+))?$/);
  if (!lineColumnMatch) {
    return {
      column: null,
      line: null,
      path: value,
    };
  }

  const candidatePath = lineColumnMatch[1];
  if (!candidatePath || !fs.existsSync(candidatePath)) {
    return {
      column: null,
      line: null,
      path: value,
    };
  }

  return {
    column: lineColumnMatch[3] ? Number.parseInt(lineColumnMatch[3], 10) : null,
    line: Number.parseInt(lineColumnMatch[2], 10),
    path: candidatePath,
  };
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
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!trimmedPrompt && !hasAttachments) {
    return '';
  }

  const sections = [];
  const normalizedAttachments = hasAttachments ? attachments : [];

  const fileReferences = normalizedAttachments
    .filter((attachment) => attachment.kind !== 'image')
    .map((attachment) => `@${attachment.path}`);
  const imageReferences = normalizedAttachments
    .filter((attachment) => attachment.kind === 'image')
    .map((attachment) => attachment.path);

  if (fileReferences.length > 0) {
    sections.push(`Attached files:\n${fileReferences.join('\n')}`);
  }

  if (imageReferences.length > 0) {
    sections.push(`Attached images:\n${imageReferences.join('\n')}`);
  }

  sections.push(`User request:\n${trimmedPrompt || 'Please inspect the attached files and images and help me with them.'}`);
  return sections.join('\n\n').trim();
}

function buildClaudeExecArgs({ extraAttachmentDirs, model, permissionMode, sessionId, systemPrompt }) {
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

  const normalizedSystemPrompt = normalizeProviderSystemPrompt(systemPrompt);
  if (normalizedSystemPrompt) {
    args.push('--append-system-prompt', normalizedSystemPrompt);
  }

  args.push('--permission-mode', normalizeSessionPermissionMode(permissionMode));

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  return args;
}

function buildCodexExecArgs({
  attachments,
  developerInstructions,
  extraAttachmentDirs,
  model,
  prompt,
  reasoningEffort,
  sandboxMode,
  sessionId,
}) {
  const options = ['--json', '--skip-git-repo-check'];
  if (model) {
    options.push('--model', model);
  }

  const normalizedDeveloperInstructions = normalizeProviderSystemPrompt(developerInstructions);
  if (normalizedDeveloperInstructions) {
    options.push('-c', `developer_instructions=${encodeTomlString(normalizedDeveloperInstructions)}`);
  }

  const normalizedSandboxMode = normalizeCodexSandboxMode(sandboxMode);
  if (sessionId) {
    if (normalizedSandboxMode === 'workspace-write') {
      options.push('--full-auto');
    } else if (normalizedSandboxMode === 'danger-full-access') {
      options.push('--dangerously-bypass-approvals-and-sandbox');
    }
  } else if (normalizedSandboxMode) {
    options.push('--sandbox', normalizedSandboxMode);
  }

  const normalizedReasoningEffort = normalizeSessionReasoningEffort(reasoningEffort);
  if (normalizedReasoningEffort) {
    options.push(
      '-c',
      `model_reasoning_effort="${normalizedReasoningEffort}"`,
      '-c',
      `plan_mode_reasoning_effort="${normalizedReasoningEffort}"`,
    );
  }

  if (!sessionId && Array.isArray(extraAttachmentDirs) && extraAttachmentDirs.length > 0) {
    options.push('--add-dir', ...extraAttachmentDirs);
  }

  const imageAttachments = Array.isArray(attachments)
    ? attachments.filter((attachment) => attachment?.kind === 'image' && attachment.path)
    : [];
  if (imageAttachments.length > 0) {
    for (const attachment of imageAttachments) {
      options.push('-i', attachment.path);
    }
  }

  if (sessionId) {
    return [
      'exec',
      'resume',
      ...options,
      // `--image` is greedy in `codex exec`; without an explicit option terminator
      // the trailing session/prompt arguments can be parsed as more image paths.
      '--',
      sessionId,
      prompt,
    ];
  }

  return [
    'exec',
    ...options,
    // Keep the prompt positional separate from any preceding `--image` values.
    '--',
    prompt,
  ];
}

function buildCodexTurnRequest(session, prompt) {
  const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  const desiredPlanModeActive = normalizeSessionPermissionMode(session?.permissionMode) === 'plan';
  const currentPlanModeActive = Boolean(session?.codexPlanModeActive);

  if (!normalizedPrompt || desiredPlanModeActive === currentPlanModeActive) {
    return {
      prompt: normalizedPrompt,
      targetPlanModeActive: null,
    };
  }

  return {
    // The official Codex CLI docs expose `/plan` as the conversation-level
    // switch for plan mode, optionally followed by an inline prompt.
    prompt: `/plan ${normalizedPrompt}`,
    targetPlanModeActive: desiredPlanModeActive,
  };
}

function buildCodexApprovedPrompt(prompt, sandboxMode) {
  const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!normalizedPrompt) {
    return normalizedPrompt;
  }

  const normalizedSandboxMode = normalizeCodexSandboxMode(sandboxMode);
  const note = normalizedSandboxMode === 'danger-full-access'
    ? 'System note: Permission escalation has already been approved for this request. Continue directly with the task and do not re-check whether elevated permissions are available unless an operation still fails.'
    : 'System note: Workspace write permission has already been approved for this request. Continue directly with the task and do not re-check whether the workspace is writable unless a write still fails.';
  return `${note}\n\n${normalizedPrompt}`;
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
      commandSource: 'tool',
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

function getWorkspaceActiveRunSignature(workspace, activeRunLookup) {
  if (!workspace?.id || !(activeRunLookup instanceof Map) || activeRunLookup.size === 0) {
    return '';
  }

  const runningSessionIds = [];
  const workspaceRunPrefix = createRunKey(workspace.id, '');

  for (const [runKey, activeRun] of activeRunLookup.entries()) {
    if (!runKey.startsWith(workspaceRunPrefix) || !activeRun?.process || !activeRun.sessionId) {
      continue;
    }

    runningSessionIds.push(activeRun.sessionId);
  }

  return runningSessionIds.sort().join('|');
}

function getSessionMessageSummary(session) {
  if (!session || !Array.isArray(session.messages)) {
    return {
      messageCount: 0,
      preview: '还没有消息',
      providerLocked: false,
    };
  }

  const cacheKey = [
    session.id || '',
    session.updatedAt || '',
    session.messages.length,
  ].join('\u0000');
  const cached = sessionMessageSummaryCache.get(cacheKey);
  if (cached) {
    sessionMessageSummaryCache.delete(cacheKey);
    sessionMessageSummaryCache.set(cacheKey, cached);
    return cached;
  }

  const summary = summarizeSessionMessages(session.messages);
  setBoundedCacheValue(
    sessionMessageSummaryCache,
    cacheKey,
    summary,
    SESSION_MESSAGE_SUMMARY_CACHE_MAX_SIZE,
  );
  return summary;
}

function summarizeSessionMessages(messages) {
  let messageCount = 0;
  let inputMessageCount = 0;
  let previewMessage = null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object') {
      continue;
    }

    if (message.role !== 'event') {
      messageCount += 1;
    }

    if (
      message.role === 'user'
      || (message.role === 'event' && message.kind === 'command')
    ) {
      inputMessageCount += 1;
    }

    if (!previewMessage && (message.role === 'assistant' || message.role === 'user')) {
      previewMessage = message;
    }
  }

  return {
    messageCount,
    preview: previewMessage
      ? (truncateText(getMessagePreviewText(previewMessage), 80) || '还没有消息')
      : '还没有消息',
    providerLocked: inputMessageCount > 0,
  };
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

function getPathStats(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
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

  const normalizedValue = typeof value === 'string'
    ? value
    : stringifyValue(value);
  const text = typeof normalizedValue === 'string' ? normalizedValue : String(normalizedValue || '');

  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function inspectProvider(provider, env, force, previousInfo = null, options = {}) {
  const normalizedProvider = normalizeSessionProvider(provider);
  const previousCheckedAt = Number.isFinite(previousInfo?.checkedAt) ? previousInfo.checkedAt : 0;
  const refreshStatusOnly = options?.refreshStatusOnly === true;
  const now = Date.now();
  if (!force && previousCheckedAt && now - previousCheckedAt < CLAUDE_CHECK_TTL_MS) {
    if (refreshStatusOnly && previousInfo && typeof previousInfo === 'object') {
      return {
        ...previousInfo,
        status: inspectLocalProviderStatus(normalizedProvider),
      };
    }
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
    const status = inspectLocalProviderStatus(normalizedProvider);
    return {
      available: result.status === 0,
      checkedAt: now,
      executablePath: result.status === 0 ? executablePath : '',
      models: result.status === 0 ? extractProviderModelCatalog(normalizedProvider, executablePath, env) : [],
      status,
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
    status: inspectLocalProviderStatus(provider),
    version: '',
  };
}

function serializeProviderInfo(provider, info, skills = [], enabled = true, systemPrompt = '') {
  return {
    available: Boolean(info?.available),
    enabled: Boolean(enabled),
    key: normalizeSessionProvider(provider),
    label: getProviderLabel(provider),
    models: Array.isArray(info?.models) ? info.models : [],
    skills: Array.isArray(skills) ? skills : [],
    status: info?.status && typeof info.status === 'object' ? info.status : null,
    systemPrompt: normalizeProviderSystemPrompt(systemPrompt),
    version: typeof info?.version === 'string' ? info.version : '',
  };
}

function inspectLocalProviderStatus(provider) {
  const normalizedProvider = normalizeSessionProvider(provider);

  try {
    return normalizedProvider === 'codex'
      ? inspectCodexLocalStatus()
      : inspectClaudeLocalStatus();
  } catch {
    return null;
  }
}

function inspectClaudeLocalStatus() {
  const claudeHome = getProviderHome('claude');
  const stats = readJsonFileSafe(path.join(claudeHome, 'stats-cache.json'));
  if (!stats || typeof stats !== 'object') {
    return null;
  }

  const dailyActivity = Array.isArray(stats.dailyActivity)
    ? stats.dailyActivity.filter((entry) => isIsoDateString(entry?.date))
    : [];
  const favoriteModel = getFavoriteClaudeModel(stats.dailyModelTokens, stats.modelUsage);
  const lastActive = getLatestClaudeActivityEntry(dailyActivity);
  const currentModelSettings = readJsonFileSafe(path.join(claudeHome, 'settings.json'));
  const currentModel = typeof currentModelSettings?.model === 'string'
    ? currentModelSettings.model.trim()
    : '';
  const status = {
    currentModel,
    favoriteModel,
    kind: 'claude',
    lastActive,
    totalMessages: normalizeNonNegativeNumber(stats.totalMessages),
    totalSessions: normalizeNonNegativeNumber(stats.totalSessions),
    updatedAt: typeof stats.lastComputedDate === 'string' ? stats.lastComputedDate : '',
    usageStreak: calculateClaudeActivityStreak(dailyActivity),
  };

  return hasClaudeLocalStatus(status) ? status : null;
}

function inspectCodexLocalStatus() {
  const codexHome = getProviderHome('codex');
  const auth = readJsonFileSafe(path.join(codexHome, 'auth.json'));
  const latestTokenEvent = findLatestCodexTokenCountEvent(path.join(codexHome, 'sessions'));
  const authClaims = getCodexAuthClaims(auth);
  const defaults = readCodexConfigDefaults('');
  const status = {
    authMode: typeof auth?.auth_mode === 'string' ? auth.auth_mode.trim() : '',
    defaultModel: typeof defaults?.model === 'string' ? defaults.model.trim() : '',
    kind: 'codex',
    lastTokenUsage: normalizeCodexTokenUsage(latestTokenEvent?.payload?.info?.last_token_usage),
    modelContextWindow: normalizeNonNegativeNumber(latestTokenEvent?.payload?.info?.model_context_window),
    planType: normalizeCodexPlanType(latestTokenEvent?.payload?.rate_limits?.plan_type || authClaims?.chatgpt_plan_type),
    rateLimits: normalizeCodexRateLimits(latestTokenEvent?.payload?.rate_limits),
    reasoningEffort: normalizeSessionReasoningEffort(defaults?.reasoningEffort),
    totalTokenUsage: normalizeCodexTokenUsage(latestTokenEvent?.payload?.info?.total_token_usage),
    updatedAt: latestTokenEvent?.timestamp || (typeof auth?.last_refresh === 'string' ? auth.last_refresh : ''),
  };

  return hasCodexLocalStatus(status) ? status : null;
}

function inspectSessionContextUsage(session, workspacePath = '') {
  const provider = normalizeSessionProvider(session?.provider);
  if (provider === 'codex') {
    const threadId = typeof session?.claudeSessionId === 'string'
      ? session.claudeSessionId.trim()
      : '';
    if (!threadId) {
      return null;
    }

    const tokenEvent = findLatestCodexTokenCountEventForThreadId(
      path.join(getProviderHome('codex'), 'sessions'),
      threadId,
    );

    return normalizeCodexContextUsage(
      tokenEvent?.payload?.info,
      typeof tokenEvent?.timestamp === 'string' ? tokenEvent.timestamp : '',
    );
  }

  if (provider === 'claude') {
    return inspectClaudeSessionContextUsage(session, workspacePath);
  }

  return null;
}

function inspectClaudeSessionContextUsage(session, workspacePath = '') {
  const sessionId = typeof session?.claudeSessionId === 'string'
    ? session.claudeSessionId.trim()
    : '';
  if (!sessionId) {
    return null;
  }

  const latestUsage = findLatestClaudeAssistantUsageForSessionId(
    path.join(getProviderHome('claude'), 'projects'),
    sessionId,
    workspacePath,
  );
  if (!latestUsage) {
    return null;
  }

  const modelContextWindow = inferClaudeModelContextWindow(
    session?.currentModel,
    session?.model,
    latestUsage.model,
  );

  return normalizeClaudeContextUsage(
    latestUsage.usage,
    modelContextWindow,
    typeof latestUsage.timestamp === 'string' ? latestUsage.timestamp : '',
  );
}

function readJsonFileSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function hasClaudeLocalStatus(status) {
  return Boolean(
    status
    && (
      status.currentModel
      || status.favoriteModel
      || status.lastActive
      || status.totalMessages > 0
      || status.totalSessions > 0
      || status.updatedAt
      || status.usageStreak > 0
    )
  );
}

function hasCodexLocalStatus(status) {
  return Boolean(
    status
    && (
      status.authMode
      || status.defaultModel
      || status.lastTokenUsage
      || status.modelContextWindow > 0
      || status.planType
      || status.rateLimits
      || status.reasoningEffort
      || status.totalTokenUsage
      || status.updatedAt
    )
  );
}

function getFavoriteClaudeModel(dailyModelTokens, modelUsage) {
  const totals = new Map();

  for (const entry of Array.isArray(dailyModelTokens) ? dailyModelTokens : []) {
    const tokensByModel = entry?.tokensByModel && typeof entry.tokensByModel === 'object'
      ? entry.tokensByModel
      : null;
    if (!tokensByModel) {
      continue;
    }

    for (const [modelName, tokenCount] of Object.entries(tokensByModel)) {
      if (typeof modelName !== 'string' || !modelName.trim()) {
        continue;
      }

      const normalizedTokenCount = normalizeNonNegativeNumber(tokenCount);
      if (!normalizedTokenCount) {
        continue;
      }

      totals.set(modelName.trim(), (totals.get(modelName.trim()) || 0) + normalizedTokenCount);
    }
  }

  if (totals.size === 0 && modelUsage && typeof modelUsage === 'object') {
    for (const [modelName, usage] of Object.entries(modelUsage)) {
      if (typeof modelName !== 'string' || !modelName.trim() || !usage || typeof usage !== 'object') {
        continue;
      }

      const totalTokens = [
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheReadInputTokens,
        usage.cacheCreationInputTokens,
      ].reduce((sum, value) => sum + normalizeNonNegativeNumber(value), 0);
      if (!totalTokens) {
        continue;
      }

      totals.set(modelName.trim(), totalTokens);
    }
  }

  let favoriteModel = '';
  let favoriteModelTokens = 0;
  for (const [modelName, totalTokens] of totals.entries()) {
    if (totalTokens <= favoriteModelTokens) {
      continue;
    }

    favoriteModel = modelName;
    favoriteModelTokens = totalTokens;
  }

  if (!favoriteModel) {
    return null;
  }

  return {
    name: favoriteModel,
    totalTokens: favoriteModelTokens,
  };
}

function getLatestClaudeActivityEntry(dailyActivity) {
  if (!Array.isArray(dailyActivity) || dailyActivity.length === 0) {
    return null;
  }

  const latestEntry = dailyActivity.reduce((current, entry) => {
    if (!entry || !isIsoDateString(entry.date)) {
      return current;
    }

    if (!current || entry.date > current.date) {
      return entry;
    }

    return current;
  }, null);

  if (!latestEntry) {
    return null;
  }

  return {
    date: latestEntry.date,
    messageCount: normalizeNonNegativeNumber(latestEntry.messageCount),
    sessionCount: normalizeNonNegativeNumber(latestEntry.sessionCount),
    toolCallCount: normalizeNonNegativeNumber(latestEntry.toolCallCount),
  };
}

function calculateClaudeActivityStreak(dailyActivity) {
  const dates = Array.from(new Set(
    (Array.isArray(dailyActivity) ? dailyActivity : [])
      .map((entry) => (isIsoDateString(entry?.date) ? entry.date : ''))
      .filter(Boolean),
  )).sort();

  if (dates.length === 0) {
    return 0;
  }

  let streak = 1;
  let expectedDate = dates[dates.length - 1];

  for (let index = dates.length - 2; index >= 0; index -= 1) {
    const previousDate = shiftIsoDate(expectedDate, -1);
    if (dates[index] !== previousDate) {
      break;
    }

    streak += 1;
    expectedDate = dates[index];
  }

  return streak;
}

function shiftIsoDate(value, offsetDays) {
  if (!isIsoDateString(value) || !Number.isFinite(offsetDays)) {
    return '';
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isIsoDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeNonNegativeNumber(value) {
  return Number.isFinite(value) && value > 0
    ? Math.max(0, Math.round(value))
    : 0;
}

function getCodexAuthClaims(auth) {
  const idTokenClaims = parseJwtPayload(auth?.tokens?.id_token);
  if (idTokenClaims?.['https://api.openai.com/auth']) {
    return idTokenClaims['https://api.openai.com/auth'];
  }

  const accessTokenClaims = parseJwtPayload(auth?.tokens?.access_token);
  return accessTokenClaims?.['https://api.openai.com/auth'] || null;
}

function parseJwtPayload(token) {
  if (typeof token !== 'string' || !token.trim()) {
    return null;
  }

  const parts = token.trim().split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const codexSessionFilePathCache = new Map();
const codexTokenCountEventCache = new Map();
const claudeSessionFilePathCache = new Map();
const claudeAssistantUsageCache = new Map();

function findLatestCodexTokenCountEvent(sessionRoot) {
  const latestSessionFile = findLatestCodexSessionFile(sessionRoot);
  return findLatestCodexTokenCountEventInFile(latestSessionFile);
}

function findLatestCodexTokenCountEventForThreadId(sessionRoot, threadId) {
  const sessionFile = findCodexSessionFileByThreadId(sessionRoot, threadId);
  return findLatestCodexTokenCountEventInFile(sessionFile);
}

function findLatestCodexTokenCountEventInFile(sessionFile) {
  if (!sessionFile) {
    return null;
  }

  try {
    const stats = fs.statSync(sessionFile);
    const cachedEvent = codexTokenCountEventCache.get(sessionFile);
    if (cachedEvent && cachedEvent.mtimeMs === stats.mtimeMs) {
      return cachedEvent.event;
    }

    const content = fs.readFileSync(sessionFile, 'utf8');
    const lines = content.split(/\r?\n/);
    let latestTokenEvent = null;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim();
      if (!line) {
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        if (parsed?.type === 'event_msg' && parsed?.payload?.type === 'token_count') {
          latestTokenEvent = parsed;
          break;
        }
      } catch {
        // Ignore malformed lines and keep scanning backwards.
      }
    }

    codexTokenCountEventCache.set(sessionFile, {
      event: latestTokenEvent,
      mtimeMs: stats.mtimeMs,
    });
    return latestTokenEvent;
  } catch {
    return null;
  }
}

function findCodexSessionFileByThreadId(sessionRoot, threadId) {
  if (!directoryExists(sessionRoot) || typeof threadId !== 'string' || !threadId.trim()) {
    return '';
  }

  const normalizedThreadId = threadId.trim();
  const cachedPath = codexSessionFilePathCache.get(normalizedThreadId);
  if (cachedPath && fs.existsSync(cachedPath)) {
    return cachedPath;
  }

  const queue = [sessionRoot];
  while (queue.length > 0) {
    const currentDirectory = queue.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(`${normalizedThreadId}.jsonl`)) {
        continue;
      }

      codexSessionFilePathCache.set(normalizedThreadId, entryPath);
      return entryPath;
    }
  }

  return '';
}

function findLatestCodexSessionFile(sessionRoot) {
  if (!directoryExists(sessionRoot)) {
    return '';
  }

  let latestMatch = '';
  let latestMtimeMs = 0;
  const queue = [sessionRoot];

  while (queue.length > 0) {
    const currentDirectory = queue.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
        continue;
      }

      try {
        const stats = fs.statSync(entryPath);
        if (!stats.isFile() || stats.mtimeMs <= latestMtimeMs) {
          continue;
        }

        latestMatch = entryPath;
        latestMtimeMs = stats.mtimeMs;
      } catch {
        // Ignore files that disappear during the scan.
      }
    }
  }

  return latestMatch;
}

function findLatestClaudeAssistantUsageForSessionId(projectsRoot, sessionId, workspacePath = '') {
  const sessionFile = findClaudeSessionFileBySessionId(projectsRoot, sessionId, workspacePath);
  return findLatestClaudeAssistantUsageInFile(sessionFile);
}

function findLatestClaudeAssistantUsageInFile(sessionFile) {
  if (!sessionFile) {
    return null;
  }

  try {
    const stats = fs.statSync(sessionFile);
    const cachedUsage = claudeAssistantUsageCache.get(sessionFile);
    if (cachedUsage && cachedUsage.mtimeMs === stats.mtimeMs) {
      return cachedUsage.entry;
    }

    const content = fs.readFileSync(sessionFile, 'utf8');
    const lines = content.split(/\r?\n/);
    let latestUsage = null;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim();
      if (!line) {
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        const message = parsed?.message;
        if (
          parsed?.type === 'assistant'
          && message?.role === 'assistant'
          && message?.usage
          && typeof message.usage === 'object'
        ) {
          latestUsage = {
            model: typeof message.model === 'string' ? message.model.trim() : '',
            timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : '',
            usage: message.usage,
          };
          break;
        }
      } catch {
        // Ignore malformed lines and keep scanning backwards.
      }
    }

    claudeAssistantUsageCache.set(sessionFile, {
      entry: latestUsage,
      mtimeMs: stats.mtimeMs,
    });
    return latestUsage;
  } catch {
    return null;
  }
}

function findClaudeSessionFileBySessionId(projectsRoot, sessionId, workspacePath = '') {
  if (!directoryExists(projectsRoot) || typeof sessionId !== 'string' || !sessionId.trim()) {
    return '';
  }

  const normalizedSessionId = sessionId.trim();
  const cachedPath = claudeSessionFilePathCache.get(normalizedSessionId);
  if (cachedPath && fs.existsSync(cachedPath)) {
    return cachedPath;
  }

  const directPath = getClaudeProjectSessionFilePath(projectsRoot, normalizedSessionId, workspacePath);
  if (directPath) {
    claudeSessionFilePathCache.set(normalizedSessionId, directPath);
    return directPath;
  }

  const queue = [projectsRoot];
  while (queue.length > 0) {
    const currentDirectory = queue.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile() || entry.name !== `${normalizedSessionId}.jsonl`) {
        continue;
      }

      claudeSessionFilePathCache.set(normalizedSessionId, entryPath);
      return entryPath;
    }
  }

  return '';
}

function getClaudeProjectSessionFilePath(projectsRoot, sessionId, workspacePath = '') {
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) {
    return '';
  }

  const projectDirectory = normalizeClaudeProjectDirectoryName(workspacePath);
  if (!projectDirectory) {
    return '';
  }

  const sessionFile = path.join(projectsRoot, projectDirectory, `${sessionId}.jsonl`);
  return fs.existsSync(sessionFile) ? sessionFile : '';
}

function normalizeClaudeProjectDirectoryName(workspacePath) {
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) {
    return '';
  }

  return workspacePath.trim().replace(/[\\/]/g, '-');
}

function normalizeCodexContextUsage(info, updatedAt = '') {
  if (!info || typeof info !== 'object') {
    return null;
  }

  const totalTokenUsage = normalizeCodexTokenUsage(info.total_token_usage);
  const lastTokenUsage = normalizeCodexTokenUsage(info.last_token_usage);
  const modelContextWindow = normalizeNonNegativeNumber(info.model_context_window);
  const contextTokenUsage = buildCodexContextTokenUsage(lastTokenUsage);
  const usedTokens = normalizeNonNegativeNumber(
    contextTokenUsage?.totalTokens || totalTokenUsage?.totalTokens,
  );
  const remainingTokens = modelContextWindow > 0
    ? Math.max(modelContextWindow - usedTokens, 0)
    : 0;
  const usedRatio = modelContextWindow > 0
    ? Math.min(Math.max(usedTokens / modelContextWindow, 0), 1)
    : 0;

  if (!modelContextWindow && !totalTokenUsage && !lastTokenUsage) {
    return null;
  }

  return {
    lastTokenUsage,
    modelContextWindow,
    remainingTokens,
    totalTokenUsage: contextTokenUsage || totalTokenUsage,
    updatedAt,
    usedRatio,
    usedTokens,
  };
}

function normalizeClaudeContextUsage(usage, modelContextWindow, updatedAt = '') {
  const lastTokenUsage = normalizeClaudeTokenUsage(usage);
  const usedTokens = normalizeNonNegativeNumber(
    (lastTokenUsage?.inputTokens || 0) + (lastTokenUsage?.cachedInputTokens || 0),
  );
  const totalTokenUsage = usedTokens > 0
    ? {
      cachedInputTokens: lastTokenUsage?.cachedInputTokens || 0,
      inputTokens: lastTokenUsage?.inputTokens || 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: usedTokens,
    }
    : null;
  const remainingTokens = modelContextWindow > 0
    ? Math.max(modelContextWindow - usedTokens, 0)
    : 0;
  const usedRatio = modelContextWindow > 0
    ? Math.min(Math.max(usedTokens / modelContextWindow, 0), 1)
    : 0;

  if (!modelContextWindow && !lastTokenUsage) {
    return null;
  }

  return {
    lastTokenUsage,
    modelContextWindow,
    remainingTokens,
    totalTokenUsage,
    updatedAt,
    usedRatio,
    usedTokens,
  };
}

function normalizeCodexTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const normalizedUsage = {
    cachedInputTokens: normalizeNonNegativeNumber(usage.cached_input_tokens),
    inputTokens: normalizeNonNegativeNumber(usage.input_tokens),
    outputTokens: normalizeNonNegativeNumber(usage.output_tokens),
    reasoningOutputTokens: normalizeNonNegativeNumber(usage.reasoning_output_tokens),
    totalTokens: normalizeNonNegativeNumber(usage.total_tokens),
  };

  return Object.values(normalizedUsage).some((value) => value > 0)
    ? normalizedUsage
    : null;
}

function buildCodexContextTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const inputTokens = normalizeNonNegativeNumber(usage.inputTokens);
  const cachedInputTokens = normalizeNonNegativeNumber(usage.cachedInputTokens);
  const outputTokens = normalizeNonNegativeNumber(usage.outputTokens);
  const totalTokens = normalizeNonNegativeNumber(usage.totalTokens) || (inputTokens + outputTokens);

  if (totalTokens <= 0) {
    return null;
  }

  return {
    cachedInputTokens,
    inputTokens,
    outputTokens,
    reasoningOutputTokens: 0,
    totalTokens,
  };
}

function normalizeClaudeTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const inputTokens = normalizeNonNegativeNumber(usage.input_tokens);
  const cachedInputTokens = normalizeNonNegativeNumber(usage.cache_read_input_tokens)
    + normalizeNonNegativeNumber(usage.cache_creation_input_tokens);
  const outputTokens = normalizeNonNegativeNumber(usage.output_tokens);
  const totalTokens = inputTokens + cachedInputTokens + outputTokens;

  if (!totalTokens) {
    return null;
  }

  return {
    cachedInputTokens,
    inputTokens,
    outputTokens,
    reasoningOutputTokens: 0,
    totalTokens,
  };
}

function inferClaudeModelContextWindow(...candidates) {
  let sawClaudeModel = false;

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      continue;
    }

    const normalizedCandidate = candidate.trim().toLowerCase();
    if (
      normalizedCandidate === 'opus[1m]'
      || normalizedCandidate === 'sonnet[1m]'
      || normalizedCandidate.includes('[1m]')
      || normalizedCandidate.includes('1m context')
    ) {
      return 1_000_000;
    }

    if (
      normalizedCandidate === 'haiku'
      || normalizedCandidate === 'sonnet'
      || normalizedCandidate === 'opus'
      || normalizedCandidate.includes('claude-haiku-')
      || normalizedCandidate.includes('claude-sonnet-')
      || normalizedCandidate.includes('claude-opus-')
    ) {
      sawClaudeModel = true;
    }
  }

  return sawClaudeModel ? 200_000 : 0;
}

function normalizeCodexRateLimits(rateLimits) {
  if (!rateLimits || typeof rateLimits !== 'object') {
    return null;
  }

  const normalizedRateLimits = {
    primary: normalizeCodexRateLimitWindow(rateLimits.primary),
    secondary: normalizeCodexRateLimitWindow(rateLimits.secondary),
  };

  return normalizedRateLimits.primary || normalizedRateLimits.secondary
    ? normalizedRateLimits
    : null;
}

function normalizeCodexRateLimitWindow(window) {
  if (!window || typeof window !== 'object') {
    return null;
  }

  const usedPercent = Number.isFinite(window.used_percent)
    ? Number(window.used_percent)
    : null;
  const windowMinutes = normalizeNonNegativeNumber(window.window_minutes);
  const resetsAt = Number.isFinite(window.resets_at) && window.resets_at > 0
    ? new Date(window.resets_at * 1000).toISOString()
    : '';

  if (!Number.isFinite(usedPercent) && !windowMinutes && !resetsAt) {
    return null;
  }

  return {
    resetsAt,
    usedPercent,
    windowMinutes,
  };
}

function normalizeCodexPlanType(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
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

function getEffectiveSessionDefaults(workspacePath, session) {
  if (normalizeSessionProvider(session?.provider) !== 'codex') {
    return {
      model: '',
      reasoningEffort: '',
    };
  }

  return readCodexConfigDefaults(workspacePath);
}

function readCodexConfigDefaults(workspacePath = '') {
  const configPath = path.join(getProviderHome('codex'), 'config.toml');
  let stats;

  try {
    stats = fs.statSync(configPath);
  } catch {
    return {
      model: '',
      reasoningEffort: '',
    };
  }

  if (
    codexConfigDefaultsCache.path !== configPath
    || codexConfigDefaultsCache.mtimeMs !== stats.mtimeMs
    || !codexConfigDefaultsCache.parsed
  ) {
    codexConfigDefaultsCache = {
      mtimeMs: stats.mtimeMs,
      parsed: parseCodexConfigDefaults(fs.readFileSync(configPath, 'utf8')),
      path: configPath,
    };
  }

  return resolveCodexConfigDefaultsForWorkspace(codexConfigDefaultsCache.parsed, workspacePath);
}

function parseCodexConfigDefaults(source) {
  const root = {};
  const projects = [];
  let activeSection = 'root';
  let activeProject = null;

  for (const rawLine of String(source || '').split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }

    const projectSectionMatch = line.match(/^\[projects\."((?:\\.|[^"])*)"\]$/);
    if (projectSectionMatch) {
      activeSection = 'project';
      activeProject = {
        path: unescapeTomlBasicString(projectSectionMatch[1]),
        values: {},
      };
      projects.push(activeProject);
      continue;
    }

    if (/^\[.*\]$/.test(line)) {
      activeSection = 'other';
      activeProject = null;
      continue;
    }

    const assignmentMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*"((?:\\.|[^"])*)"$/);
    if (!assignmentMatch) {
      continue;
    }

    const [, key, rawValue] = assignmentMatch;
    if (key !== 'model' && key !== 'model_reasoning_effort') {
      continue;
    }

    const target = activeSection === 'project' && activeProject
      ? activeProject.values
      : (activeSection === 'root' ? root : null);
    if (!target) {
      continue;
    }

    target[key] = unescapeTomlBasicString(rawValue);
  }

  return {
    projects,
    root,
  };
}

function resolveCodexConfigDefaultsForWorkspace(parsedConfig, workspacePath = '') {
  const root = parsedConfig?.root && typeof parsedConfig.root === 'object'
    ? parsedConfig.root
    : {};
  const projectValues = findBestMatchingCodexProjectConfig(parsedConfig?.projects, workspacePath);

  return {
    model: typeof projectValues?.model === 'string' && projectValues.model.trim()
      ? projectValues.model.trim()
      : (typeof root.model === 'string' ? root.model.trim() : ''),
    reasoningEffort: normalizeSessionReasoningEffort(
      typeof projectValues?.model_reasoning_effort === 'string' && projectValues.model_reasoning_effort.trim()
        ? projectValues.model_reasoning_effort.trim()
        : root.model_reasoning_effort,
    ),
  };
}

function findBestMatchingCodexProjectConfig(projects, workspacePath = '') {
  if (!Array.isArray(projects) || projects.length === 0 || !workspacePath) {
    return null;
  }

  const normalizedWorkspacePath = normalizeComparablePath(workspacePath);
  if (!normalizedWorkspacePath) {
    return null;
  }

  let bestMatch = null;
  let bestMatchLength = -1;

  for (const project of projects) {
    const normalizedProjectPath = normalizeComparablePath(project?.path);
    if (!normalizedProjectPath || !isComparablePathPrefix(normalizedProjectPath, normalizedWorkspacePath)) {
      continue;
    }

    if (normalizedProjectPath.length <= bestMatchLength) {
      continue;
    }

    bestMatch = project.values || null;
    bestMatchLength = normalizedProjectPath.length;
  }

  return bestMatch;
}

function normalizeComparablePath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  return path.resolve(value.trim());
}

function isComparablePathPrefix(prefixPath, targetPath) {
  if (!prefixPath || !targetPath) {
    return false;
  }

  return targetPath === prefixPath || targetPath.startsWith(`${prefixPath}${path.sep}`);
}

function stripTomlComment(line) {
  let result = '';
  let inString = false;
  let escaping = false;

  for (const character of String(line || '')) {
    if (escaping) {
      result += character;
      escaping = false;
      continue;
    }

    if (character === '\\') {
      result += character;
      escaping = inString;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      result += character;
      continue;
    }

    if (character === '#' && !inString) {
      break;
    }

    result += character;
  }

  return result;
}

function unescapeTomlBasicString(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function inspectCodeEditors(platform = process.platform) {
  const macApplications = platform === 'darwin'
    ? collectMacApplicationsByName(
      CODE_EDITOR_CANDIDATES.flatMap((editor) => editor.macAppNames || []),
    )
    : new Map();

  return CODE_EDITOR_CANDIDATES.reduce((editors, candidate) => {
    const matchedApplicationPath = platform === 'darwin'
      ? pickFirstDetectedPath(
        (candidate.macAppNames || []).flatMap((appName) => (
          macApplications.get(appName.toLowerCase()) || []
        )),
      )
      : '';

    if (matchedApplicationPath) {
      editors.push({
        key: candidate.key,
        label: candidate.label,
        path: matchedApplicationPath,
      });
      return editors;
    }

    const executablePath = resolveCodeEditorExecutablePath(candidate.commands || []);
    if (executablePath) {
      editors.push({
        key: candidate.key,
        label: candidate.label,
        path: executablePath,
      });
    }

    return editors;
  }, []);
}

function normalizeCodeEditorKey(value) {
  const normalizedValue = typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';

  if (!normalizedValue) {
    return '';
  }

  return CODE_EDITOR_KEY_ALIASES.get(normalizedValue) || '';
}

function getCodeEditorCandidate(editorKey) {
  const normalizedEditorKey = normalizeCodeEditorKey(editorKey);
  return CODE_EDITOR_CANDIDATES.find((editor) => editor.key === normalizedEditorKey) || null;
}

function resolveSelectedCodeEditorKey(storedKey, availableEditors = []) {
  const normalizedStoredKey = normalizeCodeEditorKey(storedKey);
  const availableKeys = new Set(
    (Array.isArray(availableEditors) ? availableEditors : [])
      .map((editor) => normalizeCodeEditorKey(editor?.key))
      .filter(Boolean),
  );

  if (normalizedStoredKey && availableKeys.has(normalizedStoredKey)) {
    return normalizedStoredKey;
  }

  if (availableKeys.has(DEFAULT_CODE_EDITOR_KEY)) {
    return DEFAULT_CODE_EDITOR_KEY;
  }

  return normalizeCodeEditorKey(availableEditors[0]?.key);
}

function collectMacApplicationsByName(appNames = []) {
  const names = Array.from(new Set(
    appNames
      .filter((appName) => typeof appName === 'string' && appName.trim())
      .map((appName) => appName.trim().toLowerCase()),
  ));

  if (names.length === 0) {
    return new Map();
  }

  const matches = new Map(names.map((name) => [name, []]));
  for (const rootPath of getMacApplicationSearchRoots()) {
    scanMacApplicationDirectory(rootPath, matches, 0);
  }

  return matches;
}

function scanMacApplicationDirectory(directoryPath, matches, depth) {
  if (!directoryExists(directoryPath)) {
    return;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch {
    return;
  }

  entries
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      const lowerName = entry.name.toLowerCase();

      if (lowerName.endsWith('.app')) {
        const resolvedAppPath = resolveApplicationBundlePath(entryPath);
        if (resolvedAppPath && matches.has(lowerName)) {
          pushUniqueValue(matches.get(lowerName), resolvedAppPath);
        }
        return;
      }

      if (depth >= MAC_APPLICATION_SCAN_DEPTH || !isDirectoryLike(entry, entryPath)) {
        return;
      }

      scanMacApplicationDirectory(entryPath, matches, depth + 1);
    });
}

function getMacApplicationSearchRoots() {
  return [
    '/Applications',
    path.join(os.homedir(), 'Applications'),
    '/System/Applications',
  ];
}

function isDirectoryLike(entry, entryPath) {
  if (entry?.isDirectory()) {
    return true;
  }

  if (!entry?.isSymbolicLink()) {
    return false;
  }

  try {
    return fs.statSync(entryPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveApplicationBundlePath(appPath) {
  if (!appPath || typeof appPath !== 'string') {
    return '';
  }

  try {
    const stats = fs.statSync(appPath);
    if (!stats.isDirectory()) {
      return '';
    }

    return fs.realpathSync(appPath);
  } catch {
    return '';
  }
}

function resolveCodeEditorExecutablePath(commands = []) {
  for (const commandName of commands) {
    if (!commandName) {
      continue;
    }

    const pathResolved = findExecutableInPath(commandName, process.env.PATH || '');
    if (pathResolved) {
      return pathResolved;
    }

    for (const candidate of getCommonExecutableCandidates(commandName)) {
      const resolved = resolveExecutableCandidate(candidate);
      if (resolved) {
        return resolved;
      }
    }
  }

  return '';
}

function openPathInCodeEditor(editor, targetPath, options = {}) {
  const editorPath = typeof editor?.path === 'string' ? editor.path.trim() : '';
  const editorKey = normalizeCodeEditorKey(editor?.key);
  if (!editorPath || !targetPath) {
    throw new Error('缺少编辑器或目标路径。');
  }

  const launchPath = resolveCodeEditorLaunchPath(editor, editorKey);
  const launchArgs = buildCodeEditorLaunchArgs(editorKey, targetPath, options);
  const fallbackTargets = getCodeEditorFallbackTargets(targetPath, options.workspacePath);

  if (launchPath) {
    try {
      const proc = spawn(launchPath, launchArgs.length > 0 ? launchArgs : fallbackTargets, {
        detached: true,
        stdio: 'ignore',
      });
      proc.unref();
      return;
    } catch (error) {
      if (!editorPath.toLowerCase().endsWith('.app')) {
        throw new Error(error?.message || '无法使用所选编辑器打开目标路径。');
      }
    }
  }

  if (process.platform === 'darwin' && editorPath.toLowerCase().endsWith('.app')) {
    const result = spawnSync('open', [
      '-a',
      editorPath,
      ...(launchArgs.length > 0 ? ['--args', ...launchArgs] : fallbackTargets),
    ], {
      encoding: 'utf8',
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || '无法使用所选编辑器打开目标路径。').trim());
    }

    return;
  }

  throw new Error('无法使用所选编辑器打开目标路径。');
}

function buildCodeEditorLaunchArgs(editorKey, targetPath, options = {}) {
  const workspacePath = typeof options.workspacePath === 'string' ? options.workspacePath.trim() : '';
  const gotoTarget = formatCodeEditorGotoTarget(targetPath, options.line, options.column);

  if (VS_CODE_LIKE_EDITOR_KEYS.has(editorKey)) {
    const args = [];
    if (workspacePath && workspacePath !== targetPath) {
      args.push('--reuse-window', workspacePath);
    }

    if (gotoTarget) {
      args.push('--goto', gotoTarget);
    } else {
      args.push(targetPath);
    }

    return args;
  }

  if (MULTI_TARGET_GOTO_EDITOR_KEYS.has(editorKey)) {
    return [
      ...getCodeEditorFallbackTargets(targetPath, workspacePath).filter((entry) => entry !== targetPath),
      gotoTarget || targetPath,
    ];
  }

  return [];
}

function getCodeEditorFallbackTargets(targetPath, workspacePath) {
  return Array.from(new Set(
    [workspacePath, targetPath]
      .filter((entry) => typeof entry === 'string' && entry.trim()),
  ));
}

function formatCodeEditorGotoTarget(targetPath, line, column) {
  const normalizedLine = Number.isInteger(line) && line > 0 ? line : null;
  const normalizedColumn = Number.isInteger(column) && column > 0 ? column : null;
  if (!normalizedLine) {
    return '';
  }

  return `${targetPath}:${normalizedLine}${normalizedColumn ? `:${normalizedColumn}` : ''}`;
}

function resolveCodeEditorLaunchPath(editor, editorKey) {
  const editorPath = typeof editor?.path === 'string' ? editor.path.trim() : '';
  if (!editorPath) {
    return '';
  }

  if (!editorPath.toLowerCase().endsWith('.app')) {
    return editorPath;
  }

  const candidate = getCodeEditorCandidate(editorKey);
  if (candidate?.macCliRelativePath) {
    const bundledCliPath = resolveExecutableCandidate(path.join(editorPath, candidate.macCliRelativePath));
    if (bundledCliPath) {
      return bundledCliPath;
    }
  }

  return resolveCodeEditorExecutablePath(candidate?.commands || []);
}

function pickFirstDetectedPath(paths = []) {
  return Array.from(new Set((Array.isArray(paths) ? paths : []).filter(Boolean)))[0] || '';
}

function pushUniqueValue(target, value) {
  if (!Array.isArray(target) || !value || target.includes(value)) {
    return;
  }

  target.push(value);
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

function getCliProcessEnv(force = false, networkProxy = null) {
  const shellPath = getShellPathValue(force);
  const baseEnv = !shellPath
    ? { ...process.env }
    : {
      ...process.env,
      PATH: shellPath,
    };

  return applyNetworkProxySettingsToEnv(baseEnv, networkProxy);
}

function applyNetworkProxySettingsToEnv(env, networkProxy) {
  const nextEnv = env && typeof env === 'object' ? { ...env } : {};
  const normalizedProxy = normalizeNetworkProxySettings(networkProxy);

  if (!normalizedProxy.enabled) {
    return nextEnv;
  }

  for (const key of PROXY_ENV_KEYS) {
    delete nextEnv[key];
    delete nextEnv[key.toLowerCase()];
  }

  setMirroredEnvValue(nextEnv, 'HTTP_PROXY', normalizedProxy.httpProxy);
  setMirroredEnvValue(nextEnv, 'HTTPS_PROXY', normalizedProxy.httpsProxy);
  setMirroredEnvValue(nextEnv, 'ALL_PROXY', normalizedProxy.allProxy);
  setMirroredEnvValue(nextEnv, 'NO_PROXY', normalizedProxy.noProxy);

  return nextEnv;
}

function setMirroredEnvValue(env, key, value) {
  if (!value) {
    return;
  }

  env[key] = value;
  env[key.toLowerCase()] = value;
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
  const cacheKey = `${normalizedProvider}\u0000${workspacePath || ''}`;
  const cached = skillListCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.checkedAt < SKILL_LIST_CACHE_TTL_MS) {
    return cached.entries;
  }

  const providerSkillRoot = path.join(getProviderHome(normalizedProvider), 'skills');
  const roots = [
    { path: providerSkillRoot, scope: 'user' },
    { path: path.join(providerSkillRoot, '.system'), scope: 'system' },
  ];
  if (workspacePath) {
    const projectSkillRoot = path.join(workspacePath, getProjectProviderDirectoryName(normalizedProvider), 'skills');
    roots.push({ path: projectSkillRoot, scope: 'project' });
    roots.push({ path: path.join(projectSkillRoot, '.system'), scope: 'system' });
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

  const sortedEntries = entries.sort((left, right) => left.name.localeCompare(right.name));
  skillListCache.set(cacheKey, {
    checkedAt: now,
    entries: sortedEntries,
  });
  return sortedEntries;
}

function setBoundedCacheValue(cache, key, value, maxEntries) {
  cache.set(key, value);
  if (cache.size <= maxEntries) {
    return;
  }

  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) {
    cache.delete(oldestKey);
  }
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
