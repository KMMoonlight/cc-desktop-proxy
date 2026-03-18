import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowUp,
  Blocks,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Folder,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  MessageSquarePlus,
  PlugZap,
  Search,
  Sparkles,
  Square,
  TerminalSquare,
  Trash2,
  Workflow,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { renderMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';

const EMPTY_APP_STATE = {
  activeSession: null,
  claude: {
    available: false,
    busy: false,
    models: [],
    skills: [],
    version: '',
  },
  expandedWorkspaceIds: [],
  platform: '',
  selectedSessionId: null,
  selectedWorkspaceId: null,
  workspaces: [],
};

const LANGUAGE_STORAGE_KEY = 'cc-desktop-proxy-language';
const THEME_STORAGE_KEY = 'cc-desktop-proxy-theme';
const COPY = {
  zh: {
    addWorkspace: '添加工作目录',
    archiveConversation: '归档话题',
    archiveConversationConfirm: '确认归档',
    archiveConversationConfirming: '归档中...',
    archiveConversationDescription: '归档后，这个话题会从当前列表中隐藏。',
    archiveConversationTitle: '确认归档这个话题？',
    bridgeUnavailable: '当前页面没有接到 Electron bridge，请通过桌面应用启动。',
    cancel: '取消',
    claudeCode: 'Claude Code',
    claudeCodeUnavailable: 'Claude Code 不可用',
    collapseDetails: '收起详情',
    collapseWorkspace: '收起工作目录',
    conversationEmpty: '这个会话还没有内容',
    createConversationForWorkspace: '为当前目录新开对话',
    createConversationInWorkspace: (path) => `在 ${path} 中新建对话`,
    emptyWorkspaces: '还没有工作目录，先添加一个本地目录。',
    expandDetails: '展开详情',
    expandWorkspace: '展开工作目录',
    inputPlaceholder: '输入消息或 / 指令，Enter 发送，Shift+Enter 换行...',
    languageLabel: '语言',
    languageChinese: '🇨🇳 中文',
    languageEnglish: '🇺🇸 English',
    modelDefault: '跟随 Claude 默认值',
    modelLabel: '模型',
    modelMenuDescription: '切换当前会话的 Claude 模型，命令值与 Claude Code 的 /model 保持一致。',
    modelMenuHint: '其他完整模型名仍然可以通过 /model <name> 设置。',
    modelMenuTitle: '选择模型',
    modelOptionCustom: '当前自定义模型',
    modelOptionDefault: 'Default（推荐）',
    modelOptionHaiku: 'Haiku',
    modelOptionOpus: 'Opus',
    modelOptionOpusLong: 'Opus（1M context）',
    modelOptionSonnet: 'Sonnet',
    modelSummaryCustom: (label) => `当前会话正在使用 ${label}`,
    modelSummaryDefault: (label) => (label ? `使用 Claude Code 默认模型（当前 ${label}）` : '使用 Claude Code 默认模型'),
    modelSummaryHaiku: 'Haiku 4.5 · 响应最快，适合轻量任务 · $1/$5 per Mtok',
    modelSummaryOpus: 'Opus 4.6 · 最适合复杂任务 · $5/$25 per Mtok',
    modelSummaryOpusLong: 'Opus 4.6 长上下文版 · 适合超长会话 · $10/$37.50 per Mtok',
    modelSummarySonnet: 'Sonnet 4.5 · 适合日常编码任务 · $3/$15 per Mtok',
    noConversationOpen: '还没有打开对话',
    noSessionCommandHint: '输入 /clear 新建对话，或先在左侧选择一个历史会话',
    noConversationsInWorkspace: '还没有对话',
    noSessionsYet: '先在左侧创建或选择一个历史会话',
    noWorkspaceSelected: '选择一个工作目录',
    removeWorkspace: '移除工作目录',
    removeWorkspaceConfirm: '确认移除',
    removeWorkspaceConfirming: '移除中...',
    removeWorkspaceDescription: '移除后，这个工作目录及其本地话题记录会从应用列表中删除。',
    removeWorkspaceTitle: '确认移除这个工作目录？',
    removeWorkspaceWithPath: (path) => `移除 ${path}`,
    runStop: '停止生成',
    searchPlaceholder: '搜索对话标题、摘要或会话 ID',
    searchNoResult: (query) => `没有找到和“${query}”相关的对话。`,
    sendMessage: '发送消息',
    sending: '发送中',
    startByAddingWorkspace: '先添加一个工作目录',
    startByAddingWorkspaceDescription: '工作目录会成为 Claude Code 运行时的本地上下文。你可以创建多个目录，并在左侧切换它们各自的历史对话。',
    themeDark: '🌙 深色',
    themeLabel: '主题',
    themeLight: '☀️ 浅色',
    themeSystem: '🖥️ 跟随系统',
    toolArchiveDisabled: '运行中的话题不能归档',
    toolGroupCompleted: (count) => `${count} 条已完成`,
    toolGroupFailed: (count) => `${count} 条失败`,
    toolGroupRunning: (count) => `${count} 条进行中`,
    toolGroupSummary: (count) => `${count} 条工具消息`,
    toolGroupTitle: '工具调用汇总',
    workspaceSection: '工作目录',
    workspaceSelectedDescription: '这个工作目录已经选中，但还没有打开任何会话。点击左侧目录项右侧的“新对话”，就会在该目录下创建新的历史会话。',
  },
  en: {
    addWorkspace: 'Add workspace',
    archiveConversation: 'Archive conversation',
    archiveConversationConfirm: 'Archive',
    archiveConversationConfirming: 'Archiving...',
    archiveConversationDescription: 'After archiving, this conversation will be hidden from the current list.',
    archiveConversationTitle: 'Archive this conversation?',
    bridgeUnavailable: 'Electron bridge is not available on this page. Please open it from the desktop app.',
    cancel: 'Cancel',
    claudeCode: 'Claude Code',
    claudeCodeUnavailable: 'Claude Code unavailable',
    collapseDetails: 'Hide details',
    collapseWorkspace: 'Collapse workspace',
    conversationEmpty: 'This conversation is empty',
    createConversationForWorkspace: 'Start a conversation for this workspace',
    createConversationInWorkspace: (path) => `Start a conversation in ${path}`,
    emptyWorkspaces: 'No workspaces yet. Add a local folder to get started.',
    expandDetails: 'Show details',
    expandWorkspace: 'Expand workspace',
    inputPlaceholder: 'Type a message or / command, press Enter to send, Shift+Enter for a new line...',
    languageLabel: 'Language',
    languageChinese: '🇨🇳 Chinese',
    languageEnglish: '🇺🇸 English',
    modelDefault: 'Follow Claude default',
    modelLabel: 'Model',
    modelMenuDescription: 'Switch Claude models for this conversation. Command values match Claude Code /model.',
    modelMenuHint: 'You can still set any full model name with /model <name>.',
    modelMenuTitle: 'Select model',
    modelOptionCustom: 'Current custom model',
    modelOptionDefault: 'Default (recommended)',
    modelOptionHaiku: 'Haiku',
    modelOptionOpus: 'Opus',
    modelOptionOpusLong: 'Opus (1M context)',
    modelOptionSonnet: 'Sonnet',
    modelSummaryCustom: (label) => `This conversation is currently using ${label}`,
    modelSummaryDefault: (label) => (label ? `Use Claude Code's default model (currently ${label})` : 'Use Claude Code\'s default model'),
    modelSummaryHaiku: 'Haiku 4.5 · Fastest for quick answers · $1/$5 per Mtok',
    modelSummaryOpus: 'Opus 4.6 · Most capable for complex work · $5/$25 per Mtok',
    modelSummaryOpusLong: 'Opus 4.6 for long sessions · $10/$37.50 per Mtok',
    modelSummarySonnet: 'Sonnet 4.5 · Best for everyday tasks · $3/$15 per Mtok',
    noConversationOpen: 'No conversation open',
    noSessionCommandHint: 'Type /clear to start a conversation, or pick one from the sidebar',
    noConversationsInWorkspace: 'No conversations yet',
    noSessionsYet: 'Create or select a conversation from the sidebar first',
    noWorkspaceSelected: 'Select a workspace',
    removeWorkspace: 'Remove workspace',
    removeWorkspaceConfirm: 'Remove',
    removeWorkspaceConfirming: 'Removing...',
    removeWorkspaceDescription: 'Removing this workspace will delete it and its local conversation history from the app list.',
    removeWorkspaceTitle: 'Remove this workspace?',
    removeWorkspaceWithPath: (path) => `Remove ${path}`,
    runStop: 'Stop generation',
    searchPlaceholder: 'Search titles, previews, or session IDs',
    searchNoResult: (query) => `No conversations found for "${query}".`,
    sendMessage: 'Send message',
    sending: 'Sending',
    startByAddingWorkspace: 'Add a workspace first',
    startByAddingWorkspaceDescription: 'A workspace becomes the local context for Claude Code. You can add multiple folders and switch between their conversation histories from the left sidebar.',
    themeDark: '🌙 Dark',
    themeLabel: 'Theme',
    themeLight: '☀️ Light',
    themeSystem: '🖥️ System',
    toolArchiveDisabled: 'Running conversations cannot be archived',
    toolGroupCompleted: (count) => `${count} completed`,
    toolGroupFailed: (count) => `${count} failed`,
    toolGroupRunning: (count) => `${count} running`,
    toolGroupSummary: (count) => `${count} tool messages`,
    toolGroupTitle: 'Tool activity summary',
    workspaceSection: 'Workspaces',
    workspaceSelectedDescription: 'This workspace is selected, but no conversation is open yet. Click "New conversation" on the right side of the workspace row to create one.',
  },
};

export default function App() {
  const desktopClient = typeof window !== 'undefined' ? window.claudeDesktop : null;

  const [appState, setAppState] = useState(EMPTY_APP_STATE);
  const [language, setLanguage] = useState(() => getInitialLanguage());
  const [themePreference, setThemePreference] = useState(() => getInitialThemePreference());
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme());
  const [inputValue, setInputValue] = useState('');
  const [sidebarError, setSidebarError] = useState(
    desktopClient ? '' : COPY[getInitialLanguage()].bridgeUnavailable,
  );
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isArchivingSession, setIsArchivingSession] = useState(false);
  const [isPickingWorkspace, setIsPickingWorkspace] = useState(false);
  const [isRemovingWorkspace, setIsRemovingWorkspace] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isUpdatingModel, setIsUpdatingModel] = useState(false);
  const [pendingArchiveSession, setPendingArchiveSession] = useState(null);
  const [pendingRemoveWorkspace, setPendingRemoveWorkspace] = useState(null);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');

  const hasHydratedExpandedWorkspaceIdsRef = useRef(false);
  const modelPickerRef = useRef(null);
  const slashCommandMenuRef = useRef(null);
  const textareaRef = useRef(null);
  const messageViewportRef = useRef(null);

  const selectedWorkspace = useMemo(
    () => appState.workspaces.find((workspace) => workspace.id === appState.selectedWorkspaceId) || null,
    [appState.selectedWorkspaceId, appState.workspaces],
  );
  const copy = COPY[language];
  const selectedSession = appState.activeSession;
  const normalizedSessionSearchQuery = sessionSearchQuery.trim().toLowerCase();
  const installedSkills = Array.isArray(appState.claude.skills) ? appState.claude.skills : [];
  const slashCommands = useMemo(() => getSlashCommands(language, installedSkills), [installedSkills, language]);
  const availableClaudeModels = Array.isArray(appState.claude.models) ? appState.claude.models : [];
  const effectiveCurrentModel = selectedSession?.currentModel || selectedSession?.model || '';
  const modelOptions = useMemo(
    () => getComposerModelOptions(copy, selectedSession?.model || '', effectiveCurrentModel, availableClaudeModels),
    [availableClaudeModels, copy, effectiveCurrentModel, selectedSession?.model],
  );
  const currentModelDisplay = useMemo(
    () => getModelDisplayName(effectiveCurrentModel, availableClaudeModels) || copy.modelOptionDefault,
    [availableClaudeModels, copy.modelOptionDefault, effectiveCurrentModel],
  );
  const currentModelCommandValue = useMemo(
    () => ((selectedSession?.model || '').trim() || 'default'),
    [selectedSession?.model],
  );
  const slashCommandQuery = useMemo(() => getSlashCommandQuery(inputValue), [inputValue]);
  const visibleSlashCommands = useMemo(
    () => filterSlashCommands(slashCommands, slashCommandQuery),
    [slashCommandQuery, slashCommands],
  );
  const highlightedSlashCommand = visibleSlashCommands[selectedSlashCommandIndex] || visibleSlashCommands[0] || null;
  const isSlashCommandMenuOpen = slashCommandQuery !== null;
  const renderableMessages = useMemo(
    () => mergeRenderableMessages(selectedSession?.messages || [], language),
    [language, selectedSession?.messages],
  );
  const filteredWorkspaces = useMemo(() => {
    if (!normalizedSessionSearchQuery) {
      return appState.workspaces;
    }

    return appState.workspaces.reduce((matches, workspace) => {
      const filteredSessions = workspace.sessions.filter((session) => matchesSessionSearch(session, normalizedSessionSearchQuery));

      if (!filteredSessions.length) {
        return matches;
      }

      matches.push({
        ...workspace,
        sessions: filteredSessions,
      });
      return matches;
    }, []);
  }, [appState.workspaces, normalizedSessionSearchQuery]);
  const isMac = appState.platform === 'darwin';
  const topBarHeightClass = isMac ? 'h-10' : 'h-11';
  const topBarOffsetClass = isMac ? 'pt-10' : 'pt-11';
  const shouldShowRunIndicator = useMemo(
    () => shouldRenderRunIndicator(selectedSession, isSending),
    [isSending, selectedSession],
  );
  const resolvedTheme = themePreference === 'system' ? systemTheme : themePreference;

  useEffect(() => {
    setSelectedSlashCommandIndex(0);
  }, [slashCommandQuery]);

  useEffect(() => {
    if (!isSlashCommandMenuOpen) {
      return;
    }

    const menu = slashCommandMenuRef.current;
    if (!menu) {
      return;
    }

    const highlightedItem = menu.querySelector('[data-slash-command-highlighted="true"]');
    highlightedItem?.scrollIntoView({
      block: 'nearest',
    });
  }, [highlightedSlashCommand?.name, isSlashCommandMenuOpen]);

  useEffect(() => {
    if (isSlashCommandMenuOpen) {
      setIsModelPickerOpen(false);
    }
  }, [isSlashCommandMenuOpen]);

  useEffect(() => {
    if (!isSlashCommandMenuOpen) {
      return;
    }

    refreshAppStateSilently();
  }, [isSlashCommandMenuOpen]);

  useEffect(() => {
    if (!selectedSession) {
      setIsModelPickerOpen(false);
    }
  }, [selectedSession]);

  useEffect(() => {
    if (!isModelPickerOpen || typeof document === 'undefined') {
      return undefined;
    }

    const closeOnOutsidePointer = (event) => {
      if (modelPickerRef.current?.contains(event.target)) {
        return;
      }

      setIsModelPickerOpen(false);
    };

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setIsModelPickerOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isModelPickerOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    document.documentElement.lang = getIntlLocale(language);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = (event) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', syncSystemTheme);

    return () => {
      mediaQuery.removeEventListener('change', syncSystemTheme);
    };
  }, []);

  useEffect(() => {
    if (!desktopClient) {
      setSidebarError(copy.bridgeUnavailable);
    }
  }, [copy.bridgeUnavailable, desktopClient]);

  useEffect(() => {
    if (!desktopClient) {
      setIsBootstrapping(false);
      return;
    }

    const unsubscribe = desktopClient.onStateChange((event) => {
      if (event?.type === 'state' && event.state) {
        setAppState(event.state);
        setIsSending(false);
      }
    });

    loadAppState();

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    setExpandedWorkspaceIds((current) => {
      const validIds = new Set(appState.workspaces.map((workspace) => workspace.id));
      const persistedIds = Array.isArray(appState.expandedWorkspaceIds) ? appState.expandedWorkspaceIds : [];
      const next = hasHydratedExpandedWorkspaceIdsRef.current
        ? current.filter((id) => validIds.has(id))
        : persistedIds.filter((id) => validIds.has(id));

      hasHydratedExpandedWorkspaceIdsRef.current = true;

      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current;
      }

      return next;
    });
  }, [appState.expandedWorkspaceIds, appState.workspaces, isBootstrapping]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [inputValue]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      return undefined;
    }

    let nextFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      nextFrameId = window.requestAnimationFrame(() => {
        const top = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);
        viewport.scrollTo({
          top,
          behavior: selectedSession?.status === 'running' || shouldShowRunIndicator ? 'auto' : 'smooth',
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (nextFrameId) {
        window.cancelAnimationFrame(nextFrameId);
      }
    };
  }, [selectedSession?.id, selectedSession?.messages, selectedSession?.status, shouldShowRunIndicator]);

  async function loadAppState() {
    if (!desktopClient) {
      return;
    }

    setIsBootstrapping(true);

    try {
      const state = await desktopClient.getAppState();
      setAppState(state);
      setSidebarError('');
    } catch (error) {
      setSidebarError(error.message);
    } finally {
      setIsBootstrapping(false);
    }
  }

  async function refreshAppStateSilently() {
    if (!desktopClient) {
      return;
    }

    try {
      const state = await desktopClient.getAppState();
      setAppState(state);
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  async function addWorkspace() {
    if (!desktopClient || isPickingWorkspace || appState.claude.busy) {
      return;
    }

    setIsPickingWorkspace(true);
    setSidebarError('');

    try {
      const selectedPath = await desktopClient.pickWorkspaceDirectory();
      if (!selectedPath) {
        return;
      }

      const nextState = await desktopClient.addWorkspace(selectedPath);
      setAppState(nextState);
    } catch (error) {
      setSidebarError(error.message);
    } finally {
      setIsPickingWorkspace(false);
    }
  }

  async function createSession(workspaceId) {
    if (!desktopClient || appState.claude.busy) {
      return;
    }

    setSidebarError('');

    try {
      const nextState = await desktopClient.createSession(workspaceId);
      setAppState(nextState);
      setInputValue('');
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  async function selectWorkspace(workspaceId) {
    if (!desktopClient) {
      return;
    }

    setSidebarError('');

    try {
      const nextState = await desktopClient.selectWorkspace(workspaceId);
      setAppState(nextState);
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  async function selectSession(workspaceId, sessionId) {
    if (!desktopClient) {
      return;
    }

    setSidebarError('');

    try {
      const nextState = await desktopClient.selectSession({ sessionId, workspaceId });
      setAppState(nextState);
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  function focusComposer() {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      const cursorPosition = textarea.value.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  function applySlashCommand(command) {
    if (!command) {
      return;
    }

    setInputValue(command.template);
    focusComposer();
  }

  async function updateCurrentSessionModel(nextModel, { clearInput = false } = {}) {
    if (!desktopClient || !selectedWorkspace || !selectedSession) {
      throw new Error(language === 'zh' ? '请先打开一个对话。' : 'Open a conversation first.');
    }

    setIsUpdatingModel(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.updateSessionModel({
        model: nextModel,
        sessionId: selectedSession.id,
        workspaceId: selectedWorkspace.id,
      });
      setAppState(nextState);

      if (clearInput) {
        setInputValue('');
      }
    } finally {
      setIsUpdatingModel(false);
    }
  }

  async function submitPrompt(prompt, { displayKind = '', displayPrompt, displayTitle = '' } = {}) {
    if (!desktopClient || appState.claude.busy) {
      return;
    }

    const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    if (!normalizedPrompt) {
      return;
    }

    if (!selectedSession || !selectedWorkspace) {
      setSidebarError(
        language === 'zh'
          ? '请先创建或选择一个会话，或输入 /clear。'
          : 'Create or select a session first, or type /clear.',
      );
      return;
    }

    setIsSending(true);
    setSidebarError('');
    setInputValue('');

    try {
      await desktopClient.sendMessage({
        displayKind,
        displayPrompt,
        displayTitle,
        prompt: normalizedPrompt,
        sessionId: selectedSession.id,
        workspaceId: selectedWorkspace.id,
      });
    } catch (error) {
      setIsSending(false);
      setInputValue(displayPrompt || normalizedPrompt);
      setSidebarError(error.message);
    }
  }

  async function runSlashCommand(rawInput) {
    const parsedCommand = parseSlashCommand(rawInput);
    if (!parsedCommand) {
      return false;
    }

    const commandName = resolveSlashCommandName(parsedCommand.name);
    const installedSkill = findInstalledSkillCommand(parsedCommand.name, installedSkills);
    if (!commandName && !installedSkill) {
      setSidebarError(formatUnknownSlashCommand(parsedCommand.name, language));
      return true;
    }

    setSidebarError('');

    try {
      if (commandName === 'help') {
        setInputValue('/');
        focusComposer();
        return true;
      }

      if (commandName === 'clear') {
        if (!selectedWorkspace) {
          throw new Error(language === 'zh' ? '请先选择一个工作目录。' : 'Select a workspace first.');
        }

        await createSession(selectedWorkspace.id);
        setInputValue('');
        return true;
      }

      if (commandName === 'theme') {
        const nextTheme = normalizeThemeCommandArg(parsedCommand.args);
        if (!nextTheme) {
          throw new Error(
            language === 'zh'
              ? '请使用 /theme light、/theme dark 或 /theme system。'
              : 'Use /theme light, /theme dark, or /theme system.',
          );
        }

        setThemePreference(nextTheme);
        setInputValue('');
        return true;
      }

      if (commandName === 'model') {
        if (!parsedCommand.args) {
          throw new Error(
            language === 'zh'
              ? '请使用 /model <模型名>，或 /model default 恢复默认模型。'
              : 'Use /model <name>, or /model default to restore the default model.',
          );
        }

        await updateCurrentSessionModel(normalizeModelCommandArg(parsedCommand.args), { clearInput: true });
        return true;
      }

      if (commandName === 'mcp') {
        if (!selectedWorkspace || !selectedSession) {
          throw new Error(language === 'zh' ? '请先创建或选择一个对话。' : 'Create or select a conversation first.');
        }

        if (!parsedCommand.args) {
          throw new Error(language === 'zh' ? '请使用 /mcp list、/mcp get <name>、/mcp add ... 或 /mcp remove <name>。' : 'Use /mcp list, /mcp get <name>, /mcp add ..., or /mcp remove <name>.');
        }

        const nextState = await desktopClient.runMcpCommand({
          args: parsedCommand.args,
          sessionId: selectedSession.id,
          workspaceId: selectedWorkspace.id,
        });
        setAppState(nextState);
        setInputValue('');
        return true;
      }

      if (commandName === 'skills') {
        if (!selectedWorkspace || !selectedSession) {
          throw new Error(language === 'zh' ? '请先创建或选择一个对话。' : 'Create or select a conversation first.');
        }

        const tokens = tokenizeSlashArgs(parsedCommand.args);
        const action = (tokens[0] || 'list').toLowerCase();

        if (action === 'list') {
          const nextState = await desktopClient.listSkills({
            sessionId: selectedSession.id,
            workspaceId: selectedWorkspace.id,
          });
          setAppState(nextState);
          setInputValue('');
          return true;
        }

        if (action === 'install') {
          const installArgs = parsedCommand.args.slice(parsedCommand.args.toLowerCase().indexOf('install') + 'install'.length).trim();
          if (!installArgs) {
            throw new Error(language === 'zh' ? '请使用 /skills install <path> [--scope user|project]。' : 'Use /skills install <path> [--scope user|project].');
          }

          const nextState = await desktopClient.installSkill({
            args: installArgs,
            sessionId: selectedSession.id,
            workspaceId: selectedWorkspace.id,
          });
          setAppState(nextState);
          setInputValue('');
          return true;
        }

        throw new Error(language === 'zh' ? '当前只支持 /skills list 和 /skills install <path> [--scope user|project]。' : 'Currently supported: /skills list and /skills install <path> [--scope user|project].');
      }

      if (installedSkill) {
        await submitPrompt(
          buildSkillInvocationPrompt(installedSkill, parsedCommand.args, language),
          {
            displayKind: 'command',
            displayPrompt: rawInput.trim(),
            displayTitle: rawInput.trim(),
          },
        );
        return true;
      }
    } catch (error) {
      setSidebarError(error.message);
      return true;
    }

    return false;
  }

  async function sendMessage() {
    const prompt = inputValue.trim();
    if (!prompt) {
      return;
    }

    if (prompt.startsWith('/')) {
      const commandHandled = await runSlashCommand(prompt);
      if (commandHandled) {
        return;
      }
    }

    await submitPrompt(prompt);
  }

  async function stopRun() {
    if (!desktopClient || !appState.claude.busy) {
      return;
    }

    try {
      const nextState = await desktopClient.stopRun();
      setAppState(nextState);
      setIsSending(false);
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  async function confirmArchiveSession() {
    if (!desktopClient || !pendingArchiveSession || isArchivingSession) {
      return;
    }

    setIsArchivingSession(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.archiveSession({
        sessionId: pendingArchiveSession.sessionId,
        workspaceId: pendingArchiveSession.workspaceId,
      });
      setAppState(nextState);
      setPendingArchiveSession(null);
    } catch (error) {
      setSidebarError(error.message);
    } finally {
      setIsArchivingSession(false);
    }
  }

  async function confirmRemoveWorkspace() {
    if (!desktopClient || !pendingRemoveWorkspace || isRemovingWorkspace) {
      return;
    }

    setIsRemovingWorkspace(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.removeWorkspace(pendingRemoveWorkspace.workspaceId);
      setAppState(nextState);
      setPendingRemoveWorkspace(null);
    } catch (error) {
      setSidebarError(error.message);
    } finally {
      setIsRemovingWorkspace(false);
    }
  }

  function toggleWorkspaceExpansion(workspaceId) {
    let nextExpandedWorkspaceIds = [];

    setExpandedWorkspaceIds((current) => {
      nextExpandedWorkspaceIds = current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId];

      return nextExpandedWorkspaceIds;
    });

    if (!desktopClient) {
      return;
    }

    desktopClient.setExpandedWorkspaces(nextExpandedWorkspaceIds)
      .then((nextState) => {
        setAppState(nextState);
      })
      .catch((error) => {
        setSidebarError(error.message);
      });
  }

  const trimmedInputValue = inputValue.trim();
  const canSend = Boolean(
    desktopClient
    && selectedWorkspace
    && !appState.claude.busy
    && trimmedInputValue
    && (selectedSession || trimmedInputValue.startsWith('/')),
  );

  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--card)/0.88)_0%,transparent_18%,transparent_82%,hsl(var(--background)/0.96)_100%)]" />

      <div
        className={cn(
          'drag-region fixed inset-x-0 top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur',
          topBarHeightClass,
        )}
      >
        <div
          className={cn(
            'flex h-full w-full items-center gap-2 px-3 text-[10px] sm:px-4',
            isMac && 'pl-24 sm:pl-28',
          )}
        >
          <div className="flex items-center gap-2">
            <StatusPill
              tone={appState.claude.available ? 'success' : 'error'}
              label={formatClaudeStatusLabel(appState.claude, language)}
            />
            <div className="no-drag flex items-center gap-2">
              <TopbarSelect
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                ariaLabel={copy.languageLabel}
              >
                <option value="zh">{copy.languageChinese}</option>
                <option value="en">{copy.languageEnglish}</option>
              </TopbarSelect>
              <TopbarSelect
                value={themePreference}
                onChange={(event) => setThemePreference(event.target.value)}
                ariaLabel={copy.themeLabel}
              >
                <option value="system">{copy.themeSystem}</option>
                <option value="light">{copy.themeLight}</option>
                <option value="dark">{copy.themeDark}</option>
              </TopbarSelect>
            </div>
          </div>
        </div>
      </div>

      <main
        className={cn(
          'relative flex h-full w-full overflow-hidden',
          topBarOffsetClass,
        )}
      >
        <aside className="flex w-[360px] min-w-[360px] shrink-0 flex-col overflow-hidden border-r border-border/70 bg-background/60">
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
            <div className="space-y-5 pr-2">
                {sidebarError && (
                  <div
                    className={cn(
                      'rounded-xl border px-3 py-2 text-[13px] leading-5',
                      'border-destructive/25 bg-destructive/10 text-destructive',
                    )}
                  >
                    {sidebarError}
                  </div>
                )}

                <SidebarSection
                  title={copy.workspaceSection}
                  action={(
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={addWorkspace}
                      disabled={!desktopClient || isPickingWorkspace || appState.claude.busy}
                      aria-label={copy.addWorkspace}
                      title={copy.addWorkspace}
                      className="h-7 w-7 shrink-0 rounded-md bg-transparent p-0 text-foreground shadow-none hover:bg-background/80"
                    >
                      {isPickingWorkspace ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                    </Button>
                  )}
                >
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={sessionSearchQuery}
                      onChange={(event) => setSessionSearchQuery(event.target.value)}
                      placeholder={copy.searchPlaceholder}
                      className="h-8 rounded-xl border-border/80 bg-background/80 pl-8 pr-3 text-[12px] shadow-none placeholder:text-muted-foreground/90"
                    />
                  </div>

                  {appState.workspaces.length === 0 ? (
                    <SidebarEmpty text={copy.emptyWorkspaces} />
                  ) : filteredWorkspaces.length === 0 ? (
                    <SidebarEmpty text={copy.searchNoResult(sessionSearchQuery.trim())} />
                  ) : (
                    filteredWorkspaces.map((workspace) => (
                      <WorkspaceItem
                        copy={copy}
                        key={workspace.id}
                        disabled={appState.claude.busy}
                        isExpanded={normalizedSessionSearchQuery ? true : expandedWorkspaceIds.includes(workspace.id)}
                        onArchiveSession={(session) => setPendingArchiveSession({
                          sessionId: session.id,
                          title: session.title,
                          workspaceId: workspace.id,
                        })}
                        onCreateSession={() => createSession(workspace.id)}
                        onRemoveWorkspace={() => setPendingRemoveWorkspace({
                          title: workspace.name,
                          workspaceId: workspace.id,
                        })}
                        onSelectSession={(sessionId) => selectSession(workspace.id, sessionId)}
                        onSelectWorkspace={() => selectWorkspace(workspace.id)}
                        onToggleExpand={() => toggleWorkspaceExpansion(workspace.id)}
                        selectedSessionId={appState.selectedSessionId}
                        language={language}
                        workspace={workspace}
                      />
                    ))
                  )}
                </SidebarSection>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background/35">
          <div className="border-b border-border/70 px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate pr-3 text-[12px] font-medium text-foreground">
                {selectedSession?.title || (selectedWorkspace ? copy.noConversationOpen : copy.noWorkspaceSelected)}
              </p>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {selectedWorkspace && (
                  <Badge variant="outline" className="h-6 bg-background/80 px-2 text-[10px] text-foreground">
                    {selectedWorkspace.name}
                  </Badge>
                )}
                {selectedSession && (
                  <Badge variant="outline" className="h-6 bg-background/80 px-2 text-[10px] text-foreground">
                    {currentModelDisplay}
                  </Badge>
                )}
                {selectedSession?.claudeSessionId && (
                  <Badge variant="outline" className="h-6 px-2 text-[10px]">
                    {truncateMiddle(selectedSession.claudeSessionId, 18)}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {!selectedWorkspace ? (
              <ConversationEmptyState
                icon={Folder}
                title={copy.startByAddingWorkspace}
                description={copy.startByAddingWorkspaceDescription}
              />
            ) : !selectedSession ? (
              <ConversationEmptyState
                icon={MessageSquarePlus}
                title={copy.createConversationForWorkspace}
                description={copy.workspaceSelectedDescription}
              />
            ) : (
              <ScrollArea viewportRef={messageViewportRef} className="h-full px-4 md:px-5">
                <div className="mx-auto flex w-full max-w-[780px] flex-col gap-3 py-4">
                    {renderableMessages.length === 0 ? (
                      <ConversationEmptyState
                        icon={Bot}
                        title={copy.conversationEmpty}
                      />
                    ) : (
                    <>
                      {renderableMessages.map((message) => <ChatMessage key={message.id} language={language} message={message} />)}
                      {shouldShowRunIndicator && <RunIndicator language={language} />}
                    </>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="p-3">
            <div className="mx-auto w-full max-w-[780px]">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (isSlashCommandMenuOpen && visibleSlashCommands.length > 0) {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setSelectedSlashCommandIndex((current) => (
                          current >= visibleSlashCommands.length - 1 ? 0 : current + 1
                        ));
                        return;
                      }

                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setSelectedSlashCommandIndex((current) => (
                          current <= 0 ? visibleSlashCommands.length - 1 : current - 1
                        ));
                        return;
                      }

                      if (event.key === 'Tab') {
                        event.preventDefault();
                        applySlashCommand(highlightedSlashCommand);
                        return;
                      }

                      if (event.key === 'Enter' && !event.shiftKey && !resolveSlashCommandName(slashCommandQuery)) {
                        event.preventDefault();
                        applySlashCommand(highlightedSlashCommand);
                        return;
                      }
                    }

                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={
                    selectedWorkspace
                      ? (selectedSession ? copy.inputPlaceholder : copy.noSessionCommandHint)
                      : copy.noSessionsYet
                  }
                  className="min-h-[96px] resize-none pb-14 pl-3 pr-14"
                  disabled={!selectedWorkspace || !desktopClient || appState.claude.busy || isBootstrapping}
                />
                <ComposerModelPicker
                  ariaLabel={copy.modelLabel}
                  buttonValue={currentModelCommandValue}
                  currentLabel={currentModelDisplay}
                  disabled={!selectedSession || !desktopClient || appState.claude.busy || isBootstrapping || isUpdatingModel}
                  isOpen={isModelPickerOpen}
                  menuDescription={copy.modelMenuDescription}
                  menuHint={copy.modelMenuHint}
                  menuTitle={copy.modelMenuTitle}
                  options={modelOptions}
                  pickerRef={modelPickerRef}
                  selectedValue={selectedSession?.model || ''}
                  onOpenChange={setIsModelPickerOpen}
                  onSelect={async (nextModel) => {
                    if (nextModel === (selectedSession?.model || '')) {
                      setIsModelPickerOpen(false);
                      return;
                    }

                    try {
                      await updateCurrentSessionModel(nextModel);
                      setIsModelPickerOpen(false);
                    } catch (error) {
                      setSidebarError(error.message);
                    }
                  }}
                />
                {isSlashCommandMenuOpen && (
                  <SlashCommandMenu
                    commands={visibleSlashCommands}
                    emptyLabel={language === 'zh' ? '没有匹配的指令' : 'No matching commands'}
                    highlightedCommandName={highlightedSlashCommand?.name || ''}
                    language={language}
                    menuRef={slashCommandMenuRef}
                    onSelectCommand={applySlashCommand}
                  />
                )}
                <Button
                  onClick={appState.claude.busy ? stopRun : sendMessage}
                  disabled={appState.claude.busy ? false : !canSend}
                  size="icon"
                  aria-label={appState.claude.busy ? copy.runStop : (isSending ? copy.sending : copy.sendMessage)}
                  className="absolute bottom-3 right-3 h-8 w-8 rounded-full shadow-sm"
                >
                  {appState.claude.busy ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : isSending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {pendingArchiveSession && (
        <ConfirmActionDialog
          cancelLabel={copy.cancel}
          confirmLabel={isArchivingSession ? copy.archiveConversationConfirming : copy.archiveConversationConfirm}
          description={copy.archiveConversationDescription}
          isPending={isArchivingSession}
          itemLabel={pendingArchiveSession.title}
          title={copy.archiveConversationTitle}
          onCancel={() => {
            if (!isArchivingSession) {
              setPendingArchiveSession(null);
            }
          }}
          onConfirm={confirmArchiveSession}
        />
      )}

      {pendingRemoveWorkspace && (
        <ConfirmActionDialog
          cancelLabel={copy.cancel}
          confirmLabel={isRemovingWorkspace ? copy.removeWorkspaceConfirming : copy.removeWorkspaceConfirm}
          description={copy.removeWorkspaceDescription}
          isPending={isRemovingWorkspace}
          itemLabel={pendingRemoveWorkspace.title}
          title={copy.removeWorkspaceTitle}
          onCancel={() => {
            if (!isRemovingWorkspace) {
              setPendingRemoveWorkspace(null);
            }
          }}
          onConfirm={confirmRemoveWorkspace}
        />
      )}
    </div>
  );
}

function SidebarSection({ action, title, children }) {
  return (
    <section className="space-y-2.5">
      <div className="relative pr-12">
        <p className="min-w-0 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <div className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center">
          {action}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SidebarEmpty({ text }) {
  return <div className="rounded-xl border border-dashed border-border/80 bg-background/70 px-3 py-3 text-[13px] leading-5 text-muted-foreground">{text}</div>;
}

function TopbarSelect({ ariaLabel, children, onChange, value }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
        className="h-7 appearance-none rounded border border-border/70 bg-background/70 py-0 pl-2 pr-8 text-[11px] text-foreground outline-none transition-colors hover:bg-background focus:ring-1 focus:ring-ring/20"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function ComposerModelPicker({
  ariaLabel,
  buttonValue,
  currentLabel,
  disabled,
  isOpen,
  menuDescription,
  menuHint,
  menuTitle,
  onOpenChange,
  onSelect,
  options,
  pickerRef,
  selectedValue,
}) {
  return (
    <div ref={pickerRef} className="absolute bottom-3 left-3 z-10">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => onOpenChange(!isOpen)}
        className="flex h-8 max-w-[240px] items-center gap-2 rounded-lg border border-border/80 bg-background/92 px-3 text-left text-[12px] text-foreground shadow-sm outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{currentLabel}</span>
        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{buttonValue}</code>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-[min(560px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-border/80 bg-background/96 shadow-xl backdrop-blur">
          <div className="border-b border-border/70 px-3 py-3">
            <p className="text-[13px] font-semibold text-foreground">{menuTitle}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{menuDescription}</p>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {options.map((option) => {
              const isSelected = option.value === selectedValue;

              return (
                <button
                  key={option.value || '__default'}
                  type="button"
                  onClick={() => onSelect(option.value)}
                  className={cn(
                    'w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                    isSelected && 'bg-muted/80',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">{option.label}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{option.commandValue}</code>
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{option.summary}</p>
                    </div>
                    {isSelected && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border-t border-border/70 px-3 py-2 text-[10px] text-muted-foreground">{menuHint}</div>
        </div>
      )}
    </div>
  );
}

function SlashCommandMenu({
  commands,
  emptyLabel,
  highlightedCommandName,
  language,
  menuRef,
  onSelectCommand,
}) {
  return (
    <div ref={menuRef} className="absolute inset-x-0 bottom-[calc(100%+10px)] z-20 overflow-hidden rounded-2xl border border-border/80 bg-background/96 shadow-xl backdrop-blur">
      <div className="border-b border-border/70 px-3 py-2 text-[11px] font-medium text-muted-foreground">
        {language === 'zh' ? 'Slash 指令' : 'Slash commands'}
      </div>
      {commands.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="max-h-64 overflow-y-auto py-1.5">
          {commands.map((command) => {
            const isHighlighted = command.name === highlightedCommandName;

            return (
              <button
                key={command.name}
                type="button"
                data-slash-command-highlighted={isHighlighted ? 'true' : 'false'}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelectCommand(command)}
                className={cn(
                  'flex w-full items-start gap-3 px-3 py-2 text-left transition-colors',
                  isHighlighted ? 'bg-accent/70 text-accent-foreground' : 'hover:bg-accent/40',
                )}
              >
                <code className="mt-0.5 min-w-[88px] rounded bg-background/80 px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
                  /{command.name}
                </code>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium leading-5 text-foreground">{command.description}</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">{command.detail}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkspaceItem({
  copy,
  disabled,
  isExpanded,
  language,
  onArchiveSession,
  onCreateSession,
  onRemoveWorkspace,
  onSelectSession,
  onSelectWorkspace,
  onToggleExpand,
  selectedSessionId,
  workspace,
}) {
  const FolderIcon = isExpanded ? FolderOpen : Folder;

  return (
    <div title={workspace.path} className="py-0.5">
      <div className="group relative pr-20">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform,box-shadow] hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-95 active:bg-background"
            disabled={disabled}
            aria-label={isExpanded ? copy.collapseWorkspace : copy.expandWorkspace}
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectWorkspace();
              if (!isExpanded) {
                onToggleExpand();
              }
            }}
            className="min-w-0 flex-1 rounded-md px-1 py-1 text-left transition-[background-color,color,transform,box-shadow] hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:translate-y-px active:bg-background"
            disabled={disabled}
            title={workspace.path}
          >
            <div className="flex items-center gap-2">
              <FolderIcon className={cn('h-3.5 w-3.5 shrink-0', workspace.exists ? 'text-primary' : 'text-destructive')} />
              <p className="truncate text-[12px] font-medium text-foreground">{workspace.name}</p>
            </div>
          </button>
        </div>
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateSession}
            disabled={disabled}
            className="pointer-events-none h-7 w-7 shrink-0 rounded-none border-0 bg-transparent p-0 text-muted-foreground opacity-0 shadow-none transition-[opacity,color,transform] duration-150 group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-transparent hover:text-foreground focus-visible:opacity-100"
            title={copy.createConversationInWorkspace(workspace.path)}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemoveWorkspace}
            disabled={disabled}
            className="pointer-events-none h-7 w-7 shrink-0 rounded-none border-0 bg-transparent p-0 text-muted-foreground opacity-0 shadow-none transition-[opacity,color,transform] duration-150 group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-transparent hover:text-destructive focus-visible:opacity-100"
            title={copy.removeWorkspaceWithPath(workspace.path)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-1.5 ml-5 border-l border-border/70 pl-2">
          {workspace.sessions.length === 0 ? (
            <p className="py-1.5 text-[11px] text-muted-foreground">{copy.noConversationsInWorkspace}</p>
          ) : (
            <div className="divide-y divide-border/60">
              {workspace.sessions.map((session) => (
                <SessionItem
                  copy={copy}
                  disabled={disabled}
                  language={language}
                  onArchive={() => onArchiveSession(session)}
                  key={session.id}
                  session={session}
                  isSelected={session.id === selectedSessionId}
                  onSelect={() => onSelectSession(session.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SessionItem({ copy, disabled, isSelected, language, onArchive, onSelect, session }) {
  const showRunningDot = isSelected && session.isRunning;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className="w-full overflow-hidden px-3 py-2.5 text-left transition-[background-color,color,transform,box-shadow] hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35 active:translate-y-px active:bg-background"
      >
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {showRunningDot && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />}
            <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">{session.title}</p>
          </div>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden="true" />
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground/90">{session.preview}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/90">
          <span>{formatDateTime(session.updatedAt, language)}</span>
          {session.claudeSessionId && <span>{truncateMiddle(session.claudeSessionId, 14)}</span>}
        </div>
      </button>
      <div className="absolute right-3 top-[10px] flex h-7 w-7 items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={onArchive}
          disabled={disabled || session.isRunning}
          className="pointer-events-none h-7 w-7 rounded-none border-0 bg-transparent p-0 text-muted-foreground opacity-0 shadow-none transition-[opacity,color,transform] duration-150 group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-transparent hover:text-foreground focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-30"
          title={session.isRunning ? copy.toolArchiveDisabled : copy.archiveConversation}
        >
          <Archive className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ConfirmActionDialog({ cancelLabel, confirmLabel, description, isPending, itemLabel, onCancel, onConfirm, title }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-background p-5 shadow-xl">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{description}</p>
        <div className="mt-3 rounded-xl bg-secondary/70 px-3 py-2 text-[12px] font-medium text-foreground">
          {itemLabel}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConversationEmptyState({ description, icon: Icon, title }) {
  return (
    <div className="flex h-full items-center justify-center px-5">
      <div className="max-w-sm rounded-2xl border border-dashed border-border/80 bg-background/70 px-5 py-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function ChatMessage({ language, message }) {
  if (message.role === 'event') {
    return <EventMessage language={language} message={message} />;
  }

  const isUser = message.role === 'user';

  if (!isUser) {
    return (
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 max-w-[min(100%,46rem)] flex-1 pt-0.5">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            Claude
          </div>
          {message.streaming && !message.content ? (
            <TypingIndicator />
          ) : (
            <div
              className={cn('markdown-body text-[13px] leading-6', message.error && 'text-destructive')}
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(message.content),
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-end gap-2.5">
      <div className="max-w-[min(100%,42rem)] rounded-2xl border border-primary/10 bg-primary px-2.5 py-2 text-primary-foreground shadow-sm">
        <div className="whitespace-pre-wrap text-[13px] leading-6">{message.content}</div>
      </div>
    </div>
  );
}

function EventMessage({ language, message }) {
  const copy = COPY[language];
  const meta = getEventMeta(message.kind, message.status);
  const Icon = meta.icon;
  const collapsible = isCollapsibleEvent(message);
  const [isOpen, setIsOpen] = useState(false);
  const preview = createEventPreview(message.content);

  if (message.kind === 'command') {
    return (
      <div className="flex justify-end py-0.5">
        <div className="max-w-[min(100%,42rem)] rounded-2xl border border-sky-500/20 bg-sky-500/8 px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-sky-700">
              <TerminalSquare className="h-3 w-3" />
              Slash
            </span>
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">{formatTime(message.createdAt, language)}</span>
          </div>
          <code className="mt-1.5 block whitespace-pre-wrap break-words text-[12px] leading-5 text-foreground">{message.title}</code>
          {message.content ? (
            collapsible ? (
              <>
                {preview && <p className="mt-1 line-clamp-1 break-words text-[12px] leading-5 text-muted-foreground">{preview}</p>}
                <button
                  type="button"
                  onClick={() => setIsOpen((current) => !current)}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
                  {isOpen ? copy.collapseDetails : copy.expandDetails}
                </button>
                {isOpen && (
                  <div className="mt-1.5 whitespace-pre-wrap break-words border-l border-border/80 pl-3 text-[12px] leading-5 text-muted-foreground">
                    {message.content}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-5 text-muted-foreground">{message.content}</p>
            )
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 py-0.5">
      <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md', meta.iconWrapperClassName)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[12px] font-medium text-muted-foreground">{message.title}</p>
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">{formatTime(message.createdAt, language)}</span>
        </div>
        {message.content && collapsible ? (
          <>
            {preview && <p className="mt-0.5 line-clamp-1 break-words text-[12px] leading-5 text-muted-foreground/90">{preview}</p>}
            <button
              type="button"
              onClick={() => setIsOpen((current) => !current)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
              {isOpen ? copy.collapseDetails : copy.expandDetails}
            </button>
            {isOpen && (
              <div className="mt-1.5 whitespace-pre-wrap break-words border-l border-border/80 pl-3 text-[12px] leading-5 text-muted-foreground">
                {message.content}
              </div>
            )}
          </>
        ) : message.content ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-muted-foreground">{message.content}</p>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ label, tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]',
        tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        tone === 'error' && 'border-destructive/25 bg-destructive/10 text-destructive',
        tone === 'running' && 'border-primary/20 bg-primary/10 text-foreground',
        tone === 'muted' && 'border-border/70 bg-background/80 text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          tone === 'success' && 'bg-emerald-500',
          tone === 'error' && 'bg-destructive',
          tone === 'running' && 'bg-primary',
          tone === 'muted' && 'bg-muted-foreground/60',
        )}
      />
      {label}
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/50 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/35 [animation-delay:300ms]" />
    </div>
  );
}

function RunIndicator() {
  return (
    <div className="flex items-start gap-2.5 py-0.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Bot className="h-4 w-4" />
      </div>
      <div className="pt-0.5">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          Claude
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/80 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:120ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  );
}

function getEventMeta(kind, status) {
  if (status === 'error' || kind === 'error') {
    return {
      icon: AlertTriangle,
      iconWrapperClassName: 'bg-destructive/10 text-destructive',
    };
  }

  if (kind === 'thinking') {
    return {
      icon: BrainCircuit,
      iconWrapperClassName: 'bg-primary/10 text-primary',
    };
  }

  if (kind === 'command') {
    return {
      icon: TerminalSquare,
      iconWrapperClassName: 'bg-sky-500/10 text-sky-700',
    };
  }

  if (kind === 'tool' || kind === 'tool_result') {
    return {
      icon: Wrench,
      iconWrapperClassName: 'bg-secondary text-secondary-foreground',
    };
  }

  if (kind === 'agent') {
    return {
      icon: Workflow,
      iconWrapperClassName: 'bg-accent text-accent-foreground',
    };
  }

  if (kind === 'skill') {
    return {
      icon: Sparkles,
      iconWrapperClassName: 'bg-accent text-accent-foreground',
    };
  }

  if (kind === 'mcp') {
    return {
      icon: Blocks,
      iconWrapperClassName: 'bg-secondary text-secondary-foreground',
    };
  }

  if (kind === 'response') {
    return {
      icon: CheckCircle2,
      iconWrapperClassName: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (kind === 'debug') {
    return {
      icon: TerminalSquare,
      iconWrapperClassName: 'bg-secondary text-secondary-foreground',
    };
  }

  if (kind === 'tool_group') {
    return {
      icon: PlugZap,
      iconWrapperClassName: 'bg-secondary text-secondary-foreground',
    };
  }

  return {
    icon: PlugZap,
    iconWrapperClassName: 'bg-secondary text-secondary-foreground',
  };
}

function isCollapsibleEvent(message) {
  return ['agent', 'command', 'debug', 'mcp', 'skill', 'tool', 'tool_group', 'tool_result'].includes(message.kind);
}

function createEventPreview(content) {
  if (!content) {
    return '';
  }

  return content.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function mergeRenderableMessages(messages, language) {
  const merged = [];
  let toolEventBuffer = [];

  const flushToolEventBuffer = () => {
    if (toolEventBuffer.length === 0) {
      return;
    }

    if (toolEventBuffer.length === 1) {
      merged.push(toolEventBuffer[0]);
    } else {
      merged.push(createToolEventGroup(toolEventBuffer, language));
    }

    toolEventBuffer = [];
  };

  for (const message of messages) {
    if (isMergeableToolEvent(message)) {
      toolEventBuffer.push(message);
      continue;
    }

    flushToolEventBuffer();
    merged.push(message);
  }

  flushToolEventBuffer();
  return merged;
}

function isMergeableToolEvent(message) {
  return message?.role === 'event' && ['mcp', 'skill', 'tool', 'tool_result'].includes(message.kind);
}

function createToolEventGroup(messages, language) {
  const copy = COPY[language];
  const errorCount = messages.filter((message) => message.status === 'error').length;
  const runningCount = messages.filter((message) => message.status === 'running').length;
  const completedCount = messages.filter((message) => message.status === 'completed').length;
  const status = errorCount > 0 ? 'error' : (runningCount > 0 ? 'running' : 'completed');
  const summary = [
    copy.toolGroupSummary(messages.length),
    runningCount > 0 ? copy.toolGroupRunning(runningCount) : null,
    completedCount > 0 ? copy.toolGroupCompleted(completedCount) : null,
    errorCount > 0 ? copy.toolGroupFailed(errorCount) : null,
  ].filter(Boolean).join(' · ');
  const details = messages.map((message) => formatToolEventGroupItem(message, language)).join('\n\n');

  return {
    id: `tool-group-${messages[0].id}`,
    role: 'event',
    kind: 'tool_group',
    status,
    title: copy.toolGroupTitle,
    content: `${summary}\n\n${details}`,
    createdAt: messages[messages.length - 1].createdAt,
  };
}

function formatToolEventGroupItem(message, language) {
  const lines = [`[${formatTime(message.createdAt, language)}] ${message.title}`];

  if (message.content) {
    lines.push(message.content);
  }

  return lines.join('\n');
}

function matchesSessionSearch(session, query) {
  const haystacks = [
    session.title,
    session.preview,
    session.claudeSessionId,
  ];

  return haystacks.some((value) => value?.toLowerCase().includes(query));
}

function getSlashCommands(language, installedSkills = []) {
  const isChinese = language === 'zh';
  const builtinCommands = [
    {
      aliases: [],
      description: isChinese ? '清空并新开对话' : 'Clear and start fresh',
      detail: isChinese ? '迁移自 Claude Code 的 /clear，会在当前工作目录下新建一个会话' : 'Migrated from Claude Code /clear and starts a new session in the current workspace',
      name: 'clear',
      template: '/clear',
    },
    {
      aliases: [],
      description: isChinese ? '设置当前会话模型' : 'Set the current model',
      detail: isChinese ? '迁移自 Claude Code 的 /model，例如 /model sonnet、/model opus、/model haiku，或直接填写完整模型名' : 'Migrated from Claude Code /model. Example: /model sonnet, /model opus, /model haiku, or a full model name',
      name: 'model',
      template: '/model ',
    },
    {
      aliases: [],
      description: isChinese ? '切换客户端主题' : 'Change the client theme',
      detail: isChinese ? '迁移自 Claude Code 的 /theme，可用值：light、dark、system' : 'Migrated from Claude Code /theme. Values: light, dark, system',
      name: 'theme',
      template: '/theme ',
    },
    {
      aliases: [],
      description: isChinese ? '管理 MCP 服务' : 'Manage MCP servers',
      detail: isChinese ? '透传到本机 Claude Code，例如 /mcp list、/mcp add ...、/mcp get <name>' : 'Runs local Claude Code MCP commands such as /mcp list, /mcp add ..., or /mcp get <name>',
      name: 'mcp',
      template: '/mcp ',
    },
    {
      aliases: ['skill'],
      description: isChinese ? '查看或安装本地 skills' : 'List or install local skills',
      detail: isChinese ? '支持 /skills list 和 /skills install <path> [--scope user|project]' : 'Supports /skills list and /skills install <path> [--scope user|project]',
      name: 'skills',
      template: '/skills ',
    },
    {
      aliases: ['?'],
      description: isChinese ? '查看可用命令' : 'Show available commands',
      detail: isChinese ? '打开当前客户端支持的 Claude Code 风格命令列表' : 'Open the Claude Code-style commands supported in this client',
      name: 'help',
      template: '/',
    },
  ];
  const builtinNames = new Set(builtinCommands.map((command) => command.name));
  const skillCommands = installedSkills
    .map((skill) => createInstalledSkillCommand(skill, language))
    .filter(Boolean)
    .filter((command) => !builtinNames.has(command.name));

  return [
    ...builtinCommands.slice(0, 5),
    ...skillCommands,
    builtinCommands[5],
  ];
}

function getComposerModelOptions(copy, selectedModel, currentModel, availableClaudeModels = []) {
  const defaultCurrentLabel = !selectedModel ? getModelDisplayName(currentModel, availableClaudeModels) : '';
  const defaultOption = {
    commandValue: 'default',
    label: copy.modelOptionDefault,
    summary: copy.modelSummaryDefault(defaultCurrentLabel),
    value: '',
  };

  const dynamicPresets = availableClaudeModels
    .filter((model) => model && typeof model.value === 'string' && model.value)
    .map((model) => ({
      commandValue: model.value,
      label: model.label || getModelDisplayName(model.value, availableClaudeModels) || model.value,
      summary: model.summary || model.description || '',
      value: model.value,
    }));

  const fallbackPresets = [
    {
      commandValue: 'opus',
      label: copy.modelOptionOpus,
      summary: copy.modelSummaryOpus,
      value: 'opus',
    },
    {
      commandValue: 'opus[1m]',
      label: copy.modelOptionOpusLong,
      summary: copy.modelSummaryOpusLong,
      value: 'opus[1m]',
    },
    {
      commandValue: 'haiku',
      label: copy.modelOptionHaiku,
      summary: copy.modelSummaryHaiku,
      value: 'haiku',
    },
    {
      commandValue: 'sonnet',
      label: copy.modelOptionSonnet,
      summary: copy.modelSummarySonnet,
      value: 'sonnet',
    },
  ];

  const presets = [defaultOption, ...(dynamicPresets.length > 0 ? dynamicPresets : fallbackPresets)];

  if (!selectedModel || presets.some((option) => option.value === selectedModel)) {
    return presets;
  }

  return [
    ...presets,
    {
      commandValue: selectedModel,
      label: getModelDisplayName(selectedModel, availableClaudeModels) || copy.modelOptionCustom,
      summary: copy.modelSummaryCustom(getModelDisplayName(currentModel || selectedModel, availableClaudeModels) || selectedModel),
      value: selectedModel,
    },
  ];
}

function getModelDisplayName(value, availableClaudeModels = []) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const matchedModel = availableClaudeModels.find((model) => (
    typeof model?.value === 'string'
    && model.value.trim().toLowerCase() === normalized
    && typeof model.label === 'string'
    && model.label.trim()
  ));
  if (matchedModel) {
    return matchedModel.label.trim();
  }

  if (normalized === 'opus[1m]' || normalized.includes('claude-opus-4-6[1m]')) {
    return 'Opus 4.6 (1M context)';
  }

  if (normalized === 'opus' || normalized.includes('claude-opus-4-6')) {
    return 'Opus 4.6';
  }

  if (normalized === 'sonnet[1m]' || normalized.includes('claude-sonnet-4-5[1m]')) {
    return 'Sonnet 4.5 (1M context)';
  }

  if (normalized === 'sonnet' || normalized.includes('claude-sonnet-4-5')) {
    return 'Sonnet 4.5';
  }

  if (normalized === 'haiku' || normalized.includes('claude-haiku-4-5')) {
    return 'Haiku 4.5';
  }

  return value.trim();
}

function getSlashCommandQuery(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trimStart();
  if (!normalized.startsWith('/')) {
    return null;
  }

  const firstLine = normalized.split('\n')[0] || '';
  const commandPart = firstLine.slice(1);
  if (/\s/.test(commandPart)) {
    return null;
  }

  return commandPart.toLowerCase();
}

function filterSlashCommands(commands, query) {
  if (query === null) {
    return [];
  }

  if (!query) {
    return commands;
  }

  return commands.filter((command) => {
    const candidates = [command.name, ...(command.aliases || [])];
    return candidates.some((candidate) => candidate.toLowerCase().startsWith(query));
  });
}

function parseSlashCommand(rawInput) {
  if (typeof rawInput !== 'string') {
    return null;
  }

  const trimmed = rawInput.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const withoutSlash = trimmed.slice(1);
  const firstWhitespaceIndex = withoutSlash.search(/\s/);

  if (firstWhitespaceIndex === -1) {
    return {
      args: '',
      name: withoutSlash.toLowerCase(),
    };
  }

  return {
    args: withoutSlash.slice(firstWhitespaceIndex).trim(),
    name: withoutSlash.slice(0, firstWhitespaceIndex).toLowerCase(),
  };
}

function tokenizeSlashArgs(rawArgs) {
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

function resolveSlashCommandName(name) {
  const normalized = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!normalized) {
    return '';
  }

  if (normalized === '?' || normalized === 'help') {
    return 'help';
  }

  if (normalized === 'clear') {
    return 'clear';
  }

  if (normalized === 'model') {
    return 'model';
  }

  if (normalized === 'mcp') {
    return 'mcp';
  }

  if (normalized === 'skill' || normalized === 'skills') {
    return 'skills';
  }

  if (normalized === 'theme') {
    return 'theme';
  }

  return '';
}

function formatUnknownSlashCommand(name, language) {
  return language === 'zh'
    ? `当前客户端只支持本地可执行的内置命令，以及已安装 skill 对应的 slash 指令；/${name} 暂不提供。`
    : `This client supports locally executable built-in commands and slash commands generated from installed skills. /${name} is not available here.`;
}

function createInstalledSkillCommand(skill, language) {
  const commandName = normalizeSkillCommandName(skill?.commandName || skill?.name);
  if (!commandName) {
    return null;
  }

  const scopeLabel = skill?.scope === 'project'
    ? (language === 'zh' ? '项目 skill' : 'Project skill')
    : (language === 'zh' ? '用户 skill' : 'User skill');
  const summary = typeof skill?.description === 'string' ? skill.description.trim() : '';

  return {
    aliases: [],
    description: language === 'zh' ? '运行已安装的 skill' : 'Run an installed skill',
    detail: summary
      ? `${scopeLabel} · ${summary}`
      : `${scopeLabel} · ${skill?.path || commandName}`,
    name: commandName,
    template: `/${commandName} `,
  };
}

function findInstalledSkillCommand(name, installedSkills = []) {
  const normalized = normalizeSkillCommandName(name);
  if (!normalized) {
    return null;
  }

  return installedSkills.find((skill) => (
    normalizeSkillCommandName(skill?.commandName || skill?.name) === normalized
  )) || null;
}

function normalizeSkillCommandName(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/^\/+/, '').toLowerCase();
}

function buildSkillInvocationPrompt(skill, rawArgs, language) {
  const skillName = skill?.name || skill?.commandName || 'skill';
  const skillPath = skill?.path || '';
  const skillDescription = typeof skill?.description === 'string' ? skill.description.trim() : '';
  const userRequest = typeof rawArgs === 'string' ? rawArgs.trim() : '';

  if (language === 'zh') {
    return [
      `请使用已安装的 Claude Code skill "${skillName}" 来处理这次请求。`,
      skillDescription ? `Skill 说明：${skillDescription}` : '',
      skillPath ? `Skill 路径：${skillPath}` : '',
      '',
      userRequest ? `用户请求：\n${userRequest}` : '如果这个 skill 需要额外信息，请先根据它的说明继续处理或主动追问。',
    ].filter(Boolean).join('\n');
  }

  return [
    `Please use the installed Claude Code skill "${skillName}" for this request.`,
    skillDescription ? `Skill description: ${skillDescription}` : '',
    skillPath ? `Skill path: ${skillPath}` : '',
    '',
    userRequest ? `User request:\n${userRequest}` : 'If this skill needs more detail, proceed with its default workflow and ask follow-up questions when necessary.',
  ].filter(Boolean).join('\n');
}

function normalizeThemeCommandArg(value) {
  const normalized = value.trim().toLowerCase();
  return ['light', 'dark', 'system'].includes(normalized) ? normalized : '';
}

function normalizeModelCommandArg(value) {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  return ['clear', 'default', 'reset'].includes(normalized.toLowerCase()) ? '' : normalized;
}

function getInitialThemePreference() {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return 'system';
}

function getSystemTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return 'zh';
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (storedLanguage === 'zh' || storedLanguage === 'en') {
    return storedLanguage;
  }

  return window.navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function formatClaudeStatusLabel(claude, language) {
  const copy = COPY[language];
  const version = normalizeClaudeVersion(claude?.version);

  if (claude?.available) {
    return version ? `${copy.claudeCode} · ${version}` : copy.claudeCode;
  }

  return version ? `${copy.claudeCodeUnavailable} · ${version}` : copy.claudeCodeUnavailable;
}

function normalizeClaudeVersion(value) {
  if (!value) {
    return '';
  }

  return value
    .replace(/\(Claude Code\)/gi, '')
    .replace(/^Claude Code\s*/i, '')
    .trim();
}

function shouldRenderRunIndicator(session, isSending) {
  if (!session) {
    return false;
  }

  if (!isSending && session.status !== 'running') {
    return false;
  }

  const lastUserIndex = findLastMessageIndex(session.messages, 'user');
  if (lastUserIndex === -1) {
    return isSending;
  }

  return !session.messages.some((message, index) => index > lastUserIndex && message.role === 'assistant');
}

function findLastMessageIndex(messages, role) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === role) {
      return index;
    }
  }

  return -1;
}

function formatDateTime(value, language) {
  return new Date(value).toLocaleString(getIntlLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatTime(value, language) {
  return new Date(value).toLocaleTimeString(getIntlLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getIntlLocale(language) {
  return language === 'zh' ? 'zh-CN' : 'en-US';
}

function truncateMiddle(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value || '';
  }

  const edgeLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, edgeLength)}...${value.slice(-edgeLength)}`;
}
