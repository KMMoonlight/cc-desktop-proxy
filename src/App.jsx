import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowUp,
  Blocks,
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Columns2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Grid2x2,
  Hand,
  Image as ImageIcon,
  LoaderCircle,
  MoreHorizontal,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  PlugZap,
  Search,
  Settings,
  Sparkles,
  Square,
  Rows2,
  TerminalSquare,
  Trash2,
  Workflow,
  Wrench,
  X,
} from 'lucide-react';

import GitDiffWindow from '@/components/git-diff-window';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { ToastViewport } from '@/components/ui/toast';
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
  defaultProvider: 'claude',
  expandedWorkspaceIds: [],
  paneLayout: null,
  platform: '',
  providers: {},
  selectedSessionId: null,
  selectedWorkspaceId: null,
  workspaces: [],
};

const PROVIDER_KEYS = ['claude', 'codex'];
const LANGUAGE_STORAGE_KEY = 'cc-desktop-proxy-language';
const PANE_LAYOUT_STORAGE_KEY = 'cc-desktop-proxy-pane-layout';
const PANE_RECENT_IDS_STORAGE_KEY = 'cc-desktop-proxy-pane-recent-ids';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'cc-desktop-proxy-sidebar-collapsed';
const THEME_STORAGE_KEY = 'cc-desktop-proxy-theme';
const PANE_LAYOUT_MODES = ['single', 'columns', 'rows', 'grid'];
const MIN_PANE_HEIGHT = 510;
const MIN_PANE_WIDTH = 540;
const SIDEBAR_EXPANDED_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 68;
const SIDEBAR_VIEW_WORKSPACES = 'workspaces';
const SIDEBAR_VIEW_HIDDEN_PANES = 'hidden-panes';
const DEFAULT_PANE_LAYOUT = {
  focusedPaneId: 'pane-1',
  mode: 'single',
  panes: [
    {
      id: 'pane-1',
      sessionId: null,
      workspaceId: null,
    },
  ],
};
const IMAGE_ATTACHMENT_EXTENSIONS = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);
const SIDEBAR_ACTION_BUTTON_CLASS = 'h-8 w-8 shrink-0 rounded-md bg-transparent p-0 text-muted-foreground shadow-none hover:bg-background/80 hover:text-foreground';
const SIDEBAR_ACTION_SLOT_CLASS = 'absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1';
const SIDEBAR_RAIL_BUTTON_CLASS = 'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent bg-transparent text-muted-foreground transition-[background-color,color,border-color,box-shadow] hover:bg-background/85 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35';

function formatShortcutLabel(platform, key) {
  const normalizedKey = String(key || '').trim().toUpperCase();
  if (!normalizedKey) {
    return '';
  }

  return platform === 'darwin'
    ? `⌘${normalizedKey}`
    : `Meta+${normalizedKey}`;
}

function formatShortcutTooltip(label, key, platform) {
  const shortcutLabel = formatShortcutLabel(platform, key);
  if (!label || !shortcutLabel) {
    return label || '';
  }

  return `${label} (${shortcutLabel})`;
}

function formatShortcutComboTooltip(label, shortcutLabel) {
  if (!label || !shortcutLabel) {
    return label || '';
  }

  return `${label} (${shortcutLabel})`;
}

function formatShiftedShortcutLabel(platform, key) {
  const normalizedKey = String(key || '').trim().toUpperCase();
  if (!normalizedKey) {
    return '';
  }

  return platform === 'darwin'
    ? `⇧⌘${normalizedKey}`
    : `Meta+Shift+${normalizedKey}`;
}

function formatPaneSplitControlTooltip(copy, count, platform) {
  const primaryShortcut = formatShortcutLabel(platform, 'D');
  const combinedShortcut = formatShiftedShortcutLabel(platform, 'D');
  const lines = [
    copy.paneSplitAddTooltip(count),
  ];

  if (primaryShortcut) {
    lines[0] = `${copy.paneSplitAdd} (${primaryShortcut}) · ${copy.paneSplitAddTooltip(count).replace(`${copy.paneSplitAdd} · `, '')}`;
  }

  if (combinedShortcut) {
    lines.push(formatShortcutComboTooltip(copy.paneSplitAddAndCreate, combinedShortcut));
  }

  return lines.join('\n');
}

function formatShortcutRangeLabel(platform, start, end) {
  const normalizedStart = String(start || '').trim();
  const normalizedEnd = String(end || '').trim();
  if (!normalizedStart || !normalizedEnd) {
    return '';
  }

  return platform === 'darwin'
    ? `⌘${normalizedStart}-${normalizedEnd}`
    : `Meta+${normalizedStart}-${normalizedEnd}`;
}

function getPaneHeaderLabel(platform, paneNumber) {
  if (Number.isInteger(paneNumber) && paneNumber >= 1 && paneNumber <= 9) {
    return formatShortcutLabel(platform, String(paneNumber));
  }

  return String(paneNumber || '');
}

const COPY = {
  zh: {
    addWorkspace: '添加工作目录',
    addAttachment: '添加附件',
    archiveConversation: '归档话题',
    archiveConversationConfirm: '确认归档',
    archiveConversationConfirming: '归档中...',
    archiveConversationDescription: '归档后，这个话题会从当前列表中隐藏。',
    archiveConversationTitle: '确认归档这个话题？',
    approvalAction: '申请执行',
    approvalAllow: '允许',
    approvalAllowAlwaysCommand: '一直允许此命令',
    approvalBlockedPath: '目标路径',
    approvalDeny: '拒绝',
    approvalReason: '原因',
    approvalResponding: '提交中...',
    approvalTitle: '需要你的审批',
    assistantThinking: '正在思考',
    bridgeUnavailable: '当前页面没有接到 Electron bridge，请通过桌面应用启动。',
    cancel: '取消',
    claudeCode: 'Claude',
    claudeCodeUnavailable: 'Claude 不可用',
    collapseSidebar: '折叠侧边栏',
    collapseDetails: '收起详情',
    collapseWorkspace: '收起工作目录',
    conversationEmpty: '这个会话还没有内容',
    createConversationForWorkspace: '为当前目录新开对话',
    createConversationInWorkspace: (path) => `在 ${path} 中新建对话`,
    emptyWorkspaces: '还没有工作目录，先添加一个本地目录。',
    expandSidebar: '展开侧边栏',
    expandDetails: '展开详情',
    expandWorkspace: '展开工作目录',
    inputPlaceholder: '输入消息或 / 指令，Enter 发送，Shift+Enter 换行...',
    languageLabel: '语言',
    languageChinese: '🇨🇳 中文',
    languageEnglish: '🇺🇸 English',
    modeLabel: '模式',
    modeMenuDescription: '切换当前会话的 Claude Code 原生模式。',
    modeMenuHint: '修改会在下一条消息时生效。',
    modeMenuTitle: '选择模式',
    modeOptionAskBeforeEdits: 'Ask before edits',
    modeOptionEditAutomatically: 'Edit automatically',
    modeOptionPlanMode: 'Plan mode',
    modeSummaryAskBeforeEdits: 'Claude 会在每次编辑前先请求审批。',
    modeSummaryEditAutomatically: 'Claude 会自动编辑你选中的文本或整个文件。',
    modeSummaryPlanMode: 'Claude 会先探索代码并给出计划，再开始编辑。',
    modelDefault: '跟随默认模型',
    modelLabel: '模型',
    modelMenuDescription: '切换当前会话的模型。',
    modelMenuHint: '其他完整模型名仍然可以通过 /model <name> 设置。',
    modelMenuTitle: '选择模型',
    modelOptionCustom: '当前自定义模型',
    modelOptionDefault: 'Default（推荐）',
    modelOptionHaiku: 'Haiku',
    modelOptionOpus: 'Opus',
    modelOptionOpusLong: 'Opus（1M context）',
    modelOptionSonnet: 'Sonnet',
    modelSummaryCustom: (label) => `当前会话正在使用 ${label}`,
    modelSummaryDefault: (label, providerLabel) => (label ? `使用 ${providerLabel || '当前 provider'} 默认模型（当前 ${label}）` : `使用 ${providerLabel || '当前 provider'} 默认模型`),
    modelSummaryHaiku: 'Haiku 4.5 · 响应最快，适合轻量任务 · $1/$5 per Mtok',
    modelSummaryOpus: 'Opus 4.6 · 最适合复杂任务 · $5/$25 per Mtok',
    modelSummaryOpusLong: 'Opus 4.6 长上下文版 · 适合超长会话 · $10/$37.50 per Mtok',
    modelSummarySonnet: 'Sonnet 4.5 · 适合日常编码任务 · $3/$15 per Mtok',
    providerLabel: 'Provider',
    providerMenuDescription: '为当前会话选择本地 CLI。',
    providerMenuHint: '发送第一条消息后会锁定当前 Provider。',
    providerLockedHint: '这个会话已经开始对话，Provider 不能再修改。',
    providerMenuTitle: '选择 Provider',
    providerOptionClaude: 'Claude',
    providerOptionCodex: 'Codex',
    providerSessionDisabledHint: (label) => `${label} 已在设置中关闭，当前会话暂时不能继续对话。`,
    providerSummaryClaude: '本地 Claude CLI',
    providerSummaryCodex: '本地 Codex CLI',
    providerUnavailable: (label) => `${label} 不可用`,
    noConversationOpen: '还没有打开对话',
    paneClear: '清空当前分屏',
    paneClickToFocus: '点击切换到这个分屏',
    paneClose: '关闭分屏',
    paneEmptyDescription: '先点亮这个分屏，再从左侧选择一个历史会话或新建会话。',
    paneEmptyTitle: '这个分屏还没有会话',
    paneGrid: '四宫格',
    paneLayoutColumns: '左右分屏',
    paneLayoutRows: '上下分屏',
    paneLayoutSingle: '单对话',
    paneLayoutTitle: '布局',
    paneOverflowBusy: '运行中',
    paneOverflowDescription: '窗口变小时，超出的分屏会暂时收在这里。点击即可切换回来。',
    paneOverflowLabel: '隐藏分屏',
    paneOverflowTrigger: (count) => `${count} 个隐藏分屏`,
    paneSplitAdd: '新增分屏',
    paneSplitAddAndCreate: '新增分屏并新建对话',
    paneSplitAddTooltip: (count) => `新增分屏 · 当前窗口最多可显示 ${count} 个分屏`,
    paneSplitLimitReached: '当前窗口尺寸下已达到最大分屏数',
    paneLoading: '正在载入对话...',
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
    openWorkspaceInFinder: '在 Finder 中打开工作目录',
    openWorkspaceInFinderWithPath: (path) => `在 Finder 中打开 ${path}`,
    workspaceGitBranchInfo: '当前 Git 分支',
    workspaceGitChangesSummary: (added, deleted) => `查看 Git 变更 · +${added || 0} -${deleted || 0}`,
    workspaceGitUnavailable: '当前目录不是 Git 仓库',
    workspaceMoreActions: '更多操作',
    removeAttachment: '移除附件',
    runStop: '停止生成',
    searchPlaceholder: '搜索对话标题、摘要或会话 ID',
    searchNoResult: (query) => `没有找到和“${query}”相关的对话。`,
    sendMessage: '发送消息',
    sending: '发送中',
    settings: '设置',
    settingsDescription: '调整客户端语言、主题和 Provider 偏好。',
    settingsTitle: '设置',
    settingsClose: '关闭',
    settingsProvidersHint: '至少保留一个 Provider 处于启用状态。',
    settingsProvidersTitle: 'Provider',
    settingsProvidersDescription: '控制哪些本地 CLI 可以用于新会话和可切换会话。',
    settingsShortcutsTitle: '快捷键',
    settingsShortcutAddWorkspace: '添加工作目录',
    settingsShortcutToggleSidebar: '切换侧边栏展开 / 收起',
    settingsShortcutAddPane: '新增空分屏',
    settingsShortcutAddPaneAndCreate: '新增分屏并立即新建对话',
    settingsShortcutCreateConversation: '在当前工作目录新建对话',
    settingsShortcutClosePane: '关闭当前分屏',
    settingsShortcutFocusPane: '切换到当前可见的第 1-9 个分屏',
    startByAddingWorkspace: '先添加一个工作目录',
    startByAddingWorkspaceDescription: '工作目录会成为本地 CLI 运行时的上下文。你可以创建多个目录，并在左侧切换它们各自的历史对话。',
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
    viewGitChanges: '查看 Git 变更',
    workspaceSection: '工作目录',
    workspaceSelectedDescription: '这个工作目录已经选中，但还没有打开任何会话。点击左侧目录项右侧的“新对话”，就会在该目录下创建新的历史会话。',
  },
  en: {
    addWorkspace: 'Add workspace',
    addAttachment: 'Add attachment',
    archiveConversation: 'Archive conversation',
    archiveConversationConfirm: 'Archive',
    archiveConversationConfirming: 'Archiving...',
    archiveConversationDescription: 'After archiving, this conversation will be hidden from the current list.',
    archiveConversationTitle: 'Archive this conversation?',
    approvalAction: 'Requested action',
    approvalAllow: 'Allow',
    approvalAllowAlwaysCommand: 'Always allow this command',
    approvalBlockedPath: 'Path',
    approvalDeny: 'Deny',
    approvalReason: 'Reason',
    approvalResponding: 'Submitting...',
    approvalTitle: 'Approval needed',
    assistantThinking: 'Thinking',
    bridgeUnavailable: 'Electron bridge is not available on this page. Please open it from the desktop app.',
    cancel: 'Cancel',
    claudeCode: 'Claude',
    claudeCodeUnavailable: 'Claude unavailable',
    collapseSidebar: 'Collapse sidebar',
    collapseDetails: 'Hide details',
    collapseWorkspace: 'Collapse workspace',
    conversationEmpty: 'This conversation is empty',
    createConversationForWorkspace: 'Start a conversation for this workspace',
    createConversationInWorkspace: (path) => `Start a conversation in ${path}`,
    emptyWorkspaces: 'No workspaces yet. Add a local folder to get started.',
    expandSidebar: 'Expand sidebar',
    expandDetails: 'Show details',
    expandWorkspace: 'Expand workspace',
    inputPlaceholder: 'Type a message or / command, press Enter to send, Shift+Enter for a new line...',
    languageLabel: 'Language',
    languageChinese: '🇨🇳 Chinese',
    languageEnglish: '🇺🇸 English',
    modeLabel: 'Mode',
    modeMenuDescription: 'Switch the native Claude Code mode for this conversation.',
    modeMenuHint: 'Changes apply on the next message.',
    modeMenuTitle: 'Select mode',
    modeOptionAskBeforeEdits: 'Ask before edits',
    modeOptionEditAutomatically: 'Edit automatically',
    modeOptionPlanMode: 'Plan mode',
    modeSummaryAskBeforeEdits: 'Claude will ask for approval before making each edit.',
    modeSummaryEditAutomatically: 'Claude will edit your selected text or the whole file.',
    modeSummaryPlanMode: 'Claude will explore the code and present a plan before editing.',
    modelDefault: 'Follow default model',
    modelLabel: 'Model',
    modelMenuDescription: 'Switch the model for this conversation.',
    modelMenuHint: 'You can still set any full model name with /model <name>.',
    modelMenuTitle: 'Select model',
    modelOptionCustom: 'Current custom model',
    modelOptionDefault: 'Default (recommended)',
    modelOptionHaiku: 'Haiku',
    modelOptionOpus: 'Opus',
    modelOptionOpusLong: 'Opus (1M context)',
    modelOptionSonnet: 'Sonnet',
    modelSummaryCustom: (label) => `This conversation is currently using ${label}`,
    modelSummaryDefault: (label, providerLabel) => (label ? `Use ${providerLabel || 'the selected provider'} default model (currently ${label})` : `Use ${providerLabel || 'the selected provider'} default model`),
    modelSummaryHaiku: 'Haiku 4.5 · Fastest for quick answers · $1/$5 per Mtok',
    modelSummaryOpus: 'Opus 4.6 · Most capable for complex work · $5/$25 per Mtok',
    modelSummaryOpusLong: 'Opus 4.6 for long sessions · $10/$37.50 per Mtok',
    modelSummarySonnet: 'Sonnet 4.5 · Best for everyday tasks · $3/$15 per Mtok',
    providerLabel: 'Provider',
    providerMenuDescription: 'Choose the local CLI for this conversation.',
    providerMenuHint: 'The provider locks after the first message.',
    providerLockedHint: 'This conversation has already started, so the provider can no longer be changed.',
    providerMenuTitle: 'Select provider',
    providerOptionClaude: 'Claude',
    providerOptionCodex: 'Codex',
    providerSessionDisabledHint: (label) => `${label} is disabled in Settings, so this conversation cannot continue for now.`,
    providerSummaryClaude: 'Local Claude CLI',
    providerSummaryCodex: 'Local Codex CLI',
    providerUnavailable: (label) => `${label} unavailable`,
    noConversationOpen: 'No conversation open',
    paneClear: 'Clear pane',
    paneClickToFocus: 'Click to focus this pane',
    paneClose: 'Close pane',
    paneEmptyDescription: 'Focus this pane, then pick or create a conversation from the sidebar.',
    paneEmptyTitle: 'No conversation in this pane',
    paneGrid: 'Grid',
    paneLayoutColumns: 'Split columns',
    paneLayoutRows: 'Split rows',
    paneLayoutSingle: 'Single',
    paneLayoutTitle: 'Layout',
    paneOverflowBusy: 'Running',
    paneOverflowDescription: 'When the window shrinks, extra panes stay here temporarily. Click one to bring it back.',
    paneOverflowLabel: 'Hidden panes',
    paneOverflowTrigger: (count) => `${count} hidden panes`,
    paneSplitAdd: 'Add split',
    paneSplitAddAndCreate: 'Add split and conversation',
    paneSplitAddTooltip: (count) => `Add split · This window can show up to ${count} panes`,
    paneSplitLimitReached: 'Maximum split count reached for this window size',
    paneLoading: 'Loading conversation...',
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
    openWorkspaceInFinder: 'Open workspace in Finder',
    openWorkspaceInFinderWithPath: (path) => `Open ${path} in Finder`,
    workspaceGitBranchInfo: 'Current Git branch',
    workspaceGitChangesSummary: (added, deleted) => `View Git changes · +${added || 0} -${deleted || 0}`,
    workspaceGitUnavailable: 'This folder is not a Git repository',
    workspaceMoreActions: 'More actions',
    removeAttachment: 'Remove attachment',
    runStop: 'Stop generation',
    searchPlaceholder: 'Search titles, previews, or session IDs',
    searchNoResult: (query) => `No conversations found for "${query}".`,
    sendMessage: 'Send message',
    sending: 'Sending',
    settings: 'Settings',
    settingsDescription: 'Adjust language, theme, and provider preferences.',
    settingsTitle: 'Settings',
    settingsClose: 'Close',
    settingsProvidersHint: 'Keep at least one provider enabled.',
    settingsProvidersTitle: 'Providers',
    settingsProvidersDescription: 'Control which local CLIs are available for new and switchable conversations.',
    settingsShortcutsTitle: 'Shortcuts',
    settingsShortcutAddWorkspace: 'Add workspace',
    settingsShortcutToggleSidebar: 'Toggle the sidebar',
    settingsShortcutAddPane: 'Add an empty split',
    settingsShortcutAddPaneAndCreate: 'Add a split and create a conversation',
    settingsShortcutCreateConversation: 'Create a conversation in the current workspace',
    settingsShortcutClosePane: 'Close the current split',
    settingsShortcutFocusPane: 'Focus visible split 1-9',
    startByAddingWorkspace: 'Add a workspace first',
    startByAddingWorkspaceDescription: 'A workspace becomes the local context for your coding CLI. You can add multiple folders and switch between their conversation histories from the left sidebar.',
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
    viewGitChanges: 'View Git changes',
    workspaceSection: 'Workspaces',
    workspaceSelectedDescription: 'This workspace is selected, but no conversation is open yet. Click "New conversation" on the right side of the workspace row to create one.',
  },
};

export default function App() {
  const desktopClient = typeof window !== 'undefined' ? window.claudeDesktop : null;
  const windowView = getWindowView();

  if (windowView === 'git-diff') {
    return <GitDiffWindow desktopClient={desktopClient} />;
  }

  return <MainApp desktopClient={desktopClient} />;
}

function MainApp({ desktopClient }) {
  const [appState, setAppState] = useState(EMPTY_APP_STATE);
  const [language, setLanguage] = useState(() => getInitialLanguage());
  const [themePreference, setThemePreference] = useState(() => getInitialThemePreference());
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme());
  const [inputValue, setInputValue] = useState('');
  const [composerAttachments, setComposerAttachments] = useState([]);
  const [composerHistoryIndex, setComposerHistoryIndex] = useState(-1);
  const [toastItems, setToastItems] = useState([]);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => getInitialSidebarCollapsed());
  const [sidebarFlyoutView, setSidebarFlyoutView] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isArchivingSession, setIsArchivingSession] = useState(false);
  const [isPickingWorkspace, setIsPickingWorkspace] = useState(false);
  const [isRemovingWorkspace, setIsRemovingWorkspace] = useState(false);
  const [sendingPaneIds, setSendingPaneIds] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModePickerOpen, setIsModePickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isUpdatingPermissionMode, setIsUpdatingPermissionMode] = useState(false);
  const [isUpdatingModel, setIsUpdatingModel] = useState(false);
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [isUpdatingProviderSettings, setIsUpdatingProviderSettings] = useState(false);
  const [pendingApprovalActionId, setPendingApprovalActionId] = useState('');
  const [pendingArchiveSession, setPendingArchiveSession] = useState(null);
  const [pendingRemoveWorkspace, setPendingRemoveWorkspace] = useState(null);
  const [paneLayout, setPaneLayout] = useState(() => getInitialPaneLayout());
  const [paneRecentIds, setPaneRecentIds] = useState(() => getInitialPaneRecentIds());
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const [sessionViewCache, setSessionViewCache] = useState({});
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');

  const hasHydratedExpandedWorkspaceIdsRef = useRef(false);
  const hasHydratedPaneLayoutRef = useRef(false);
  const hasInitializedPaneSelectionRef = useRef(false);
  const modePickerRef = useRef(null);
  const modelPickerRef = useRef(null);
  const collapsedSidebarRef = useRef(null);
  const [paneBoardElement, setPaneBoardElement] = useState(null);
  const paneLayoutRef = useRef(paneLayout);
  const paneRecentIdsRef = useRef(paneRecentIds);
  const paneViewportRefs = useRef(new Map());
  const sidebarFlyoutRef = useRef(null);
  const slashCommandMenuRef = useRef(null);
  const textareaRef = useRef(null);
  const [paneBoardSize, setPaneBoardSize] = useState(() => getInitialPaneBoardSize());
  const focusedPane = useMemo(
    () => paneLayout.panes.find((pane) => pane.id === paneLayout.focusedPaneId) || paneLayout.panes[0] || null,
    [paneLayout.focusedPaneId, paneLayout.panes],
  );

  const selectedWorkspace = useMemo(
    () => appState.workspaces.find((workspace) => workspace.id === appState.selectedWorkspaceId) || null,
    [appState.selectedWorkspaceId, appState.workspaces],
  );
  const copy = COPY[language];
  const selectedSession = appState.activeSession;
  const focusedWorkspace = useMemo(
    () => appState.workspaces.find((workspace) => workspace.id === focusedPane?.workspaceId) || null,
    [appState.workspaces, focusedPane?.workspaceId],
  );
  const focusedSessionCacheKey = useMemo(
    () => createSessionCacheKey(focusedPane?.workspaceId, focusedPane?.sessionId),
    [focusedPane?.sessionId, focusedPane?.workspaceId],
  );
  const focusedSession = useMemo(() => {
    if (!focusedPane?.sessionId) {
      return null;
    }

    const isSelectedPaneSession = (
      selectedSession
      && selectedSession.workspaceId === focusedPane.workspaceId
      && selectedSession.id === focusedPane.sessionId
    );

    if (isSelectedPaneSession) {
      return selectedSession;
    }

    return sessionViewCache[focusedSessionCacheKey] || null;
  }, [focusedPane, focusedSessionCacheKey, selectedSession, sessionViewCache]);
  const normalizedSessionSearchQuery = sessionSearchQuery.trim().toLowerCase();
  const providerCatalog = appState.providers && typeof appState.providers === 'object'
    ? appState.providers
    : {};
  const focusedProvider = normalizeProviderKey(focusedSession?.provider || appState.defaultProvider);
  const focusedProviderInfo = getProviderInfo(providerCatalog, focusedProvider, appState.defaultProvider);
  const sidebarProviderStatuses = useMemo(
    () => PROVIDER_KEYS
      .map((providerKey) => ({
        key: providerKey,
        info: getProviderInfo(providerCatalog, providerKey, providerKey),
      }))
      .filter(({ info }) => info.enabled !== false),
    [providerCatalog],
  );
  const providerSettings = useMemo(
    () => PROVIDER_KEYS.map((providerKey) => {
      const info = getProviderInfo(providerCatalog, providerKey, providerKey);

      return {
        available: Boolean(info.available),
        enabled: info.enabled !== false,
        key: providerKey,
        label: getProviderDisplayName(providerKey, copy),
        summary: providerKey === 'codex' ? copy.providerSummaryCodex : copy.providerSummaryClaude,
      };
    }),
    [copy, providerCatalog],
  );
  const installedSkills = Array.isArray(focusedProviderInfo.skills) ? focusedProviderInfo.skills : [];
  const slashCommands = useMemo(() => getSlashCommands(language, installedSkills), [installedSkills, language]);
  const availableSessionModels = Array.isArray(focusedProviderInfo.models) ? focusedProviderInfo.models : [];
  const sessionPermissionMode = focusedSession?.permissionMode || 'default';
  const modeOptions = useMemo(() => getComposerSessionModeOptions(copy), [copy]);
  const currentModeDisplay = useMemo(
    () => getSessionModeLabel(sessionPermissionMode, copy),
    [copy, sessionPermissionMode],
  );
  const currentModeCommandValue = useMemo(
    () => getSessionModeCommandValue(sessionPermissionMode),
    [sessionPermissionMode],
  );
  const CurrentModeIcon = useMemo(
    () => getSessionModeIcon(sessionPermissionMode),
    [sessionPermissionMode],
  );
  const effectiveCurrentModel = focusedSession?.currentModel || focusedSession?.model || '';
  const modelOptions = useMemo(
    () => getComposerModelOptions(copy, focusedProvider, focusedSession?.model || '', effectiveCurrentModel, availableSessionModels),
    [availableSessionModels, copy, effectiveCurrentModel, focusedProvider, focusedSession?.model],
  );
  const currentModelDisplay = useMemo(
    () => getModelDisplayName(effectiveCurrentModel, availableSessionModels, focusedProvider) || copy.modelOptionDefault,
    [availableSessionModels, copy.modelOptionDefault, effectiveCurrentModel, focusedProvider],
  );
  const currentModelCommandValue = useMemo(
    () => ((focusedSession?.model || '').trim() || 'default'),
    [focusedSession?.model],
  );
  const slashCommandQuery = useMemo(() => getSlashCommandQuery(inputValue), [inputValue]);
  const visibleSlashCommands = useMemo(
    () => filterSlashCommands(slashCommands, slashCommandQuery),
    [slashCommandQuery, slashCommands],
  );
  const highlightedSlashCommand = visibleSlashCommands[selectedSlashCommandIndex] || visibleSlashCommands[0] || null;
  const isSlashCommandMenuOpen = slashCommandQuery !== null;
  const pendingApprovals = Array.isArray(focusedSession?.pendingApprovals)
    ? focusedSession.pendingApprovals.filter(Boolean)
    : [];
  const hasComposerAttachments = composerAttachments.length > 0;
  const composerHistoryEntries = useMemo(
    () => getComposerHistoryEntries(focusedSession?.messages || []),
    [focusedSession?.messages],
  );
  const paneViews = useMemo(
    () => paneLayout.panes.map((pane) => buildPaneViewModel({
      activeSession: selectedSession,
      appState,
      copy,
      focusedPaneId: paneLayout.focusedPaneId,
      sendingPaneIds,
      language,
      paneCount: paneLayout.panes.length,
      pane,
      sessionViewCache,
    })),
    [appState, copy, language, paneLayout.focusedPaneId, paneLayout.panes, selectedSession, sendingPaneIds, sessionViewCache],
  );
  const maxPaneCount = useMemo(
    () => getAdaptivePaneLimit(paneBoardSize.width, paneBoardSize.height),
    [paneBoardSize.height, paneBoardSize.width],
  );
  const prioritizedPaneIds = useMemo(
    () => getPrioritizedPaneIds(paneLayout.panes, paneRecentIds, paneLayout.focusedPaneId),
    [paneLayout.focusedPaneId, paneLayout.panes, paneRecentIds],
  );
  const visiblePaneIds = useMemo(
    () => getVisiblePaneIds(paneLayout.panes, prioritizedPaneIds, maxPaneCount),
    [maxPaneCount, paneLayout.panes, prioritizedPaneIds],
  );
  const visiblePaneIdSet = useMemo(() => new Set(visiblePaneIds), [visiblePaneIds]);
  const visiblePaneViews = useMemo(
    () => paneViews.filter((pane) => visiblePaneIdSet.has(pane.id)),
    [paneViews, visiblePaneIdSet],
  );
  const hiddenPaneViews = useMemo(
    () => orderPaneViewsByIds(
      paneViews.filter((pane) => !visiblePaneIdSet.has(pane.id)),
      prioritizedPaneIds,
    ),
    [paneViews, prioritizedPaneIds, visiblePaneIdSet],
  );
  const sessionPaneBindingMap = useMemo(
    () => buildSessionPaneBindingMap(paneLayout.panes),
    [paneLayout.panes],
  );
  const pendingApprovalRequestIds = useMemo(
    () => new Set(
      paneViews.flatMap((pane) => (
        Array.isArray(pane.session?.pendingApprovals)
          ? pane.session.pendingApprovals.map((approval) => approval?.requestId).filter(Boolean)
          : []
      )),
    ),
    [paneViews],
  );
  const focusedPaneView = useMemo(
    () => paneViews.find((pane) => pane.id === focusedPane?.id) || null,
    [focusedPane?.id, paneViews],
  );
  const paneGridSpec = useMemo(
    () => getAdaptivePaneGridSpec(visiblePaneViews.length, paneBoardSize.width, paneBoardSize.height),
    [paneBoardSize.height, paneBoardSize.width, visiblePaneViews.length],
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
  const resolvedTheme = themePreference === 'system' ? systemTheme : themePreference;
  const hasHiddenPanes = hiddenPaneViews.length > 0;
  const hiddenPaneSection = hasHiddenPanes ? (
    <HiddenPaneSection
      copy={copy}
      hiddenPanes={hiddenPaneViews}
      onClearPane={(paneId) => {
        clearPane(paneId);
      }}
      onFocusPane={(paneId) => {
        setSidebarFlyoutView(null);
        void focusPane(paneId);
      }}
    />
  ) : null;
  const workspaceSidebarSection = (
    <SidebarSection
      title={copy.workspaceSection}
      action={(
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSidebarFlyoutView(null);
            addWorkspace();
          }}
          disabled={!desktopClient || isPickingWorkspace}
          aria-label={copy.addWorkspace}
          title={formatShortcutTooltip(copy.addWorkspace, 'O', appState.platform)}
          className={cn(SIDEBAR_ACTION_BUTTON_CLASS, 'text-foreground')}
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

      <div className="max-h-[min(48vh,30rem)] overflow-y-auto pr-1">
        <div className="space-y-3">
          {appState.workspaces.length === 0 ? (
            <SidebarEmpty text={copy.emptyWorkspaces} />
          ) : filteredWorkspaces.length === 0 ? (
            <SidebarEmpty text={copy.searchNoResult(sessionSearchQuery.trim())} />
          ) : (
            filteredWorkspaces.map((workspace) => (
              <WorkspaceItem
                copy={copy}
                key={workspace.id}
                disabled={isArchivingSession || isRemovingWorkspace}
                isExpanded={normalizedSessionSearchQuery ? true : expandedWorkspaceIds.includes(workspace.id)}
                onArchiveSession={(session) => {
                  setSidebarFlyoutView(null);
                  setPendingArchiveSession({
                    sessionId: session.id,
                    title: session.title,
                    workspaceId: workspace.id,
                  });
                }}
                onCreateSession={() => {
                  setSidebarFlyoutView(null);
                  createSession(workspace.id);
                }}
                onOpenGitDiffWindow={() => {
                  setSidebarFlyoutView(null);
                  openGitDiffWindow(workspace.id);
                }}
                onOpenWorkspaceInFinder={() => {
                  setSidebarFlyoutView(null);
                  openWorkspaceInFinder(workspace.id);
                }}
                onRemoveWorkspace={() => {
                  setSidebarFlyoutView(null);
                  setPendingRemoveWorkspace({
                    title: workspace.name,
                    workspaceId: workspace.id,
                  });
                }}
                onSelectSession={(sessionId) => {
                  setSidebarFlyoutView(null);
                  selectSession(workspace.id, sessionId);
                }}
                onSelectWorkspace={() => {
                  setSidebarFlyoutView(null);
                  selectWorkspace(workspace.id);
                }}
                onToggleExpand={() => toggleWorkspaceExpansion(workspace.id)}
                platform={appState.platform}
                selectedSessionId={focusedPane?.sessionId || appState.selectedSessionId}
                sessionPaneBindingMap={sessionPaneBindingMap}
                language={language}
                workspace={workspace}
              />
            ))
          )}
        </div>
      </div>
    </SidebarSection>
  );

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
      setIsSettingsOpen(false);
      setIsModePickerOpen(false);
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
    if (!desktopClient || typeof document === 'undefined') {
      return undefined;
    }

    const handleDocumentClick = (event) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) {
        return;
      }

      const copyButton = event.target.closest('[data-markdown-copy-button="true"]');
      if (copyButton) {
        event.preventDefault();
        void handleMarkdownCopyClick(copyButton);
        return;
      }

      const anchor = event.target.closest('a[href]');
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute('href');
      if (!href) {
        return;
      }

      event.preventDefault();
      desktopClient.openLink(href).catch((error) => {
        setSidebarError(error.message);
      });
    };

    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [desktopClient]);

  useEffect(() => {
    if (!focusedSession) {
      setIsModePickerOpen(false);
      setIsModelPickerOpen(false);
    }
  }, [focusedSession]);

  useEffect(() => {
    if (!isSettingsOpen || typeof document === 'undefined') {
      return undefined;
    }

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!isSidebarCollapsed) {
      setSidebarFlyoutView(null);
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!hasHiddenPanes && sidebarFlyoutView === SIDEBAR_VIEW_HIDDEN_PANES) {
      setSidebarFlyoutView(null);
    }
  }, [hasHiddenPanes, sidebarFlyoutView]);

  useEffect(() => {
    if (isSettingsOpen) {
      setSidebarFlyoutView(null);
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!isSidebarCollapsed || !sidebarFlyoutView || typeof document === 'undefined') {
      return undefined;
    }

    const closeOnOutsidePointer = (event) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (collapsedSidebarRef.current?.contains(event.target) || sidebarFlyoutRef.current?.contains(event.target)) {
        return;
      }

      setSidebarFlyoutView(null);
    };

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setSidebarFlyoutView(null);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSidebarCollapsed, sidebarFlyoutView]);

  useEffect(() => {
    setComposerAttachments([]);
    setComposerHistoryIndex(-1);
  }, [focusedPane?.id, focusedSession?.id]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    const cacheKey = createSessionCacheKey(selectedSession.workspaceId, selectedSession.id);
    setSessionViewCache((current) => {
      if (areSessionSnapshotsEqual(current[cacheKey], selectedSession)) {
        return current;
      }

      return {
        ...current,
        [cacheKey]: selectedSession,
      };
    });
  }, [selectedSession]);

  useEffect(() => {
    if (!pendingApprovalActionId) {
      return;
    }

    if (pendingApprovalRequestIds.has(pendingApprovalActionId)) {
      return;
    }

    setPendingApprovalActionId('');
  }, [pendingApprovalActionId, pendingApprovalRequestIds]);

  useEffect(() => {
    if ((!isModePickerOpen && !isModelPickerOpen) || typeof document === 'undefined') {
      return undefined;
    }

    const closeOnOutsidePointer = (event) => {
      if (modePickerRef.current?.contains(event.target)) {
        return;
      }

      if (modelPickerRef.current?.contains(event.target)) {
        return;
      }

      setIsModePickerOpen(false);
      setIsModelPickerOpen(false);
    };

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setIsModePickerOpen(false);
        setIsModelPickerOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isModePickerOpen, isModelPickerOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const handleGlobalPaneShortcuts = (event) => {
      if (
        event.defaultPrevented
        || event.repeat
        || !event.metaKey
        || event.ctrlKey
        || event.altKey
      ) {
        return;
      }

      const shortcutKey = event.key.toLowerCase();
      const paneShortcutIndex = Number.parseInt(shortcutKey, 10);
      const isPaneShortcut = Number.isInteger(paneShortcutIndex) && paneShortcutIndex >= 1 && paneShortcutIndex <= 9;
      const isSplitAndCreateShortcut = shortcutKey === 'd' && event.shiftKey;
      const isSupportedUnshiftedShortcut = !event.shiftKey && (
        shortcutKey === 'o'
        || shortcutKey === 'n'
        || shortcutKey === 'd'
        || shortcutKey === 'w'
        || shortcutKey === 'b'
        || isPaneShortcut
      );

      if (!isSplitAndCreateShortcut && !isSupportedUnshiftedShortcut) {
        return;
      }

      if (isSplitAndCreateShortcut) {
        event.preventDefault();
        void addPaneAndCreateSession();
        return;
      }

      if (isPaneShortcut) {
        const targetPane = visiblePaneViews[paneShortcutIndex - 1];
        if (!targetPane) {
          return;
        }

        event.preventDefault();
        void focusPane(targetPane.id);
        return;
      }

      if (shortcutKey === 'd') {
        event.preventDefault();
        addPane();
        return;
      }

      if (shortcutKey === 'o') {
        event.preventDefault();
        void addWorkspace();
        return;
      }

      if (shortcutKey === 'b') {
        event.preventDefault();
        toggleSidebarCollapse();
        return;
      }

      if (shortcutKey === 'w') {
        if (!focusedPane?.id || paneLayout.panes.length <= 1) {
          return;
        }

        event.preventDefault();
        clearPane(focusedPane.id);
        return;
      }

      const shortcutWorkspace = focusedWorkspace || selectedWorkspace;
      if (!shortcutWorkspace) {
        event.preventDefault();
        setSidebarError(copy.noWorkspaceSelected);
        return;
      }

      event.preventDefault();
      void createSession(shortcutWorkspace.id);
    };

    document.addEventListener('keydown', handleGlobalPaneShortcuts);

    return () => {
      document.removeEventListener('keydown', handleGlobalPaneShortcuts);
    };
  }, [copy.noWorkspaceSelected, focusedPane?.id, focusedWorkspace, paneLayout.panes.length, selectedWorkspace, visiblePaneViews]);

  useEffect(() => {
    setPaneRecentIds((current) => syncPaneRecentIds(current, paneLayout.panes, paneLayout.focusedPaneId));
  }, [paneLayout.focusedPaneId, paneLayout.panes]);

  useEffect(() => {
    paneLayoutRef.current = paneLayout;
  }, [paneLayout]);

  useEffect(() => {
    paneRecentIdsRef.current = paneRecentIds;
  }, [paneRecentIds]);

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
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PANE_LAYOUT_STORAGE_KEY, JSON.stringify(paneLayout));
  }, [paneLayout]);

  useEffect(() => {
    if (!desktopClient || !hasHydratedPaneLayoutRef.current) {
      return;
    }

    desktopClient.setPaneLayout?.({
      ...paneLayout,
      recentPaneIds: paneRecentIds,
    }).catch(() => {});
  }, [desktopClient, paneLayout, paneRecentIds]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PANE_RECENT_IDS_STORAGE_KEY, JSON.stringify(paneRecentIds));
  }, [paneRecentIds]);

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
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const element = paneBoardElement;
    if (!element) {
      return undefined;
    }

    const measurePaneBoard = (width, height) => {
      const nextWidth = Math.round(width);
      const nextHeight = Math.round(height);
      setPaneBoardSize((current) => (
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { height: nextHeight, width: nextWidth }
      ));
    };

    const measureFromElement = () => {
      const rect = element.getBoundingClientRect();
      const estimatedSize = getEstimatedPaneBoardSize(window.innerWidth, window.innerHeight);
      measurePaneBoard(
        Math.max(rect.width, estimatedSize.width),
        Math.max(rect.height, estimatedSize.height),
      );
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        measureFromElement();
        return;
      }

      measurePaneBoard(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(element);
    window.addEventListener('resize', measureFromElement);
    measureFromElement();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureFromElement);
    };
  }, [paneBoardElement, paneViews.length]);

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
        setSendingPaneIds([]);
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
    if (isBootstrapping) {
      return;
    }

    setPaneLayout((current) => {
      const next = normalizePaneLayoutWithAppState(current, appState);
      if (arePaneLayoutsEqual(current, next)) {
        return current;
      }

      return next;
    });
  }, [appState, isBootstrapping]);

  useEffect(() => {
    if (!desktopClient || isBootstrapping) {
      return;
    }

    const pendingFetches = paneLayout.panes
      .filter((pane) => pane.workspaceId && pane.sessionId)
      .filter((pane) => (
        !selectedSession
        || pane.workspaceId !== selectedSession.workspaceId
        || pane.sessionId !== selectedSession.id
      ))
      .filter((pane) => {
        const workspace = appState.workspaces.find((entry) => entry.id === pane.workspaceId);
        const sessionMeta = workspace?.sessions.find((entry) => entry.id === pane.sessionId) || null;
        const cacheKey = createSessionCacheKey(pane.workspaceId, pane.sessionId);
        const cachedSession = sessionViewCache[cacheKey];
        if (!cachedSession || !sessionMeta) {
          return !cachedSession;
        }

        return (
          cachedSession.updatedAt !== sessionMeta.updatedAt
          || cachedSession.status !== sessionMeta.status
          || Boolean(cachedSession.isRunning) !== Boolean(sessionMeta.isRunning)
        );
      });

    if (pendingFetches.length === 0) {
      return;
    }

    let cancelled = false;

    Promise.all(
      pendingFetches.map(async (pane) => {
        try {
          const session = await desktopClient.getSession({
            sessionId: pane.sessionId,
            workspaceId: pane.workspaceId,
          });
          return session;
        } catch {
          return null;
        }
      }),
    ).then((sessions) => {
      if (cancelled) {
        return;
      }

      setSessionViewCache((current) => {
        let mutated = false;
        const next = { ...current };

        for (const session of sessions.filter(Boolean)) {
          const cacheKey = createSessionCacheKey(session.workspaceId, session.id);
          if (areSessionSnapshotsEqual(next[cacheKey], session)) {
            continue;
          }

          next[cacheKey] = session;
          mutated = true;
        }

        return mutated ? next : current;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [appState.workspaces, desktopClient, isBootstrapping, paneLayout.panes, selectedSession, sessionViewCache]);

  useEffect(() => {
    if (!desktopClient || isBootstrapping || hasInitializedPaneSelectionRef.current) {
      return;
    }

    if (!paneLayout.panes.length) {
      hasInitializedPaneSelectionRef.current = true;
      return;
    }

    const targetPane = focusedPane || paneLayout.panes[0];

    if (!targetPane?.workspaceId || !targetPane.sessionId) {
      if (selectedSession) {
        const existingPane = paneLayout.panes.find((pane) => (
          pane.workspaceId === selectedSession.workspaceId
          && pane.sessionId === selectedSession.id
        ));

        setPaneLayout((current) => {
          const next = existingPane
            ? focusPaneInLayout(current, existingPane.id)
            : assignSessionToPaneState(current, current.focusedPaneId, {
              sessionId: selectedSession.id,
              workspaceId: selectedSession.workspaceId,
            });

          return arePaneLayoutsEqual(current, next) ? current : next;
        });
      }
      hasInitializedPaneSelectionRef.current = true;
      return;
    }

    hasInitializedPaneSelectionRef.current = true;

    if (
      appState.selectedWorkspaceId === targetPane.workspaceId
      && appState.selectedSessionId === targetPane.sessionId
    ) {
      return;
    }

    void openSessionInPane(targetPane.workspaceId, targetPane.sessionId, { paneId: targetPane.id });
  }, [
    appState.selectedSessionId,
    appState.selectedWorkspaceId,
    desktopClient,
    focusedPane,
    isBootstrapping,
    paneLayout.panes,
    selectedSession,
  ]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [inputValue]);

  useEffect(() => {
    const viewport = paneViewportRefs.current.get(focusedPane?.id);
    if (!viewport) {
      return undefined;
    }

    let nextFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      nextFrameId = window.requestAnimationFrame(() => {
        const top = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);
        viewport.scrollTo({
          top,
          behavior: focusedSession?.status === 'running' || focusedPaneView?.shouldShowRunIndicator ? 'auto' : 'smooth',
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (nextFrameId) {
        window.cancelAnimationFrame(nextFrameId);
      }
    };
  }, [focusedPane?.id, focusedPaneView?.shouldShowRunIndicator, focusedSession?.id, focusedSession?.messages, focusedSession?.status]);

  async function loadAppState() {
    if (!desktopClient) {
      return;
    }

    setIsBootstrapping(true);

    try {
      const state = await desktopClient.getAppState();
      const remotePaneLayout = state?.paneLayout ? normalizePaneLayout(state.paneLayout) : null;
      const hydratedPaneState = resolveHydratedPaneState({
        localLayout: paneLayoutRef.current,
        localRecentIds: paneRecentIdsRef.current,
        remoteLayout: remotePaneLayout,
        remoteRecentIds: state?.paneLayout?.recentPaneIds,
      });
      const remoteRecentIds = normalizePaneRecentIds(state?.paneLayout?.recentPaneIds, hydratedPaneState.layout.panes);

      setAppState(state);
      setPaneLayout((current) => {
        const next = hydratedPaneState.layout;
        return arePaneLayoutsEqual(current, next) ? current : next;
      });
      setPaneRecentIds((current) => {
        const next = hydratedPaneState.recentPaneIds;
        return arePaneIdListsEqual(current, next) ? current : next;
      });
      hasHydratedPaneLayoutRef.current = true;
      if (
        !remotePaneLayout
        || !arePaneLayoutsEqual(remotePaneLayout, hydratedPaneState.layout)
        || !arePaneIdListsEqual(remoteRecentIds, hydratedPaneState.recentPaneIds)
      ) {
        void desktopClient.setPaneLayout?.({
          ...hydratedPaneState.layout,
          recentPaneIds: hydratedPaneState.recentPaneIds,
        }).catch(() => {});
      }
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
    if (!desktopClient || isPickingWorkspace) {
      return;
    }

    setSidebarError('');

    try {
      const selectedPath = await desktopClient.pickWorkspaceDirectory();
      if (!selectedPath) {
        return;
      }

      setIsPickingWorkspace(true);
      const nextState = await desktopClient.addWorkspace(selectedPath);
      setAppState(nextState);
    } catch (error) {
      setSidebarError(error.message);
    } finally {
      setIsPickingWorkspace(false);
    }
  }

  async function openGitDiffWindow(workspaceId) {
    if (!desktopClient || !workspaceId) {
      return;
    }

    setSidebarError('');

    try {
      await desktopClient.openGitDiffWindow({ workspaceId });
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  async function openWorkspaceInFinder(workspaceId) {
    if (!desktopClient || !workspaceId) {
      return;
    }

    setSidebarError('');

    try {
      await desktopClient.openWorkspaceInFinder(workspaceId);
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  function addPane() {
    if (paneLayout.panes.length >= maxPaneCount) {
      setSidebarError(copy.paneSplitLimitReached);
      return;
    }

    setSidebarError('');
    setPaneLayout((current) => appendPaneToLayout(current));
  }

  async function addPaneAndCreateSession() {
    if (!desktopClient) {
      return;
    }

    const targetWorkspace = focusedWorkspace || selectedWorkspace;
    if (!targetWorkspace) {
      setSidebarError(copy.noWorkspaceSelected);
      return;
    }

    if (paneLayout.panes.length >= maxPaneCount) {
      setSidebarError(copy.paneSplitLimitReached);
      return;
    }

    const nextPaneId = createNextPaneId(paneLayout.panes);
    setSidebarError('');

    try {
      const nextState = await desktopClient.createSession(targetWorkspace.id);
      setAppState(nextState);
      setPaneLayout((current) => assignSessionToPaneState(
        appendPaneToLayout(current),
        nextPaneId,
        {
          sessionId: nextState.selectedSessionId,
          workspaceId: nextState.selectedWorkspaceId,
        },
      ));
      setInputValue('');
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  async function createSession(workspaceId, options = {}) {
    if (!desktopClient) {
      return;
    }

    setSidebarError('');

    try {
      const nextState = await desktopClient.createSession(workspaceId);
      setAppState(nextState);
      setPaneLayout((current) => assignSessionToPaneState(current, options.paneId || current.focusedPaneId, {
        sessionId: nextState.selectedSessionId,
        workspaceId: nextState.selectedWorkspaceId,
      }));
      setInputValue('');
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  async function selectWorkspace(workspaceId, options = {}) {
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

  async function openSessionInPane(workspaceId, sessionId, { paneId = paneLayout.focusedPaneId, preferPaneId = false } = {}) {
    if (!desktopClient || !workspaceId || !sessionId) {
      return;
    }

    const requestedPaneId = paneLayout.panes.some((pane) => pane.id === paneId) ? paneId : '';
    const existingPane = paneLayout.panes.find((pane) => (
      pane.id !== requestedPaneId
      && pane.workspaceId === workspaceId
      && pane.sessionId === sessionId
    ));
    const targetPaneId = (preferPaneId && requestedPaneId)
      ? requestedPaneId
      : (existingPane?.id || requestedPaneId || paneLayout.panes[0]?.id);
    if (!targetPaneId) {
      return;
    }

    setPaneLayout((current) => {
      let next = focusPaneInLayout(current, targetPaneId);
      next = assignSessionToPaneState(next, targetPaneId, { sessionId, workspaceId });
      return next;
    });

    if (
      appState.selectedWorkspaceId === workspaceId
      && appState.selectedSessionId === sessionId
    ) {
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

  async function selectSession(workspaceId, sessionId, options = {}) {
    await openSessionInPane(workspaceId, sessionId, options);
  }

  async function focusPane(paneId) {
    const pane = paneLayout.panes.find((entry) => entry.id === paneId);
    if (!pane) {
      return;
    }

    if (!pane.sessionId || !pane.workspaceId) {
      setPaneLayout((current) => focusPaneInLayout(current, paneId));
      return;
    }

    await openSessionInPane(pane.workspaceId, pane.sessionId, { paneId, preferPaneId: true });
  }

  function clearPane(paneId) {
    setPaneLayout((current) => removePaneFromLayout(current, paneId));
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

  async function handleMarkdownCopyClick(button) {
    const copyShell = button.closest('[data-markdown-copy-shell="true"]');
    if (!(copyShell instanceof HTMLElement)) {
      return;
    }

    const textToCopy = getMarkdownCopyText(copyShell);
    if (!textToCopy) {
      return;
    }

    try {
      await copyTextToClipboard(textToCopy);
      flashMarkdownCopyButton(button);
    } catch (error) {
      setSidebarError(error?.message || (language === 'zh' ? '复制失败。' : 'Copy failed.'));
    }
  }

  async function pickComposerAttachments() {
    if (!desktopClient || isBootstrapping) {
      return;
    }

    try {
      const pickedAttachments = await desktopClient.pickAttachments();
      if (!Array.isArray(pickedAttachments) || pickedAttachments.length === 0) {
        return;
      }

      setComposerAttachments((current) => mergeComposerAttachments(current, pickedAttachments));
      focusComposer();
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  async function pickAttachmentsForPane() {
    if (!desktopClient || isBootstrapping) {
      return [];
    }

    try {
      const pickedAttachments = await desktopClient.pickAttachments();
      return Array.isArray(pickedAttachments) ? pickedAttachments : [];
    } catch (error) {
      setSidebarError(error.message);
      return [];
    }
  }

  async function pasteComposerAttachments(clipboardData) {
    if (!desktopClient || isBootstrapping) {
      return false;
    }

    const clipboardFiles = getClipboardFiles(clipboardData);
    if (clipboardFiles.length === 0) {
      return false;
    }

    try {
      const preparedAttachments = await Promise.all(clipboardFiles.map((file) => createPastedAttachmentPayload(file)));
      const nextAttachments = await desktopClient.preparePastedAttachments({
        attachments: preparedAttachments.filter(Boolean),
      });

      if (!Array.isArray(nextAttachments) || nextAttachments.length === 0) {
        return false;
      }

      setComposerAttachments((current) => mergeComposerAttachments(current, nextAttachments));
      focusComposer();
      return true;
    } catch (error) {
      setSidebarError(error.message);
      return false;
    }
  }

  async function preparePastedAttachmentsForPane(clipboardData) {
    if (!desktopClient || isBootstrapping) {
      return [];
    }

    const clipboardFiles = getClipboardFiles(clipboardData);
    if (clipboardFiles.length === 0) {
      return [];
    }

    try {
      const preparedAttachments = await Promise.all(clipboardFiles.map((file) => createPastedAttachmentPayload(file)));
      const nextAttachments = await desktopClient.preparePastedAttachments({
        attachments: preparedAttachments.filter(Boolean),
      });
      return Array.isArray(nextAttachments) ? nextAttachments : [];
    } catch (error) {
      setSidebarError(error.message);
      return [];
    }
  }

  function removeComposerAttachment(attachmentPath) {
    setComposerAttachments((current) => current.filter((attachment) => attachment.path !== attachmentPath));
    focusComposer();
  }

  function applyComposerHistory(direction) {
    if (!composerHistoryEntries.length) {
      return false;
    }

    let nextIndex = composerHistoryIndex;

    if (direction === 'previous') {
      nextIndex = composerHistoryIndex < 0
        ? 0
        : Math.min(composerHistoryIndex + 1, composerHistoryEntries.length - 1);
    } else if (direction === 'next') {
      if (composerHistoryIndex < 0) {
        return false;
      }

      nextIndex = composerHistoryIndex - 1;
    } else {
      return false;
    }

    if (nextIndex < 0) {
      setComposerHistoryIndex(-1);
      setInputValue('');
      focusComposer();
      return true;
    }

    const nextEntry = composerHistoryEntries[nextIndex];
    if (!nextEntry) {
      return false;
    }

    setComposerHistoryIndex(nextIndex);
    setInputValue(nextEntry);
    focusComposer();
    return true;
  }

  function applySlashCommand(command) {
    if (!command) {
      return;
    }

    setComposerHistoryIndex(-1);
    setInputValue(command.template);
    focusComposer();
  }

  async function updateCurrentSessionModel(nextModel, { clearInput = false } = {}) {
    if (!desktopClient || !focusedWorkspace || !focusedSession) {
      throw new Error(language === 'zh' ? '请先打开一个对话。' : 'Open a conversation first.');
    }

    setIsUpdatingModel(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.updateSessionModel({
        model: nextModel,
        sessionId: focusedSession.id,
        workspaceId: focusedWorkspace.id,
      });
      setAppState(nextState);

      if (clearInput) {
        setComposerHistoryIndex(-1);
        setInputValue('');
      }
    } finally {
      setIsUpdatingModel(false);
    }
  }

  async function updateCurrentSessionProvider(nextProvider, { clearInput = false } = {}) {
    if (!desktopClient || !focusedWorkspace || !focusedSession) {
      throw new Error(language === 'zh' ? '请先打开一个对话。' : 'Open a conversation first.');
    }

    setIsUpdatingProvider(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.updateSessionProvider({
        provider: nextProvider,
        sessionId: focusedSession.id,
        workspaceId: focusedWorkspace.id,
      });
      setAppState(nextState);

      if (clearInput) {
        setComposerHistoryIndex(-1);
        setInputValue('');
      }
    } finally {
      setIsUpdatingProvider(false);
    }
  }

  async function updateCurrentSessionPermissionMode(nextPermissionMode, { clearInput = false } = {}) {
    if (!desktopClient || !focusedWorkspace || !focusedSession) {
      throw new Error(language === 'zh' ? '请先打开一个对话。' : 'Open a conversation first.');
    }

    setIsUpdatingPermissionMode(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.updateSessionPermissionMode({
        permissionMode: nextPermissionMode,
        sessionId: focusedSession.id,
        workspaceId: focusedWorkspace.id,
      });
      setAppState(nextState);

      if (clearInput) {
        setComposerHistoryIndex(-1);
        setInputValue('');
      }
    } finally {
      setIsUpdatingPermissionMode(false);
    }
  }

  async function setProviderEnabled(provider, enabled) {
    if (!desktopClient) {
      throw new Error(copy.bridgeUnavailable);
    }

    setIsUpdatingProviderSettings(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.setProviderEnabled({
        enabled,
        provider,
      });
      setAppState(nextState);
    } catch (error) {
      setSidebarError(error.message);
    } finally {
      setIsUpdatingProviderSettings(false);
    }
  }

  async function submitPrompt(prompt, { attachments = [], displayKind = '', displayPrompt, displayTitle = '' } = {}) {
    if (!desktopClient) {
      return;
    }

    const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    const normalizedAttachments = normalizeComposerAttachments(attachments);
    if (!normalizedPrompt && normalizedAttachments.length === 0) {
      return;
    }

    if (!focusedSession || !focusedWorkspace) {
      setSidebarError(
        language === 'zh'
          ? '请先创建或选择一个会话，或输入 /clear。'
          : 'Create or select a session first, or type /clear.',
      );
      return;
    }

    if (focusedSession.isRunning) {
      setSidebarError(
        language === 'zh'
          ? '当前对话仍在运行，请先停止或等待完成。'
          : 'This conversation is still running. Stop it or wait for it to finish first.',
      );
      return;
    }

    markPaneSending(focusedPane?.id);
    setSidebarError('');
    setComposerAttachments([]);
    setComposerHistoryIndex(-1);
    setInputValue('');

    try {
      await desktopClient.sendMessage({
        attachments: normalizedAttachments,
        displayKind,
        displayPrompt,
        displayTitle,
        prompt: normalizedPrompt,
        sessionId: focusedSession.id,
        workspaceId: focusedWorkspace.id,
      });
    } catch (error) {
      clearPaneSending(focusedPane?.id);
      setComposerAttachments(normalizedAttachments);
      setComposerHistoryIndex(-1);
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
        setComposerHistoryIndex(-1);
        setInputValue('/');
        focusComposer();
        return true;
      }

      if (commandName === 'clear') {
        if (!focusedWorkspace && !selectedWorkspace) {
          throw new Error(language === 'zh' ? '请先选择一个工作目录。' : 'Select a workspace first.');
        }

        await createSession((focusedWorkspace || selectedWorkspace).id);
        setComposerHistoryIndex(-1);
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
        setComposerHistoryIndex(-1);
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
        if (!focusedWorkspace || !focusedSession) {
          throw new Error(language === 'zh' ? '请先创建或选择一个对话。' : 'Create or select a conversation first.');
        }

        if (!parsedCommand.args) {
          throw new Error(language === 'zh' ? '请使用 /mcp list、/mcp get <name>、/mcp add ... 或 /mcp remove <name>。' : 'Use /mcp list, /mcp get <name>, /mcp add ..., or /mcp remove <name>.');
        }

        const nextState = await desktopClient.runMcpCommand({
          args: parsedCommand.args,
          sessionId: focusedSession.id,
          workspaceId: focusedWorkspace.id,
        });
        setAppState(nextState);
        setComposerHistoryIndex(-1);
        setInputValue('');
        return true;
      }

      if (commandName === 'skills') {
        if (!focusedWorkspace || !focusedSession) {
          throw new Error(language === 'zh' ? '请先创建或选择一个对话。' : 'Create or select a conversation first.');
        }

        const tokens = tokenizeSlashArgs(parsedCommand.args);
        const action = (tokens[0] || 'list').toLowerCase();

        if (action === 'list') {
          const nextState = await desktopClient.listSkills({
            sessionId: focusedSession.id,
            workspaceId: focusedWorkspace.id,
          });
          setAppState(nextState);
          setComposerHistoryIndex(-1);
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
            sessionId: focusedSession.id,
            workspaceId: focusedWorkspace.id,
          });
          setAppState(nextState);
          setComposerHistoryIndex(-1);
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
    if (!prompt && composerAttachments.length === 0) {
      return;
    }

    if (prompt.startsWith('/')) {
      const commandHandled = await runSlashCommand(prompt);
      if (commandHandled) {
        return;
      }
    }

    await submitPrompt(prompt, { attachments: composerAttachments });
  }

  function getPaneContext(paneId) {
    const pane = paneViews.find((entry) => entry.id === paneId) || null;
    if (!pane) {
      return null;
    }

    return {
      pane,
      session: pane.session || null,
      workspace: pane.workspace || null,
    };
  }

  function markPaneSending(paneId) {
    if (!paneId) {
      return;
    }

    setSendingPaneIds((current) => (
      current.includes(paneId) ? current : [...current, paneId]
    ));
  }

  function clearPaneSending(paneId) {
    if (!paneId) {
      return;
    }

    setSendingPaneIds((current) => current.filter((id) => id !== paneId));
  }

  async function submitPromptForPane(paneId, prompt, {
    attachments = [],
    displayKind = '',
    displayPrompt,
    displayTitle = '',
  } = {}) {
    if (!desktopClient) {
      return false;
    }

    const context = getPaneContext(paneId);
    const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    const normalizedAttachments = normalizeComposerAttachments(attachments);
    if (!normalizedPrompt && normalizedAttachments.length === 0) {
      return false;
    }

    if (!context?.session || !context.workspace) {
      setSidebarError(
        language === 'zh'
          ? '请先在这个分屏里创建或选择一个会话。'
          : 'Create or select a conversation in this pane first.',
      );
      return false;
    }

    if (context.pane?.isBusy) {
      setSidebarError(
        language === 'zh'
          ? '这个分屏里的对话仍在运行，请先停止或等待完成。'
          : 'This conversation is still running. Stop it or wait for it to finish first.',
      );
      return false;
    }

    markPaneSending(paneId);
    setSidebarError('');

    try {
      await desktopClient.sendMessage({
        attachments: normalizedAttachments,
        displayKind,
        displayPrompt,
        displayTitle,
        prompt: normalizedPrompt,
        sessionId: context.session.id,
        workspaceId: context.workspace.id,
      });
      return true;
    } catch (error) {
      clearPaneSending(paneId);
      setSidebarError(error.message);
      return false;
    }
  }

  async function updateSessionModelForPane(paneId, nextModel) {
    if (!desktopClient) {
      return;
    }

    const context = getPaneContext(paneId);
    if (!context?.workspace || !context.session) {
      throw new Error(language === 'zh' ? '请先打开一个对话。' : 'Open a conversation first.');
    }

    setIsUpdatingModel(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.updateSessionModel({
        model: nextModel,
        sessionId: context.session.id,
        workspaceId: context.workspace.id,
      });
      setAppState(nextState);
    } finally {
      setIsUpdatingModel(false);
    }
  }

  async function updateSessionProviderForPane(paneId, nextProvider) {
    if (!desktopClient) {
      return;
    }

    const context = getPaneContext(paneId);
    if (!context?.workspace || !context.session) {
      throw new Error(language === 'zh' ? '请先打开一个对话。' : 'Open a conversation first.');
    }

    setIsUpdatingProvider(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.updateSessionProvider({
        provider: nextProvider,
        sessionId: context.session.id,
        workspaceId: context.workspace.id,
      });
      setAppState(nextState);
    } finally {
      setIsUpdatingProvider(false);
    }
  }

  async function updateSessionPermissionModeForPane(paneId, nextPermissionMode) {
    if (!desktopClient) {
      return;
    }

    const context = getPaneContext(paneId);
    if (!context?.workspace || !context.session) {
      throw new Error(language === 'zh' ? '请先打开一个对话。' : 'Open a conversation first.');
    }

    setIsUpdatingPermissionMode(true);
    setSidebarError('');

    try {
      const nextState = await desktopClient.updateSessionPermissionMode({
        permissionMode: nextPermissionMode,
        sessionId: context.session.id,
        workspaceId: context.workspace.id,
      });
      setAppState(nextState);
    } finally {
      setIsUpdatingPermissionMode(false);
    }
  }

  async function runSlashCommandForPane(paneId, rawInput) {
    const parsedCommand = parseSlashCommand(rawInput);
    if (!parsedCommand) {
      return {
        handled: false,
      };
    }

    const context = getPaneContext(paneId);
    const commandName = resolveSlashCommandName(parsedCommand.name);
    const installedSkill = findInstalledSkillCommand(parsedCommand.name, installedSkills);
    if (!commandName && !installedSkill) {
      setSidebarError(formatUnknownSlashCommand(parsedCommand.name, language));
      return { handled: true };
    }

    setSidebarError('');

    try {
      if (commandName === 'help') {
        return {
          handled: true,
          nextInputValue: '/',
        };
      }

      if (commandName === 'clear') {
        const targetWorkspace = context?.workspace || focusedWorkspace || selectedWorkspace;
        if (!targetWorkspace) {
          throw new Error(language === 'zh' ? '请先选择一个工作目录。' : 'Select a workspace first.');
        }

        await createSession(targetWorkspace.id, { paneId });
        return {
          handled: true,
          nextInputValue: '',
        };
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
        return {
          handled: true,
          nextInputValue: '',
        };
      }

      if (commandName === 'model') {
        if (!context?.workspace || !context.session) {
          throw new Error(language === 'zh' ? '请先创建或选择一个对话。' : 'Create or select a conversation first.');
        }

        if (!parsedCommand.args) {
          throw new Error(
            language === 'zh'
              ? '请使用 /model <模型名>，或 /model default 恢复默认模型。'
              : 'Use /model <name>, or /model default to restore the default model.',
          );
        }

        setIsUpdatingModel(true);
        try {
          const nextState = await desktopClient.updateSessionModel({
            model: normalizeModelCommandArg(parsedCommand.args),
            sessionId: context.session.id,
            workspaceId: context.workspace.id,
          });
          setAppState(nextState);
        } finally {
          setIsUpdatingModel(false);
        }

        return {
          handled: true,
          nextInputValue: '',
        };
      }

      if (commandName === 'provider') {
        if (!context?.workspace || !context.session) {
          throw new Error(language === 'zh' ? '请先创建或选择一个对话。' : 'Create or select a conversation first.');
        }

        const nextProvider = normalizeProviderCommandArg(parsedCommand.args);
        if (!nextProvider) {
          throw new Error(language === 'zh' ? '请使用 /provider claude 或 /provider codex。' : 'Use /provider claude or /provider codex.');
        }

        setIsUpdatingProvider(true);
        try {
          const nextState = await desktopClient.updateSessionProvider({
            provider: nextProvider,
            sessionId: context.session.id,
            workspaceId: context.workspace.id,
          });
          setAppState(nextState);
        } finally {
          setIsUpdatingProvider(false);
        }

        return {
          handled: true,
          nextInputValue: '',
        };
      }

      if (commandName === 'mcp') {
        if (!context?.workspace || !context.session) {
          throw new Error(language === 'zh' ? '请先创建或选择一个对话。' : 'Create or select a conversation first.');
        }

        if (!parsedCommand.args) {
          throw new Error(language === 'zh' ? '请使用 /mcp list、/mcp get <name>、/mcp add ... 或 /mcp remove <name>。' : 'Use /mcp list, /mcp get <name>, /mcp add ..., or /mcp remove <name>.');
        }

        const nextState = await desktopClient.runMcpCommand({
          args: parsedCommand.args,
          sessionId: context.session.id,
          workspaceId: context.workspace.id,
        });
        setAppState(nextState);
        return {
          handled: true,
          nextInputValue: '',
        };
      }

      if (commandName === 'skills') {
        if (!context?.workspace || !context.session) {
          throw new Error(language === 'zh' ? '请先创建或选择一个对话。' : 'Create or select a conversation first.');
        }

        const tokens = tokenizeSlashArgs(parsedCommand.args);
        const action = (tokens[0] || 'list').toLowerCase();

        if (action === 'list') {
          const nextState = await desktopClient.listSkills({
            sessionId: context.session.id,
            workspaceId: context.workspace.id,
          });
          setAppState(nextState);
          return {
            handled: true,
            nextInputValue: '',
          };
        }

        if (action === 'install') {
          const installArgs = parsedCommand.args.slice(parsedCommand.args.toLowerCase().indexOf('install') + 'install'.length).trim();
          if (!installArgs) {
            throw new Error(language === 'zh' ? '请使用 /skills install <path> [--scope user|project]。' : 'Use /skills install <path> [--scope user|project].');
          }

          const nextState = await desktopClient.installSkill({
            args: installArgs,
            sessionId: context.session.id,
            workspaceId: context.workspace.id,
          });
          setAppState(nextState);
          return {
            handled: true,
            nextInputValue: '',
          };
        }

        throw new Error(language === 'zh' ? '当前只支持 /skills list 和 /skills install <path> [--scope user|project]。' : 'Currently supported: /skills list and /skills install <path> [--scope user|project].');
      }

      if (installedSkill) {
        const handled = await submitPromptForPane(
          paneId,
          buildSkillInvocationPrompt(installedSkill, parsedCommand.args, language),
          {
            displayKind: 'command',
            displayPrompt: rawInput.trim(),
            displayTitle: rawInput.trim(),
          },
        );

        return {
          handled,
          nextInputValue: handled ? '' : rawInput,
        };
      }
    } catch (error) {
      setSidebarError(error.message);
      return {
        handled: true,
      };
    }

    return {
      handled: false,
    };
  }

  async function stopRun() {
    if (!focusedPane?.id) {
      return;
    }

    await stopRunForPane(focusedPane.id);
  }

  async function stopRunForPane(paneId) {
    if (!desktopClient) {
      return;
    }

    const context = getPaneContext(paneId);
    if (!context?.workspace || !context.session || !context.pane?.isBusy) {
      return;
    }

    try {
      const nextState = await desktopClient.stopRun({
        sessionId: context.session.id,
        workspaceId: context.workspace.id,
      });
      setAppState(nextState);
      clearPaneSending(paneId);
    } catch (error) {
      setSidebarError(error.message);
    }
  }

  async function respondToApproval(requestId, decision) {
    if (!desktopClient || !requestId) {
      return;
    }

    setPendingApprovalActionId(requestId);
    setSidebarError('');

    try {
      const nextState = await desktopClient.respondToApproval({ decision, requestId });
      setAppState(nextState);
    } catch (error) {
      setSidebarError(error.message);
      setPendingApprovalActionId('');
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
    && focusedWorkspace
    && !focusedSession?.isRunning
    && (trimmedInputValue || hasComposerAttachments)
    && (focusedSession || trimmedInputValue.startsWith('/')),
  );

  function dismissToast(toastId) {
    setToastItems((current) => current.filter((item) => item.id !== toastId));
  }

  function setSidebarError(nextError) {
    const message = normalizeToastMessage(nextError);
    if (!message) {
      return;
    }

    setToastItems((current) => appendToast(current, {
      message,
      tone: 'error',
    }));
  }

  function toggleSidebarCollapse() {
    setIsSidebarCollapsed((current) => !current);
    setSidebarFlyoutView(null);
  }

  function toggleSidebarFlyout(nextView) {
    if (!isSidebarCollapsed) {
      return;
    }

    setSidebarFlyoutView((current) => (current === nextView ? null : nextView));
  }

  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--card)/0.88)_0%,transparent_18%,transparent_82%,hsl(var(--background)/0.96)_100%)]" />
      <ToastViewport items={toastItems} onDismiss={dismissToast} />

      <div className={cn('drag-region fixed inset-x-0 top-0 z-40 bg-transparent', topBarHeightClass)} />

      <main
        className={cn(
          'relative flex h-full w-full overflow-hidden',
          topBarOffsetClass,
        )}
      >
        {isSidebarCollapsed ? (
          <aside
            ref={collapsedSidebarRef}
            className="relative z-20 flex shrink-0 flex-col overflow-visible border-r border-border/70 bg-background/70"
            style={{ minWidth: SIDEBAR_COLLAPSED_WIDTH, width: SIDEBAR_COLLAPSED_WIDTH }}
          >
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              title={formatShortcutTooltip(copy.expandSidebar, 'B', appState.platform)}
              aria-label={copy.expandSidebar}
              className="absolute -right-3 top-4 z-40 inline-flex h-8 w-6 items-center justify-center rounded-full border border-border/80 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            <div className="flex h-full flex-col items-center gap-2 px-2 py-3">
              <div className="flex flex-col items-center gap-1.5">
                {sidebarProviderStatuses.map(({ info, key }) => (
                  <div
                    key={key}
                    title={formatProviderStatusTitle(info, language)}
                    className={cn(
                      'relative flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm',
                      getProviderStatusTone(info) === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-destructive/20 bg-destructive/10 text-destructive',
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                      {getCompactProviderMonogram(key)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full',
                        getProviderStatusTone(info) === 'success' ? 'bg-emerald-500' : 'bg-destructive',
                      )}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-3 flex w-full flex-col items-center gap-2">
                {hasHiddenPanes ? (
                  <SidebarRailButton
                    active={sidebarFlyoutView === SIDEBAR_VIEW_HIDDEN_PANES}
                    ariaLabel={copy.paneOverflowTrigger(hiddenPaneViews.length)}
                    badge={hiddenPaneViews.length}
                    icon={Blocks}
                    onClick={() => toggleSidebarFlyout(SIDEBAR_VIEW_HIDDEN_PANES)}
                    title={copy.paneOverflowTrigger(hiddenPaneViews.length)}
                  />
                ) : null}
                <SidebarRailButton
                  active={sidebarFlyoutView === SIDEBAR_VIEW_WORKSPACES}
                  ariaLabel={copy.workspaceSection}
                  icon={Folder}
                  onClick={() => toggleSidebarFlyout(SIDEBAR_VIEW_WORKSPACES)}
                  title={copy.workspaceSection}
                />
              </div>

              <div className="mt-auto flex w-full flex-col items-center gap-2 pb-1">
                <span
                  className="inline-flex"
                  title={formatPaneSplitControlTooltip(copy, maxPaneCount, appState.platform)}
                >
                  <SidebarRailButton
                    ariaLabel={copy.paneSplitAdd}
                    disabled={!desktopClient || paneLayout.panes.length >= maxPaneCount}
                    icon={Columns2}
                    onClick={addPane}
                    title={formatPaneSplitControlTooltip(copy, maxPaneCount, appState.platform)}
                  />
                </span>
                <SidebarRailButton
                  ariaLabel={copy.settings}
                  icon={Settings}
                  onClick={() => {
                    setSidebarFlyoutView(null);
                    setIsSettingsOpen(true);
                  }}
                  title={copy.settings}
                />
              </div>
            </div>

            {sidebarFlyoutView ? (
              <SidebarFlyoutPanel panelRef={sidebarFlyoutRef}>
                {sidebarFlyoutView === SIDEBAR_VIEW_HIDDEN_PANES ? hiddenPaneSection : workspaceSidebarSection}
              </SidebarFlyoutPanel>
            ) : null}
          </aside>
        ) : (
          <aside
            className="relative z-20 flex shrink-0 flex-col overflow-visible border-r border-border/70 bg-background/60"
            style={{ minWidth: SIDEBAR_EXPANDED_WIDTH, width: SIDEBAR_EXPANDED_WIDTH }}
          >
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              title={formatShortcutTooltip(copy.collapseSidebar, 'B', appState.platform)}
              aria-label={copy.collapseSidebar}
              className="absolute -right-3 top-4 z-30 inline-flex h-8 w-6 items-center justify-center rounded-full border border-border/80 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <div className="relative z-20 overflow-visible border-b border-border/70 px-3 py-3">
              <div className="pr-2">
                <div className="relative pr-20">
                  <div className="flex items-center gap-1.5">
                    {sidebarProviderStatuses.map(({ info, key }) => (
                      <StatusPill
                        key={key}
                        tone={getProviderStatusTone(info)}
                        label={formatProviderStatusLabel(info, language)}
                        title={formatProviderStatusTitle(info, language)}
                      />
                    ))}
                  </div>
                  <div className={SIDEBAR_ACTION_SLOT_CLASS}>
                    <span
                      className="inline-flex"
                      title={formatPaneSplitControlTooltip(copy, maxPaneCount, appState.platform)}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={addPane}
                        disabled={!desktopClient || paneLayout.panes.length >= maxPaneCount}
                        aria-label={copy.paneSplitAdd}
                        className={cn(SIDEBAR_ACTION_BUTTON_CLASS, 'hover:bg-background/70')}
                      >
                        <Columns2 className="h-4 w-4" />
                      </Button>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsSettingsOpen(true)}
                      aria-label={copy.settings}
                      title={copy.settings}
                      className={cn(SIDEBAR_ACTION_BUTTON_CLASS, 'hover:bg-background/70')}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
              <div className="space-y-5 pr-2">
                {hiddenPaneSection}
                {workspaceSidebarSection}
              </div>
            </div>
          </aside>
        )}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background/35">
          <div className="min-h-0 flex-1 overflow-hidden">
            {appState.workspaces.length === 0 ? (
              <ConversationEmptyState
                icon={Folder}
                title={copy.startByAddingWorkspace}
                description={copy.startByAddingWorkspaceDescription}
              />
            ) : (
              <div
                ref={setPaneBoardElement}
                className="grid h-full min-h-0 gap-px bg-border/70"
                style={{
                  gridTemplateColumns: `repeat(${paneGridSpec.columns}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${paneGridSpec.rows}, minmax(0, 1fr))`,
                }}
              >
                {visiblePaneViews.map((pane, paneIndex) => (
                  <ConversationPane
                    key={pane.id}
                    canClear={!pane.isBusy}
                    copy={copy}
                    language={language}
                    maxPaneCount={maxPaneCount}
                    onCreateSession={(workspaceId) => createSession(workspaceId, { paneId: pane.id })}
                    pane={pane}
                    paneNumber={paneIndex + 1}
                    paneShortcutLabel={getPaneHeaderLabel(appState.platform, paneIndex + 1)}
                    onClear={() => clearPane(pane.id)}
                    onFocus={() => {
                      void focusPane(pane.id);
                    }}
                    onApprovalDecision={respondToApproval}
                    onPickAttachments={pickAttachmentsForPane}
                    platform={appState.platform}
                    onPreparePastedAttachments={preparePastedAttachmentsForPane}
                    onRunSlashCommand={runSlashCommandForPane}
                    onSendMessage={submitPromptForPane}
                    onStopRun={stopRunForPane}
                    onUpdateSessionProvider={updateSessionProviderForPane}
                    onUpdateSessionModel={updateSessionModelForPane}
                    onUpdateSessionPermissionMode={updateSessionPermissionModeForPane}
                    defaultProvider={appState.defaultProvider}
                    providerCatalog={providerCatalog}
                    isUpdatingModel={isUpdatingModel}
                    isUpdatingPermissionMode={isUpdatingPermissionMode}
                    isUpdatingProvider={isUpdatingProvider}
                    pendingApprovalActionId={pendingApprovalActionId}
                    registerViewport={(node) => setPaneViewportNode(paneViewportRefs, pane.id, node)}
                    slashCommands={slashCommands}
                  />
                ))}
              </div>
            )}
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

      {isSettingsOpen && (
        <SettingsDialog
          copy={copy}
          isUpdatingProviders={isUpdatingProviderSettings}
          language={language}
          providerSettings={providerSettings}
          platform={appState.platform}
          themePreference={themePreference}
          onClose={() => setIsSettingsOpen(false)}
          onLanguageChange={setLanguage}
          onSetProviderEnabled={setProviderEnabled}
          onThemeChange={setThemePreference}
        />
      )}
    </div>
  );
}

function ConversationPane({
  canClear,
  copy,
  defaultProvider,
  isUpdatingModel,
  isUpdatingPermissionMode,
  isUpdatingProvider,
  language,
  onCreateSession,
  onApprovalDecision,
  onClear,
  onFocus,
  onPickAttachments,
  platform,
  onPreparePastedAttachments,
  onRunSlashCommand,
  onSendMessage,
  onStopRun,
  onUpdateSessionProvider,
  onUpdateSessionModel,
  onUpdateSessionPermissionMode,
  pane,
  paneNumber,
  paneShortcutLabel,
  pendingApprovalActionId,
  providerCatalog,
  registerViewport,
  slashCommands,
}) {
  const [inputValue, setInputValue] = useState('');
  const [composerAttachments, setComposerAttachments] = useState([]);
  const [composerHistoryIndex, setComposerHistoryIndex] = useState(-1);
  const [isComposerTextareaFocused, setIsComposerTextareaFocused] = useState(false);
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);
  const [isModePickerOpen, setIsModePickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const providerPickerRef = useRef(null);
  const modePickerRef = useRef(null);
  const modelPickerRef = useRef(null);
  const slashMenuRef = useRef(null);
  const textareaRef = useRef(null);
  const slashCommandQuery = useMemo(() => getSlashCommandQuery(inputValue), [inputValue]);
  const visibleSlashCommands = useMemo(
    () => filterSlashCommands(slashCommands, slashCommandQuery),
    [slashCommandQuery, slashCommands],
  );
  const highlightedSlashCommand = visibleSlashCommands[selectedSlashCommandIndex] || visibleSlashCommands[0] || null;
  const isSlashCommandMenuOpen = pane.isFocused && slashCommandQuery !== null;
  const hasFloatingOverlayOpen = isSlashCommandMenuOpen || isProviderPickerOpen || isModePickerOpen || isModelPickerOpen;
  const hasComposerAttachments = composerAttachments.length > 0;
  const composerHistoryEntries = useMemo(
    () => getComposerHistoryEntries(pane.session?.messages || []),
    [pane.session?.messages],
  );
  const trimmedInputValue = inputValue.trim();
  const isProviderLocked = Boolean(
    pane.sessionMeta?.providerLocked
    || isSessionProviderLocked(pane.session),
  );
  const rawSessionProvider = normalizeProviderKey(pane.session?.provider || defaultProvider || 'claude');
  const availableEnabledProviderKeys = useMemo(
    () => getAvailableEnabledProviderKeys(providerCatalog),
    [providerCatalog],
  );
  const sessionProvider = isProviderLocked
    ? rawSessionProvider
    : resolveProviderSelection(providerCatalog, rawSessionProvider, defaultProvider || 'claude');
  const providerInfo = getProviderInfo(providerCatalog, sessionProvider, 'claude');
  const providerOptions = useMemo(
    () => getComposerProviderOptions(copy, providerCatalog),
    [copy, providerCatalog],
  );
  const showProviderPicker = Boolean(
    pane.session
    && !isProviderLocked
    && availableEnabledProviderKeys.length > 1,
  );
  const isSessionProviderEnabled = providerInfo.enabled !== false;
  const canUseSessionProvider = !pane.session || isSessionProviderEnabled;
  const canSend = Boolean(
    !pane.isBusy
    && pane.workspace
    && canUseSessionProvider
    && (trimmedInputValue || hasComposerAttachments)
    && (pane.session || trimmedInputValue.startsWith('/')),
  );
  const supportsPermissionMode = sessionProvider === 'claude';
  const currentProviderDisplay = providerInfo.label || getProviderDisplayName(sessionProvider, copy);
  const lockedProviderChipLabel = getLockedProviderChipLabel(sessionProvider);
  const availableProviderModels = Array.isArray(providerInfo.models) ? providerInfo.models : [];
  const sessionPermissionMode = pane.session?.permissionMode || 'default';
  const modeOptions = useMemo(() => getComposerSessionModeOptions(copy), [copy]);
  const currentModeDisplay = useMemo(
    () => getSessionModeLabel(sessionPermissionMode, copy),
    [copy, sessionPermissionMode],
  );
  const effectiveCurrentModel = pane.session?.currentModel || pane.session?.model || '';
  const modelOptions = useMemo(
    () => getComposerModelOptions(copy, sessionProvider, pane.session?.model || '', effectiveCurrentModel, availableProviderModels),
    [availableProviderModels, copy, effectiveCurrentModel, pane.session?.model, sessionProvider],
  );
  const currentModelDisplay = useMemo(
    () => getModelDisplayName(effectiveCurrentModel, availableProviderModels, sessionProvider) || copy.modelOptionDefault,
    [availableProviderModels, copy.modelOptionDefault, effectiveCurrentModel, sessionProvider],
  );
  const currentModelCommandValue = useMemo(
    () => ((pane.session?.model || '').trim() || 'default'),
    [pane.session?.model],
  );
  useEffect(() => {
    setComposerAttachments([]);
    setComposerHistoryIndex(-1);
    setIsComposerTextareaFocused(false);
    setInputValue('');
  }, [pane.session?.id]);

  useEffect(() => {
    if (!pane.isFocused) {
      setIsProviderPickerOpen(false);
      setIsModePickerOpen(false);
      setIsModelPickerOpen(false);
    }
  }, [pane.isFocused]);

  useEffect(() => {
    if (isProviderLocked || !showProviderPicker) {
      setIsProviderPickerOpen(false);
    }
  }, [isProviderLocked, showProviderPicker]);

  useEffect(() => {
    if ((!isProviderPickerOpen && !isModePickerOpen && !isModelPickerOpen) || typeof document === 'undefined') {
      return undefined;
    }

    const isInsidePicker = (target) => (
      providerPickerRef.current?.contains(target)
      || modePickerRef.current?.contains(target)
      || modelPickerRef.current?.contains(target)
    );

    const closePickersOnOutsidePointer = (event) => {
      if (isInsidePicker(event.target)) {
        return;
      }

      setIsProviderPickerOpen(false);
      setIsModePickerOpen(false);
      setIsModelPickerOpen(false);
    };

    const closePickersOnFocusMove = (event) => {
      if (isInsidePicker(event.target)) {
        return;
      }

      setIsProviderPickerOpen(false);
      setIsModePickerOpen(false);
      setIsModelPickerOpen(false);
    };

    const closePickersOnEscape = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      setIsProviderPickerOpen(false);
      setIsModePickerOpen(false);
      setIsModelPickerOpen(false);
    };

    const closePickersOnWindowBlur = () => {
      setIsProviderPickerOpen(false);
      setIsModePickerOpen(false);
      setIsModelPickerOpen(false);
    };

    document.addEventListener('pointerdown', closePickersOnOutsidePointer);
    document.addEventListener('focusin', closePickersOnFocusMove);
    document.addEventListener('keydown', closePickersOnEscape);
    window.addEventListener('blur', closePickersOnWindowBlur);

    return () => {
      document.removeEventListener('pointerdown', closePickersOnOutsidePointer);
      document.removeEventListener('focusin', closePickersOnFocusMove);
      document.removeEventListener('keydown', closePickersOnEscape);
      window.removeEventListener('blur', closePickersOnWindowBlur);
    };
  }, [isModePickerOpen, isModelPickerOpen, isProviderPickerOpen]);

  useEffect(() => {
    setSelectedSlashCommandIndex(0);
  }, [slashCommandQuery]);

  useEffect(() => {
    if (!isSlashCommandMenuOpen) {
      return;
    }

    const menu = slashMenuRef.current;
    if (!menu) {
      return;
    }

    const highlightedItem = menu.querySelector('[data-slash-command-highlighted="true"]');
    highlightedItem?.scrollIntoView({
      block: 'nearest',
    });
  }, [highlightedSlashCommand?.name, isSlashCommandMenuOpen]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [inputValue]);

  function applySlashCommand(command) {
    if (!command) {
      return;
    }

    setComposerHistoryIndex(-1);
    setInputValue(command.template);
  }

  function applyComposerHistory(direction) {
    if (!composerHistoryEntries.length) {
      return false;
    }

    let nextIndex = composerHistoryIndex;

    if (direction === 'previous') {
      nextIndex = composerHistoryIndex < 0
        ? 0
        : Math.min(composerHistoryIndex + 1, composerHistoryEntries.length - 1);
    } else if (direction === 'next') {
      if (composerHistoryIndex < 0) {
        return false;
      }

      nextIndex = composerHistoryIndex - 1;
    } else {
      return false;
    }

    if (nextIndex < 0) {
      setComposerHistoryIndex(-1);
      setInputValue('');
      return true;
    }

    const nextEntry = composerHistoryEntries[nextIndex];
    if (!nextEntry) {
      return false;
    }

    setComposerHistoryIndex(nextIndex);
    setInputValue(nextEntry);
    return true;
  }

  async function handlePickAttachments() {
    const pickedAttachments = await onPickAttachments?.();
    if (!Array.isArray(pickedAttachments) || pickedAttachments.length === 0) {
      return;
    }

    setComposerAttachments((current) => mergeComposerAttachments(current, pickedAttachments));
  }

  async function handlePasteAttachments(clipboardData) {
    const nextAttachments = await onPreparePastedAttachments?.(clipboardData);
    if (!Array.isArray(nextAttachments) || nextAttachments.length === 0) {
      return false;
    }

    setComposerAttachments((current) => mergeComposerAttachments(current, nextAttachments));
    return true;
  }

  async function handleSend() {
    if (!canUseSessionProvider) {
      return;
    }

    if (!trimmedInputValue && composerAttachments.length === 0) {
      return;
    }

    if (trimmedInputValue.startsWith('/')) {
      const result = await onRunSlashCommand?.(pane.id, trimmedInputValue);
      if (result?.handled) {
        if (typeof result.nextInputValue === 'string') {
          setInputValue(result.nextInputValue);
          if (result.nextInputValue === '') {
            setComposerAttachments([]);
            setComposerHistoryIndex(-1);
          }
        }
        return;
      }
    }

    const didSend = await onSendMessage?.(pane.id, trimmedInputValue, {
      attachments: composerAttachments,
    });

    if (didSend) {
      setComposerAttachments([]);
      setComposerHistoryIndex(-1);
      setInputValue('');
    }
  }

  return (
    <div
      data-conversation-pane="true"
      onMouseDownCapture={() => {
        void onFocus?.();
      }}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col overflow-visible bg-background transition-colors duration-150',
        hasFloatingOverlayOpen ? 'z-20' : (pane.isFocused ? 'z-10' : 'z-0'),
        pane.isFocused
          ? 'bg-background'
          : 'bg-background/95',
      )}
    >
      {pane.isFocused && !pane.isOnlyPane ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[2] shadow-[inset_0_0_0_1px_hsl(var(--pane-focus)/0.42)]"
          style={{ boxShadow: `inset 0 0 0 1px ${getPaneAccentColorAlpha(paneNumber, 0.42)}` }}
        />
      ) : null}
      <div
        className={cn(
          'relative flex items-center justify-between gap-3 border-b border-border/70 px-3 py-1.5 transition-colors',
          isProviderPickerOpen ? 'z-[30]' : 'z-[1]',
          pane.isFocused && !pane.isOnlyPane ? 'bg-accent/15' : 'bg-transparent',
        )}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="flex w-full min-w-0 items-center gap-1.5 text-[12px] font-medium text-foreground">
            {paneShortcutLabel ? (
              <PaneAccentBadge
                className="shrink-0"
                label={paneShortcutLabel}
                paneNumber={paneNumber}
                variant="shortcut"
              />
            ) : null}
            <span className="min-w-0 truncate">{pane.title}</span>
            {pane.session && isProviderLocked ? (
              <ReadonlyHeaderChip
                className="shrink-0"
                label={lockedProviderChipLabel}
                provider={sessionProvider}
                title={copy.providerLockedHint}
              />
            ) : null}
          </p>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {showProviderPicker ? (
            <ComposerSelectPicker
              ariaLabel={copy.providerLabel}
              buttonTitle={currentProviderDisplay}
              containerClassName="basis-auto max-w-[118px] shrink-0"
              currentLabel={currentProviderDisplay}
              disabled={pane.isBusy || isUpdatingProvider}
              isOpen={isProviderPickerOpen}
              menuAlign="end"
              menuDescription={copy.providerMenuDescription}
              menuHint={copy.providerMenuHint}
              menuPlacement="bottom"
              menuTitle={copy.providerMenuTitle}
              options={providerOptions}
              pickerRef={providerPickerRef}
              selectedValue={sessionProvider}
              triggerVariant="header"
              onOpenChange={(nextOpen) => {
                setIsModePickerOpen(false);
                setIsModelPickerOpen(false);
                setIsProviderPickerOpen(nextOpen);
              }}
              onSelect={async (nextProvider) => {
                if (nextProvider === sessionProvider) {
                  setIsProviderPickerOpen(false);
                  return;
                }

                try {
                  await onUpdateSessionProvider?.(pane.id, nextProvider);
                  setIsProviderPickerOpen(false);
                } catch (error) {
                  console.error(error);
                }
              }}
            />
          ) : null}
          <button
            type="button"
            onClick={onClear}
            disabled={!canClear || pane.isBusy || pane.isOnlyPane}
            aria-label={copy.paneClose}
            title={formatShortcutTooltip(copy.paneClose, 'W', platform)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative z-[1] min-h-0 flex-1">
        {pane.isLoading ? (
          <div className="flex h-full items-center justify-center px-5">
            <div className="px-4 py-3 text-[13px] text-muted-foreground">
              {copy.paneLoading}
            </div>
          </div>
        ) : pane.session ? (
          <ScrollArea
            viewportRef={registerViewport}
            className="h-full px-3"
            viewportClassName="[&>div]:!block [&>div]:min-w-0 [&>div]:w-full [&>div]:max-w-full"
          >
            <div className="flex w-full min-w-0 flex-col gap-3 py-3">
              {pane.renderableMessages.length === 0 ? (
                <ConversationEmptyState
                  icon={Bot}
                  title={copy.conversationEmpty}
                />
              ) : (
                <>
                  {pane.renderableMessages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      approvalActionId={pendingApprovalActionId}
                      language={language}
                      message={message}
                      onApprovalDecision={onApprovalDecision}
                    />
                  ))}
                  {pane.shouldShowRunIndicator && <RunIndicator language={language} />}
                </>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex h-full items-center justify-center px-5">
            <div className="max-w-sm px-5 py-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center text-secondary-foreground">
                <MessageSquarePlus className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">{copy.paneEmptyTitle}</p>
              <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{copy.paneEmptyDescription}</p>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-[1] bg-background/75 p-3">
        <div
          className={cn(
            'relative rounded-xl border bg-background shadow-sm transition-[border-color,box-shadow]',
            isComposerTextareaFocused
              ? 'border-ring/35 shadow-[0_0_0_1px_hsl(var(--ring)/0.14)]'
              : 'border-input',
          )}
        >
          {hasComposerAttachments && (
            <div className="absolute left-3 right-24 top-3 z-10 overflow-x-auto pb-1">
              <div className="flex min-w-max items-center gap-2 pr-2">
                {composerAttachments.map((attachment) => (
                  <ComposerAttachmentChip
                    key={attachment.path}
                    attachment={attachment}
                    removeLabel={copy.removeAttachment}
                    onRemove={(attachmentPath) => {
                      setComposerAttachments((current) => current.filter((attachment) => attachment.path !== attachmentPath));
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(event) => {
              if (composerHistoryIndex !== -1) {
                setComposerHistoryIndex(-1);
              }

              setInputValue(event.target.value);
            }}
            onFocus={() => {
              setIsComposerTextareaFocused(true);
            }}
            onBlur={() => {
              setIsComposerTextareaFocused(false);
            }}
            onPaste={(event) => {
              const clipboardData = event.clipboardData;
              if (!clipboardData || getClipboardFiles(clipboardData).length === 0) {
                return;
              }

              event.preventDefault();
              void handlePasteAttachments(clipboardData);
            }}
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

              const canNavigateComposerHistory = !event.altKey
                && !event.ctrlKey
                && !event.metaKey
                && !event.shiftKey
                && (composerHistoryIndex !== -1 || inputValue.trim() === '');

              if (canNavigateComposerHistory && event.key === 'ArrowUp') {
                if (applyComposerHistory('previous')) {
                  event.preventDefault();
                  return;
                }
              }

              if (canNavigateComposerHistory && event.key === 'ArrowDown') {
                if (applyComposerHistory('next')) {
                  event.preventDefault();
                  return;
                }
              }

              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              pane.session && !canUseSessionProvider
                ? copy.providerSessionDisabledHint(currentProviderDisplay)
                : (pane.session ? copy.inputPlaceholder : copy.noSessionCommandHint)
            }
            className={cn(
              'min-h-[108px] resize-none rounded-[inherit] border-0 bg-transparent pb-14 pl-3 pr-24 text-[13px] shadow-none focus-visible:ring-0',
              hasComposerAttachments && 'pt-16',
            )}
            disabled={!pane.workspace || pane.isBusy || !canUseSessionProvider}
          />
          <div className="absolute bottom-3 left-3 right-24 z-10 pb-1">
            <div className="flex items-center gap-2 pr-2">
              <ComposerSelectPicker
                ariaLabel={copy.modeLabel}
                containerClassName="basis-auto max-w-[132px] shrink-0"
                currentLabel={currentModeDisplay}
                disabled={!pane.session || pane.isBusy || isUpdatingPermissionMode || !supportsPermissionMode || !canUseSessionProvider}
                isOpen={isModePickerOpen}
                menuDescription={copy.modeMenuDescription}
                menuHint={copy.modeMenuHint}
                menuTitle={copy.modeMenuTitle}
                options={modeOptions}
                pickerRef={modePickerRef}
                selectedValue={sessionPermissionMode}
                triggerVariant="minimal"
                onOpenChange={(nextOpen) => {
                  setIsProviderPickerOpen(false);
                  setIsModelPickerOpen(false);
                  setIsModePickerOpen(nextOpen);
                }}
                onSelect={async (nextPermissionMode) => {
                  if (nextPermissionMode === sessionPermissionMode) {
                    setIsModePickerOpen(false);
                    return;
                  }

                  try {
                    await onUpdateSessionPermissionMode?.(pane.id, nextPermissionMode);
                    setIsModePickerOpen(false);
                  } catch (error) {
                    console.error(error);
                  }
                }}
              />
              <ComposerSelectPicker
                ariaLabel={copy.modelLabel}
                containerClassName="basis-auto max-w-[148px] shrink-0"
                currentLabel={currentModelDisplay}
                disabled={!pane.session || pane.isBusy || isUpdatingModel || !canUseSessionProvider}
                isOpen={isModelPickerOpen}
                menuDescription={copy.modelMenuDescription}
                menuHint={copy.modelMenuHint}
                menuTitle={copy.modelMenuTitle}
                options={modelOptions}
                pickerRef={modelPickerRef}
                selectedValue={pane.session?.model || ''}
                triggerVariant="minimal"
                onOpenChange={(nextOpen) => {
                  setIsProviderPickerOpen(false);
                  setIsModePickerOpen(false);
                  setIsModelPickerOpen(nextOpen);
                }}
                onSelect={async (nextModel) => {
                  if (nextModel === (pane.session?.model || '')) {
                    setIsModelPickerOpen(false);
                    return;
                  }

                  try {
                    await onUpdateSessionModel?.(pane.id, nextModel);
                    setIsModelPickerOpen(false);
                  } catch (error) {
                    console.error(error);
                  }
                }}
              />
            </div>
          </div>
          {isSlashCommandMenuOpen ? (
            <SlashCommandMenu
              commands={visibleSlashCommands}
              emptyLabel={language === 'zh' ? '没有匹配的指令' : 'No matching commands'}
              highlightedCommandName={highlightedSlashCommand?.name || ''}
              language={language}
              menuRef={slashMenuRef}
              onSelectCommand={applySlashCommand}
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handlePickAttachments}
            disabled={!pane.workspace || pane.isBusy || !canUseSessionProvider}
            aria-label={copy.addAttachment}
            title={copy.addAttachment}
            className="absolute bottom-3 right-14 h-8 w-8 rounded-full border-border/80 bg-background shadow-sm hover:bg-muted"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
          <Button
            onClick={pane.session?.isRunning ? () => onStopRun?.(pane.id) : () => {
              void handleSend();
            }}
            disabled={pane.session?.isRunning ? false : (!canSend || !canUseSessionProvider)}
            size="icon"
            aria-label={pane.session?.isRunning ? copy.runStop : (pane.isSending ? copy.sending : copy.sendMessage)}
            className="absolute bottom-3 right-3 h-8 w-8 rounded-full shadow-sm"
          >
            {pane.session?.isRunning ? (
              <Square className="h-3.5 w-3.5" />
            ) : pane.isSending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SidebarSection({ action, title, children }) {
  return (
    <section className="space-y-2.5">
      <div className="relative pr-12">
        <p className="min-w-0 text-[15px] font-semibold tracking-[0.02em] text-foreground/90">{title}</p>
        <div className={SIDEBAR_ACTION_SLOT_CLASS}>
          {action}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SidebarRailButton({
  active = false,
  ariaLabel,
  badge,
  disabled = false,
  icon: Icon,
  onClick,
  title,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || title}
      title={title || ariaLabel}
      className={cn(
        SIDEBAR_RAIL_BUTTON_CLASS,
        active && 'border-border/80 bg-background text-foreground shadow-sm',
        disabled && 'cursor-not-allowed opacity-45',
      )}
    >
      <Icon className="h-4 w-4" />
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-semibold leading-4 text-background">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function SidebarFlyoutPanel({ children, panelRef }) {
  return (
    <div
      ref={panelRef}
      className="absolute left-[calc(100%+12px)] top-3 z-40 w-[320px] max-w-[min(24rem,calc(100vw-5rem))] rounded-2xl border border-border/80 bg-background p-4 shadow-xl"
    >
      <div className="max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  );
}

function SidebarEmpty({ text }) {
  return <div className="rounded-xl border border-dashed border-border/80 bg-background/70 px-3 py-3 text-[13px] leading-5 text-muted-foreground">{text}</div>;
}

function TopbarSelect({ ariaLabel, children, onChange, value }) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
        className="h-8 w-full appearance-none rounded border border-border/80 bg-background px-3 pr-9 text-[12px] text-foreground outline-none transition-colors hover:bg-background focus:ring-2 focus:ring-ring/20"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function SettingsDialog({
  copy,
  isUpdatingProviders,
  language,
  onClose,
  onLanguageChange,
  onSetProviderEnabled,
  onThemeChange,
  platform,
  providerSettings,
  themePreference,
}) {
  const shortcutItems = [
    {
      action: copy.settingsShortcutAddWorkspace,
      shortcut: formatShortcutLabel(platform, 'O'),
    },
    {
      action: copy.settingsShortcutToggleSidebar,
      shortcut: formatShortcutLabel(platform, 'B'),
    },
    {
      action: copy.settingsShortcutAddPane,
      shortcut: formatShortcutLabel(platform, 'D'),
    },
    {
      action: copy.settingsShortcutAddPaneAndCreate,
      shortcut: formatShiftedShortcutLabel(platform, 'D'),
    },
    {
      action: copy.settingsShortcutCreateConversation,
      shortcut: formatShortcutLabel(platform, 'N'),
    },
    {
      action: copy.settingsShortcutClosePane,
      shortcut: formatShortcutLabel(platform, 'W'),
    },
    {
      action: copy.settingsShortcutFocusPane,
      shortcut: formatShortcutRangeLabel(platform, '1', '9'),
    },
  ].filter((item) => item.shortcut);
  const enabledProviderCount = providerSettings.filter((provider) => provider.enabled).length;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border/80 bg-background p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{copy.settingsTitle}</p>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{copy.settingsDescription}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={copy.settingsClose}
            title={copy.settingsClose}
            className="h-8 w-8 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-foreground">{copy.languageLabel}</p>
            <TopbarSelect
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
              ariaLabel={copy.languageLabel}
            >
              <option value="zh">{copy.languageChinese}</option>
              <option value="en">{copy.languageEnglish}</option>
            </TopbarSelect>
          </div>
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-foreground">{copy.themeLabel}</p>
            <TopbarSelect
              value={themePreference}
              onChange={(event) => onThemeChange(event.target.value)}
              ariaLabel={copy.themeLabel}
            >
              <option value="system">{copy.themeSystem}</option>
              <option value="light">{copy.themeLight}</option>
              <option value="dark">{copy.themeDark}</option>
            </TopbarSelect>
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-[12px] font-medium text-foreground">{copy.settingsProvidersTitle}</p>
              <p className="text-[11px] leading-5 text-muted-foreground">{copy.settingsProvidersDescription}</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-border/80 bg-background/60">
              {providerSettings.map((provider) => {
                const disableToggle = isUpdatingProviders || (provider.enabled && enabledProviderCount <= 1);

                return (
                  <div key={provider.key} className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', getProviderDotClasses(provider.key))} />
                        <p className="truncate text-[12px] font-medium text-foreground">{provider.label}</p>
                        {!provider.available ? (
                          <span className="shrink-0 rounded-full border border-border/80 bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {copy.providerUnavailable(provider.label)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{provider.summary}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={provider.enabled}
                      aria-label={`${provider.label} ${copy.providerLabel}`}
                      disabled={disableToggle}
                      onClick={() => {
                        void onSetProviderEnabled?.(provider.key, !provider.enabled);
                      }}
                      className={cn(
                        'inline-flex h-6 w-10 shrink-0 items-center rounded-full border p-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-45',
                        provider.enabled
                          ? 'border-amber-300 bg-amber-400/90 dark:border-amber-400/70 dark:bg-amber-400/80'
                          : 'border-border/80 bg-muted/80',
                      )}
                    >
                      <span
                        className={cn(
                          'h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
                          provider.enabled ? 'translate-x-4' : 'translate-x-0',
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">{copy.settingsProvidersHint}</p>
          </div>
          <div className="space-y-2">
            <p className="text-[12px] font-medium text-foreground">{copy.settingsShortcutsTitle}</p>
            <div className="overflow-hidden rounded-xl border border-border/80 bg-background/60">
              {shortcutItems.map((item) => (
                <div key={item.action} className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5 last:border-b-0">
                  <p className="min-w-0 text-[12px] text-foreground/90">{item.action}</p>
                  <code className="shrink-0 rounded-md border border-border/80 bg-muted/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                    {item.shortcut}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HiddenPaneSection({ copy, hiddenPanes, onClearPane, onFocusPane }) {
  if (hiddenPanes.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-2">
        <p className="min-w-0 text-[15px] font-semibold tracking-[0.02em] text-foreground/90">
          {copy.paneOverflowLabel}
        </p>
        <span className="inline-flex h-6 w-6 items-center justify-center text-[13px] font-medium text-muted-foreground">
          {hiddenPanes.length}
        </span>
      </div>
      <div className="max-h-40 overflow-y-auto pr-1">
        <div className="divide-y divide-border/70">
          {hiddenPanes.map((pane) => (
            <div key={pane.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-2 py-1.5">
              <button
                type="button"
                onClick={() => {
                  void onFocusPane?.(pane.id);
                }}
                title={copy.paneClickToFocus}
                className="flex min-w-0 items-center gap-2 py-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35"
              >
                <Blocks className="h-3 w-3 shrink-0 text-muted-foreground" />
                <p className="truncate text-[12px] font-medium text-foreground/90">{pane.title}</p>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onClearPane?.(pane.id);
                }}
                disabled={pane.isBusy}
                aria-label={copy.paneClose}
                title={copy.paneClose}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComposerSelectPicker({
  ariaLabel,
  buttonIcon: ButtonIcon,
  buttonTitle,
  containerClassName,
  currentLabel,
  disabled,
  isOpen,
  menuAlign = 'start',
  menuDescription,
  menuHint,
  menuPlacement = 'top',
  menuTitle,
  onOpenChange,
  onSelect,
  options,
  pickerRef,
  selectedValue,
  triggerVariant = 'default',
}) {
  const localPickerRef = useRef(null);
  const [menuWidth, setMenuWidth] = useState(240);

  useEffect(() => {
    const root = localPickerRef.current;
    if (!root) {
      return undefined;
    }

    const assignRef = () => {
      if (!pickerRef) {
        return;
      }

      if (typeof pickerRef === 'function') {
        pickerRef(root);
        return;
      }

      pickerRef.current = root;
    };

    assignRef();

    if (!isOpen || typeof ResizeObserver === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }

    const pane = root.closest('[data-conversation-pane="true"]');
    const measure = () => {
      const triggerWidth = root.getBoundingClientRect().width;
      const paneWidth = pane instanceof HTMLElement ? pane.getBoundingClientRect().width : window.innerWidth;
      const availableWidth = Math.max(160, paneWidth - 20);
      const targetWidth = Math.max(220, triggerWidth + 88);
      const nextWidth = Math.min(320, availableWidth, targetWidth);
      setMenuWidth(Math.round(nextWidth));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (pane instanceof HTMLElement) {
      observer.observe(pane);
    }
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isOpen, pickerRef]);

  return (
    <div
      ref={localPickerRef}
      title={buttonTitle || currentLabel}
      className={cn(
        'relative min-w-0 basis-[152px] shrink max-w-[152px]',
        (triggerVariant === 'minimal' || triggerVariant === 'header') && 'basis-auto max-w-none shrink-0',
        containerClassName,
      )}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => onOpenChange(!isOpen)}
        title={buttonTitle || currentLabel}
        className={cn(
          'flex items-center text-left text-[12px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          triggerVariant === 'minimal'
            ? 'h-7 w-auto max-w-full gap-1 rounded-md bg-transparent px-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25'
            : triggerVariant === 'header'
              ? cn(
                'h-7 w-auto max-w-full gap-1.5 rounded-full border px-2.5 shadow-sm focus-visible:ring-2 focus-visible:ring-ring/30',
                getSelectedProviderBadgeClasses(),
              )
            : 'h-8 w-full gap-2 rounded border border-border/80 bg-background px-2.5 text-foreground shadow-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/35',
        )}
      >
        {triggerVariant === 'header' ? (
          <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', getSelectedProviderDotClasses())} />
        ) : ButtonIcon ? (
          <ButtonIcon
            className={cn(
              'shrink-0 text-muted-foreground',
              triggerVariant === 'minimal' ? 'h-3 w-3' : (triggerVariant === 'header' ? 'h-3.5 w-3.5 text-foreground/75' : 'h-3.5 w-3.5'),
            )}
          />
        ) : null}
        <span
          className={cn(
            'min-w-0 truncate font-medium',
            (triggerVariant === 'minimal' || triggerVariant === 'header') && 'flex-1',
          )}
        >
          {currentLabel}
        </span>
        <ChevronDown
          className={cn(
            'shrink-0 text-muted-foreground transition-transform',
            triggerVariant === 'minimal' ? 'h-3 w-3' : (triggerVariant === 'header' ? 'h-3.5 w-3.5 text-current/75' : 'h-3.5 w-3.5'),
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-20 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl',
            menuAlign === 'end' ? 'right-0' : 'left-0',
            menuPlacement === 'bottom' ? 'top-[calc(100%+8px)]' : 'bottom-[calc(100%+8px)]',
          )}
          style={{ width: `${menuWidth}px`, maxWidth: 'calc(100vw - 48px)' }}
        >
          <div className="border-b border-border/70 px-3 py-3">
            <p className="text-[13px] font-semibold text-foreground">{menuTitle}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{menuDescription}</p>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {options.map((option) => {
              const isSelected = option.value === selectedValue;
              const OptionIcon = option.icon;

              return (
                <button
                  key={option.value || '__default'}
                  type="button"
                  onClick={() => onSelect(option.value)}
                  className={cn(
                    'w-full rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                    isSelected && 'bg-muted',
                  )}
                >
                  <div className="flex items-start gap-3">
                    {OptionIcon ? <OptionIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">{option.label}</span>
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

function ReadonlyHeaderChip({
  className,
  label,
  provider,
  title,
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <span
        title={title || label}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none',
          getProviderBadgeClasses(provider),
        )}
      >
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', getProviderDotClasses(provider))} />
        <span className="truncate">{label}</span>
      </span>
    </div>
  );
}

function PaneAccentBadge({
  className,
  label,
  paneNumber,
  title,
  variant = 'index',
}) {
  const tone = getPaneAccentTone(paneNumber);

  return (
    <span
      title={title || label}
      style={{
        '--pane-badge-bg-dark': tone.backgroundDark,
        '--pane-badge-bg-light': tone.backgroundLight,
        '--pane-badge-border-dark': tone.borderDark,
        '--pane-badge-border-light': tone.borderLight,
        '--pane-badge-text-dark': tone.textDark,
        '--pane-badge-text-light': tone.textLight,
      }}
      className={cn(
        'inline-grid place-items-center rounded-full border font-semibold leading-none',
        'border-[hsl(var(--pane-badge-border-light))] bg-[hsl(var(--pane-badge-bg-light))] text-[hsl(var(--pane-badge-text-light))]',
        'dark:border-[hsl(var(--pane-badge-border-dark))] dark:bg-[hsl(var(--pane-badge-bg-dark))] dark:text-[hsl(var(--pane-badge-text-dark))]',
        variant === 'shortcut'
          ? 'h-5 shrink-0 px-1.5 text-[10px] tracking-[0.01em]'
          : 'h-5 min-w-[1.25rem] shrink-0 px-1 text-[10px] tabular-nums',
        className,
      )}
    >
      <span className={cn('block leading-none', variant === 'index' && 'translate-y-[0.5px]')}>{label}</span>
    </span>
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
    <div ref={menuRef} className="absolute inset-x-0 bottom-[calc(100%+10px)] z-20 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl">
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
                  isHighlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
                )}
              >
                <code
                  className="mt-0.5 inline-block w-[120px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-foreground"
                  title={`/${command.name}`}
                >
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
  onOpenGitDiffWindow,
  onOpenWorkspaceInFinder,
  onRemoveWorkspace,
  onSelectSession,
  onSelectWorkspace,
  onToggleExpand,
  platform,
  selectedSessionId,
  sessionPaneBindingMap,
  workspace,
}) {
  const FolderIcon = isExpanded ? FolderOpen : Folder;
  const moreButtonRef = useRef(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState(null);
  const moreMenuRef = useRef(null);

  useEffect(() => {
    if (!isMoreMenuOpen || typeof document === 'undefined') {
      setMoreMenuPosition(null);
      return undefined;
    }

    const updateMoreMenuPosition = () => {
      const buttonRect = moreButtonRef.current?.getBoundingClientRect();
      if (!buttonRect || typeof window === 'undefined') {
        return;
      }

      const viewportPadding = 12;
      const menuWidth = 220;
      const estimatedMenuHeight = workspace.gitBranch ? 102 : 84;
      const canOpenBelow = buttonRect.bottom + 6 + estimatedMenuHeight <= window.innerHeight - viewportPadding;
      const left = Math.min(
        Math.max(viewportPadding, buttonRect.right - menuWidth),
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
      );
      const top = canOpenBelow
        ? buttonRect.bottom + 6
        : Math.max(viewportPadding, buttonRect.top - estimatedMenuHeight - 6);

      setMoreMenuPosition({
        left: Math.round(left),
        top: Math.round(top),
      });
    };

    updateMoreMenuPosition();

    const closeMenuOnOutsidePointer = (event) => {
      if (moreMenuRef.current?.contains(event.target)) {
        return;
      }

      setIsMoreMenuOpen(false);
    };

    const closeMenuOnFocusMove = (event) => {
      if (moreMenuRef.current?.contains(event.target)) {
        return;
      }

      setIsMoreMenuOpen(false);
    };

    const closeMenuOnEscape = (event) => {
      if (event.key === 'Escape') {
        setIsMoreMenuOpen(false);
      }
    };

    const closeMenuOnWindowBlur = () => {
      setIsMoreMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeMenuOnOutsidePointer);
    document.addEventListener('focusin', closeMenuOnFocusMove);
    document.addEventListener('keydown', closeMenuOnEscape);
    window.addEventListener('blur', closeMenuOnWindowBlur);
    window.addEventListener('resize', updateMoreMenuPosition);
    window.addEventListener('scroll', updateMoreMenuPosition, true);

    return () => {
      document.removeEventListener('pointerdown', closeMenuOnOutsidePointer);
      document.removeEventListener('focusin', closeMenuOnFocusMove);
      document.removeEventListener('keydown', closeMenuOnEscape);
      window.removeEventListener('blur', closeMenuOnWindowBlur);
      window.removeEventListener('resize', updateMoreMenuPosition);
      window.removeEventListener('scroll', updateMoreMenuPosition, true);
    };
  }, [isMoreMenuOpen, workspace.gitBranch]);

  return (
    <div
      title={workspace.path}
      className={cn('relative overflow-visible py-0.5', isMoreMenuOpen && 'z-20')}
    >
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
        <div className="absolute inset-y-0 right-3 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateSession}
            disabled={disabled}
            className={cn(
              SIDEBAR_ACTION_BUTTON_CLASS,
              'pointer-events-none opacity-0 transition-[opacity,color,transform] duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100',
            )}
            title={formatShortcutTooltip(copy.createConversationInWorkspace(workspace.path), 'N', platform)}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <div ref={moreMenuRef} className="relative z-10">
            <Button
              ref={moreButtonRef}
              variant="ghost"
              size="icon"
              onClick={() => setIsMoreMenuOpen((current) => !current)}
              disabled={disabled}
              aria-label={copy.workspaceMoreActions}
              className={cn(
                SIDEBAR_ACTION_BUTTON_CLASS,
                isMoreMenuOpen
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
                'transition-[opacity,color,transform] duration-150 focus-visible:opacity-100',
              )}
              title={copy.workspaceMoreActions}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {isMoreMenuOpen && moreMenuPosition ? (
              <WorkspaceMoreMenu
                copy={copy}
                disabled={disabled}
                onOpenWorkspaceInFinder={() => {
                  setIsMoreMenuOpen(false);
                  onOpenWorkspaceInFinder?.();
                }}
                position={moreMenuPosition}
                workspace={workspace}
                onOpenGitDiffWindow={() => {
                  setIsMoreMenuOpen(false);
                  onOpenGitDiffWindow?.();
                }}
                onRemoveWorkspace={() => {
                  setIsMoreMenuOpen(false);
                  onRemoveWorkspace?.();
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-1 ml-1">
          {workspace.sessions.length === 0 ? (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{copy.noConversationsInWorkspace}</p>
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
                  paneNumbers={sessionPaneBindingMap.get(createSessionCacheKey(workspace.id, session.id)) || []}
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

function WorkspaceMoreMenu({
  copy,
  disabled,
  onOpenGitDiffWindow,
  onOpenWorkspaceInFinder,
  onRemoveWorkspace,
  position,
  workspace,
}) {
  const hasGitBranch = Boolean(workspace.gitBranch);
  const canOpenGitDiff = Boolean(hasGitBranch && workspace.gitDirty && onOpenGitDiffWindow);
  const gitSummary = hasGitBranch && !workspace.gitDirty ? copy.workspaceGitBranchInfo : '';

  return (
    <div
      className="fixed z-[80] w-[196px] overflow-hidden rounded-lg border border-border/80 bg-background/95 p-1 shadow-xl backdrop-blur-sm"
      style={{
        left: `${position?.left || 12}px`,
        top: `${position?.top || 12}px`,
      }}
    >
      {canOpenGitDiff ? (
        <button
          type="button"
          onClick={onOpenGitDiffWindow}
          disabled={disabled}
          className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
          title={copy.viewGitChanges}
        >
          <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-foreground">{truncateMiddle(workspace.gitBranch, 20)}</p>
          </div>
        </button>
      ) : (
        <div className="flex items-start gap-2.5 rounded-md px-2 py-2">
          <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-foreground">
              {hasGitBranch ? truncateMiddle(workspace.gitBranch, 20) : copy.workspaceGitUnavailable}
            </p>
            {gitSummary ? <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{gitSummary}</p> : null}
          </div>
        </div>
      )}
      <div className="mt-0.5 border-t border-border/70 pt-1">
        <button
          type="button"
          onClick={onOpenWorkspaceInFinder}
          disabled={disabled}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
          title={copy.openWorkspaceInFinderWithPath(workspace.path)}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-[11px] font-medium text-foreground">{copy.openWorkspaceInFinder}</span>
        </button>
      </div>
      <div className="mt-0.5 border-t border-border/70 pt-1">
        <button
          type="button"
          onClick={onRemoveWorkspace}
          disabled={disabled}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-destructive transition-colors hover:bg-destructive/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
          title={copy.removeWorkspaceWithPath(workspace.path)}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate text-[11px] font-medium">{copy.removeWorkspace}</span>
        </button>
      </div>
    </div>
  );
}

function SessionItem({ copy, disabled, isSelected, language, onArchive, onSelect, paneNumbers = [], session }) {
  const showRunningDot = isSelected && session.isRunning;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className="w-full overflow-hidden px-2 py-1.5 text-left transition-[background-color,color,transform,box-shadow] hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35 active:translate-y-px active:bg-background"
      >
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {showRunningDot && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />}
            {paneNumbers.length > 0 ? (
              <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
                {paneNumbers.map((paneNumber) => (
                  <PaneAccentBadge
                    key={paneNumber}
                    label={String(paneNumber)}
                    paneNumber={paneNumber}
                    variant="index"
                  />
                ))}
              </div>
            ) : null}
            <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">{session.title}</p>
          </div>
          <span className="flex h-6 w-8 shrink-0 items-center justify-center" aria-hidden="true" />
        </div>
      </button>
      <div className="absolute right-3 top-1/2 flex h-6 w-8 -translate-y-1/2 items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={onArchive}
          disabled={disabled || session.isRunning}
          className={cn(
            SIDEBAR_ACTION_BUTTON_CLASS,
            'pointer-events-none opacity-0 transition-[opacity,color,transform] duration-150 group-hover:pointer-events-auto group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-30',
          )}
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

function MessageLeadIcon({ children, className }) {
  return (
    <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md', className)}>
      {children}
    </div>
  );
}

function ChatMessage({ approvalActionId, language, message, onApprovalDecision }) {
  if (message.role === 'event') {
    return <EventMessage language={language} message={message} />;
  }

  const copy = COPY[language];
  const isUser = message.role === 'user';
  const messageAttachments = isUser ? getMessageAttachments(message) : [];
  const assistantSegments = isUser ? [] : getAssistantSegments(message);
  const showThinkingIndicator = (message.streaming || message.pendingThinking)
    && !assistantMessageHasText(message)
    && !assistantMessageHasRunningToolActivity(message)
    && !assistantMessageHasPendingApproval(message);

  if (!isUser) {
    return (
      <div className="flex min-w-0 items-start gap-2.5">
        <MessageLeadIcon className="bg-primary/10 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </MessageLeadIcon>
        <div className="min-w-0 max-w-[min(100%,46rem)] flex-1 overflow-hidden pt-0.5">
          <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Agent</div>
          <div className="min-w-0 space-y-3">
            {assistantSegments.map((segment) => {
              if (segment.type === 'tool_activity') {
                return <AssistantToolActivity key={segment.key} activity={segment.toolActivity} language={language} />;
              }

              if (segment.type === 'approval') {
                return (
                  <AssistantApprovalCard
                    key={segment.key}
                    approval={segment.approval}
                    isSubmitting={approvalActionId === segment.approval.requestId}
                    language={language}
                    onDecision={onApprovalDecision}
                  />
                );
              }

              return (
                <div
                  key={segment.key}
                  className={cn('markdown-body text-[13px] leading-6', segment.error && 'text-destructive')}
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(segment.content, language),
                  }}
                />
              );
            })}
            {showThinkingIndicator ? <TypingIndicator label={copy.assistantThinking} labelLoading /> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-start justify-end gap-2.5">
      <div className="user-bubble-message min-w-0 max-w-[min(100%,42rem)] overflow-hidden rounded-2xl border px-2.5 py-2">
        {messageAttachments.length > 0 ? <MessageAttachmentList attachments={messageAttachments} /> : null}
        {message.content ? (
          <div className={cn('whitespace-pre-wrap break-words text-[13px] leading-6', messageAttachments.length > 0 && 'mt-2')}>
            {message.content}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ComposerAttachmentChip({ attachment, onRemove, removeLabel }) {
  return (
    <span className="inline-flex h-8 max-w-[220px] items-center gap-2 rounded-full border border-border/80 bg-background px-3 text-[12px] text-foreground shadow-sm">
      <AttachmentKindIcon attachment={attachment} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate" title={attachment.path || attachment.name}>{attachment.name}</span>
      <button
        type="button"
        onClick={() => onRemove(attachment.path)}
        aria-label={removeLabel}
        title={removeLabel}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function MessageAttachmentList({ attachments }) {
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <span
          key={attachment.path}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[hsl(var(--user-bubble-border))] bg-[hsl(var(--user-bubble-foreground)/0.08)] px-3 py-1 text-[12px] leading-5"
          title={attachment.path || attachment.name}
        >
          <AttachmentKindIcon attachment={attachment} className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span className="truncate">{attachment.name}</span>
        </span>
      ))}
    </div>
  );
}

function AttachmentKindIcon({ attachment, className }) {
  const Icon = attachment?.kind === 'image' ? ImageIcon : FileText;
  return <Icon className={className} />;
}

function AssistantToolActivity({ activity, language }) {
  const visibleItems = getVisibleToolActivityItems(activity);
  const summaryParts = Array.isArray(activity?.summaryParts) ? activity.summaryParts : [];

  if (!activity || (summaryParts.length === 0 && visibleItems.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-1 text-[12px] leading-5 text-muted-foreground">
      {summaryParts.length > 0 ? (
        <p className="font-medium text-muted-foreground/95">
          {summaryParts.map((part, index) => (
            <span key={part.key}>
              {index > 0 ? (activity.summarySeparator || ' ') : ''}
              <span className={cn(part.status === 'running' && 'loading-copy')}>{part.label}</span>
            </span>
          ))}
        </p>
      ) : null}
      {visibleItems.length > 0 ? (
        <div className="space-y-0.5">
          {visibleItems.map((item) => (
            <p
              key={item.key}
              className={cn(
                item.category === 'command'
                  ? 'min-w-0 overflow-hidden text-muted-foreground/85'
                  : 'break-words text-muted-foreground/85',
                item.status === 'running' && 'loading-copy',
              )}
            >
              <ToolActivityItemLabel item={item} language={language} />
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssistantApprovalCard({ approval, isSubmitting, language, onDecision }) {
  const copy = COPY[language];
  const actionLabel = formatPendingApprovalActionLabel(approval, language);
  const reason = (approval?.description || approval?.decisionReason || '').trim();
  const blockedPath = (approval?.blockedPath || '').trim();
  const canAlwaysAllowCommand = approval?.category === 'command';

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-[12px] leading-5 text-foreground/90">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{copy.approvalTitle}</p>
        {isSubmitting ? <span className="text-[11px] text-muted-foreground">{copy.approvalResponding}</span> : null}
      </div>
      <p className="mt-1 break-words text-muted-foreground">{actionLabel}</p>
      {blockedPath ? (
        <div className="mt-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">{copy.approvalBlockedPath}</p>
          <code className="mt-1 block break-all rounded-lg bg-background/80 px-2 py-1.5 text-[11px] text-foreground/90">{blockedPath}</code>
        </div>
      ) : null}
      {reason ? (
        <p className="mt-2 break-words text-muted-foreground">
          <span className="font-medium text-foreground/90">{copy.approvalReason}:</span>
          {' '}
          {reason}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => onDecision?.(approval.requestId, 'allow')}
          disabled={isSubmitting}
          className="h-7 rounded-lg bg-foreground px-2.5 text-[11px] text-background hover:bg-foreground/90"
        >
          {copy.approvalAllow}
        </Button>
        {canAlwaysAllowCommand ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDecision?.(approval.requestId, 'allow_always')}
            disabled={isSubmitting}
            className="h-7 rounded-lg border-border/80 px-2.5 text-[11px]"
          >
            {copy.approvalAllowAlwaysCommand}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDecision?.(approval.requestId, 'deny')}
          disabled={isSubmitting}
          className="h-7 rounded-lg border-border/80 px-2.5 text-[11px]"
        >
          {copy.approvalDeny}
        </Button>
      </div>
    </div>
  );
}

function ToolActivityItemLabel({ item, language }) {
  if (isEditToolActivityItem(item)) {
    return <EditToolActivityLabel item={item} language={language} />;
  }

  if (item?.category === 'command') {
    return (
      <span className="block truncate whitespace-nowrap" title={item.label}>
        {item.label}
      </span>
    );
  }

  return item.label;
}

function EditToolActivityLabel({ item, language }) {
  const toolMeta = item.toolMeta || null;
  const fileName = toolMeta?.fileName || normalizeToolActivityLabel(item.category, item.label);
  const filePath = toolMeta?.filePath || '';
  const addedLines = typeof toolMeta?.addedLines === 'number' ? toolMeta.addedLines : null;
  const deletedLines = typeof toolMeta?.deletedLines === 'number' ? toolMeta.deletedLines : null;
  const prefix = language === 'zh'
    ? (
      item.status === 'running'
        ? '正在编辑'
        : (item.status === 'completed'
          ? '已编辑'
          : (item.status === 'stopped' ? '已停止编辑' : '编辑失败'))
    )
    : (
      item.status === 'running'
        ? 'Editing'
        : (item.status === 'completed'
          ? 'Edited'
          : (item.status === 'stopped' ? 'Stopped editing' : 'Edit failed'))
    );
  const showAddedLines = typeof addedLines === 'number' && addedLines > 0;
  const showDeletedLines = typeof deletedLines === 'number' && deletedLines > 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span>{prefix}</span>
      {fileName ? (
        <span className="font-medium text-foreground/95" title={filePath || undefined}>
          {fileName}
        </span>
      ) : null}
      {showAddedLines ? <span className="font-medium text-emerald-600">+{addedLines}</span> : null}
      {showDeletedLines ? <span className="font-medium text-rose-500">-{deletedLines}</span> : null}
    </span>
  );
}

function isEditToolActivityItem(item) {
  return item?.category === 'edit' && item?.toolMeta?.type === 'edit';
}

function getAssistantSegments(message) {
  if (Array.isArray(message?.segments) && message.segments.length > 0) {
    return message.segments;
  }

  const segments = [];

  if (message?.toolActivity) {
    segments.push({
      key: `${message.id}-tool`,
      toolActivity: message.toolActivity,
      type: 'tool_activity',
    });
  }

  if (Array.isArray(message?.pendingApprovals)) {
    for (const approval of message.pendingApprovals.filter(Boolean)) {
      segments.push({
        approval,
        key: `${message.id}-approval-${approval.requestId || approval.createdAt}`,
        type: 'approval',
      });
    }
  }

  if (message?.content) {
    segments.push({
      content: message.content,
      error: message.error,
      key: `${message.id}-text`,
      type: 'text',
    });
  }

  return segments;
}

function assistantMessageHasText(message) {
  return getAssistantSegments(message).some((segment) => segment.type === 'text' && segment.content);
}

function assistantMessageHasRunningToolActivity(message) {
  return getAssistantSegments(message).some((segment) => segment.type === 'tool_activity' && hasRunningToolActivity(segment.toolActivity));
}

function assistantMessageHasPendingApproval(message) {
  return getAssistantSegments(message).some((segment) => segment.type === 'approval');
}

function assistantMessageHasToolActivity(message) {
  return getAssistantSegments(message).some((segment) => segment.type === 'tool_activity');
}

function getVisibleToolActivityItems(activity) {
  if (!Array.isArray(activity?.items)) {
    return [];
  }

  return activity.items.filter((item) => {
    if (item.status === 'running' || item.status === 'error') {
      return true;
    }

    return item.status === 'completed' && (item.category === 'command' || item.category === 'edit');
  });
}

function hasRunningToolActivity(activity) {
  return Array.isArray(activity?.items) && activity.items.some((item) => item.status === 'running');
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
          <div className="mt-1.5 flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate whitespace-nowrap text-[12px] leading-5 text-foreground"
              title={message.title}
            >
              {message.title}
            </code>
            {message.content && collapsible ? (
              <button
                type="button"
                onClick={() => setIsOpen((current) => !current)}
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
                {isOpen ? copy.collapseDetails : copy.expandDetails}
              </button>
            ) : null}
          </div>
          {message.content && collapsible && isOpen ? (
            <div className="mt-1.5 whitespace-pre-wrap break-words border-l border-border/80 pl-3 text-[12px] leading-5 text-muted-foreground">
              {message.content}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 py-0.5">
      <MessageLeadIcon className={meta.iconWrapperClassName}>
        <Icon className="h-3.5 w-3.5" />
      </MessageLeadIcon>
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

function StatusPill({ className, label, title, tone }) {
  return (
    <span
      title={title || label}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]',
        tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        tone === 'error' && 'border-destructive/25 bg-destructive/10 text-destructive',
        tone === 'running' && 'border-primary/20 bg-primary/10 text-foreground',
        tone === 'muted' && 'border-border/70 bg-background/80 text-muted-foreground',
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          tone === 'success' && 'bg-emerald-500',
          tone === 'error' && 'bg-destructive',
          tone === 'running' && 'bg-primary',
          tone === 'muted' && 'bg-muted-foreground/60',
        )}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function TypingIndicator({ className, label, labelLoading = false }) {
  if (!label) {
    return null;
  }

  return (
    <div className={cn('py-1.5 text-muted-foreground', className)}>
      <span className={cn('text-[12px] leading-5', labelLoading && 'loading-copy')}>{label}</span>
    </div>
  );
}

function RunIndicator({ language }) {
  const copy = COPY[language];

  return (
    <div className="flex items-start gap-2.5 py-0.5">
      <MessageLeadIcon className="bg-primary/10 text-primary">
        <Bot className="h-3.5 w-3.5" />
      </MessageLeadIcon>
      <div className="pt-0.5">
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Agent</div>
        <TypingIndicator label={copy.assistantThinking} labelLoading />
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

function isMergeableToolEvent(message) {
  return message?.role === 'event' && ['mcp', 'skill', 'tool', 'tool_result'].includes(message.kind);
}

function mergeRenderableMessages(messages, language, sessionRunning = false, pendingApprovals = []) {
  const normalizedMessages = normalizeRenderableToolMessages(messages, sessionRunning);
  const merged = [];
  let assistantSegments = [];
  let toolEventBuffer = [];

  const pushAssistantSegments = () => {
    if (assistantSegments.length === 0) {
      return;
    }

    merged.push(createRenderableAssistantMessage(assistantSegments));
    assistantSegments = [];
  };

  const flushAssistantSegments = () => {
    flushToolEventBuffer();
    pushAssistantSegments();
  };

  const flushToolEventBuffer = () => {
    if (toolEventBuffer.length === 0) {
      return;
    }

    const toolActivity = buildToolActivity(toolEventBuffer, language);
    if (toolActivity) {
      assistantSegments.push({
        createdAt: toolEventBuffer[0].createdAt,
        key: `tool-${toolEventBuffer[0].id}`,
        sourceId: toolEventBuffer[0].id,
        toolActivity,
        type: 'tool_activity',
      });
    } else if (toolEventBuffer.length === 1) {
      pushAssistantSegments();
      merged.push(toolEventBuffer[0]);
    } else {
      pushAssistantSegments();
      merged.push(createToolEventGroup(toolEventBuffer, language));
    }

    toolEventBuffer = [];
  };

  for (const message of normalizedMessages) {
    if (isMergeableToolEvent(message)) {
      toolEventBuffer.push(message);
      continue;
    }

    if (message?.role === 'assistant') {
      flushToolEventBuffer();

      if (message.content) {
        assistantSegments.push({
          content: message.content,
          createdAt: message.createdAt,
          error: message.error,
          key: `text-${message.id}`,
          sourceId: message.id,
          streaming: message.streaming,
          type: 'text',
        });
      }

      continue;
    }

    flushAssistantSegments();
    merged.push(message);
  }

  flushAssistantSegments();

  attachPendingApprovalsToRenderableMessages(merged, pendingApprovals);

  if (sessionRunning) {
    markTrailingAssistantMessageAsPending(merged);
  }

  return merged;
}

function normalizeRenderableToolMessages(messages, sessionRunning) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  if (sessionRunning) {
    return messages;
  }

  let mutated = false;
  const normalizedMessages = messages.map((message) => {
    if (!isMergeableToolEvent(message) || message?.status !== 'running') {
      return message;
    }

    mutated = true;
    return {
      ...message,
      status: 'stopped',
    };
  });

  return mutated ? normalizedMessages : messages;
}

function createRenderableAssistantMessage(segments) {
  const normalizedSegments = segments.map(({ sourceId, ...segment }) => segment);
  const lastToolSegment = [...normalizedSegments].reverse().find((segment) => segment.type === 'tool_activity') || null;
  const approvalSegments = normalizedSegments.filter((segment) => segment.type === 'approval');

  return {
    id: `assistant-group-${segments[0].sourceId}`,
    role: 'assistant',
    content: segments.length === 1 && segments[0].type === 'text' ? segments[0].content : '',
    createdAt: segments[0].createdAt,
    error: normalizedSegments.some((segment) => segment.type === 'text' && segment.error),
    pendingThinking: false,
    pendingApprovals: approvalSegments.map((segment) => segment.approval),
    segments: normalizedSegments,
    streaming: normalizedSegments.some((segment) => segment.type === 'text' && segment.streaming),
    toolActivity: lastToolSegment?.toolActivity || null,
  };
}

function attachPendingApprovalsToRenderableMessages(messages, pendingApprovals) {
  if (!Array.isArray(pendingApprovals) || pendingApprovals.length === 0) {
    return;
  }

  const approvalSegments = pendingApprovals
    .filter(Boolean)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map((approval) => ({
      approval,
      createdAt: approval.createdAt,
      key: `approval-${approval.requestId}`,
      sourceId: `approval-${approval.requestId}`,
      type: 'approval',
    }));

  if (approvalSegments.length === 0) {
    return;
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === 'assistant') {
    const existingSegments = getAssistantSegments(lastMessage);
    const nextSegments = [
      ...existingSegments.filter((segment) => segment.type !== 'approval'),
      ...approvalSegments.map(({ sourceId, ...segment }) => segment),
    ];
    messages[messages.length - 1] = {
      ...lastMessage,
      pendingApprovals: approvalSegments.map((segment) => segment.approval),
      segments: nextSegments,
    };
    return;
  }

  messages.push(createRenderableAssistantMessage(approvalSegments));
}

function markTrailingAssistantMessageAsPending(messages) {
  const lastUserIndex = findLastMessageIndex(messages, 'user');
  if (lastUserIndex === -1) {
    return;
  }

  for (let index = messages.length - 1; index > lastUserIndex; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') {
      continue;
    }

    if (assistantMessageHasText(message)) {
      return;
    }

    if (assistantMessageHasToolActivity(message)) {
      message.pendingThinking = true;
    }

    return;
  }
}

function mergeLegacyToolEvents(messages, language) {
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

function buildToolActivity(messages, language) {
  const items = collectToolActivityItems(messages);
  if (items.length === 0) {
    return null;
  }

  return {
    items: items.map((item) => ({
      category: item.category,
      key: item.key,
      label: formatToolActivityItemLabel(item, language),
      name: item.name,
      status: item.status,
      toolMeta: item.toolMeta || null,
    })),
    summaryParts: summarizeToolActivity(items, language),
    summarySeparator: language === 'zh' ? '，' : ', ',
  };
}

function collectToolActivityItems(messages) {
  const order = [];
  const latestByKey = new Map();

  for (const message of messages) {
    const item = normalizeToolActivityEvent(message);
    if (!item) {
      continue;
    }

    if (!latestByKey.has(item.key)) {
      order.push(item.key);
    }

    const previousItem = latestByKey.get(item.key);
    latestByKey.set(item.key, mergeToolActivityItems(previousItem, item));
  }

  return order.map((key) => latestByKey.get(key)).filter(Boolean);
}

function mergeToolActivityItems(previousItem, nextItem) {
  if (!previousItem) {
    return nextItem;
  }

  const mergedItem = {
    ...nextItem,
    toolMeta: nextItem.toolMeta || previousItem.toolMeta || null,
  };

  if (shouldPreservePreviousToolActivityLabel(previousItem, nextItem)) {
    return {
      ...mergedItem,
      label: previousItem.label,
    };
  }

  return mergedItem;
}

function shouldPreservePreviousToolActivityLabel(previousItem, nextItem) {
  if (!previousItem?.label) {
    return false;
  }

  if (!nextItem?.label) {
    return true;
  }

  const previousCategory = previousItem.category || 'generic';
  const nextCategory = nextItem.category || 'generic';
  if (previousCategory !== nextCategory) {
    return false;
  }

  return isGenericToolActivityDetail(nextCategory, nextItem.label) && !isGenericToolActivityDetail(previousCategory, previousItem.label);
}

function isGenericToolActivityDetail(category, label) {
  const value = (label || '').trim();
  if (!value) {
    return true;
  }

  if (category === 'read') {
    return /^Read file$/i.test(value);
  }

  if (category === 'browse') {
    return /^Browsed files?$/i.test(value);
  }

  if (category === 'search') {
    return /^Searched files?$/i.test(value);
  }

  if (category === 'command') {
    return /^Run command$/i.test(value);
  }

  if (category === 'edit') {
    return /^(Wrote|Edited|Updated) file$/i.test(value);
  }

  if (category === 'fetch') {
    return /^Fetched webpage$/i.test(value);
  }

  if (category === 'todo') {
    return /^Updated todo$/i.test(value);
  }

  if (category === 'mcp') {
    return /^Called MCP$/i.test(value);
  }

  if (category === 'skill') {
    return /^Used skill$/i.test(value);
  }

  return false;
}

function normalizeToolActivityEvent(message) {
  if (!message) {
    return null;
  }

  if (!message.toolUseId && message.kind === 'tool_result') {
    return null;
  }

  const label = (message.toolLabel || message.content || message.title || '').trim();
  if (!label) {
    return null;
  }

  if (!message.toolUseId && /^[\[{]/.test(label)) {
    return null;
  }

  return {
    category: message.toolCategory || inferLegacyToolCategory(message),
    key: message.toolUseId || message.id,
    label,
    name: (message.toolName || '').trim(),
    status: message.status || (message.kind === 'tool_result' ? 'completed' : 'running'),
    toolMeta: normalizeToolActivityMeta(message.toolMeta),
  };
}

function normalizeToolActivityMeta(toolMeta) {
  if (!toolMeta || typeof toolMeta !== 'object') {
    return null;
  }

  if (toolMeta.type === 'edit') {
    const filePath = typeof toolMeta.filePath === 'string' ? toolMeta.filePath : '';
    const fileName = typeof toolMeta.fileName === 'string' ? toolMeta.fileName : '';
    const addedLines = Number.isFinite(toolMeta.addedLines) && toolMeta.addedLines >= 0 ? toolMeta.addedLines : null;
    const deletedLines = Number.isFinite(toolMeta.deletedLines) && toolMeta.deletedLines >= 0 ? toolMeta.deletedLines : null;

    return {
      addedLines,
      deletedLines,
      fileName,
      filePath,
      type: 'edit',
    };
  }

  return null;
}

function inferLegacyToolCategory(message) {
  const haystack = `${message?.title || ''} ${message?.content || ''}`.toLowerCase();

  if (haystack.includes('read ')) {
    return 'read';
  }

  if (haystack.includes('search')) {
    return 'search';
  }

  if (haystack.includes('bash') || haystack.includes('git ') || haystack.includes('python ') || haystack.includes('command')) {
    return 'command';
  }

  if (haystack.includes('edit ') || haystack.includes('write ')) {
    return 'edit';
  }

  return 'generic';
}

function summarizeToolActivity(items, language) {
  const summary = [];

  for (const status of ['completed', 'running', 'stopped', 'error']) {
    const counts = countToolActivityByCategory(items, status);
    for (const [category, count] of counts) {
      if (count === 1) {
        const singleItem = items.find((item) => item.status === status && (item.category || 'generic') === category);
        if (singleItem && shouldUseDetailedToolActivitySummary(singleItem)) {
          summary.push({
            key: `${status}-${category}-${singleItem.key}`,
            label: formatDetailedToolActivitySummary(singleItem, language),
            status,
          });
          continue;
        }
      }

      summary.push({
        key: `${status}-${category}-${count}`,
        label: formatToolActivityPhrase(status, category, count, language),
        status,
      });
    }
  }

  return summary;
}

function shouldUseDetailedToolActivitySummary(item) {
  const category = item?.category || 'generic';
  return item?.status === 'running' || category === 'skill' || category === 'mcp';
}

function formatDetailedToolActivitySummary(item, language) {
  if (item.category === 'skill') {
    const detail = normalizeNamedToolActivityDetail(item);
    return formatNamedToolActivityText(
      item.status,
      language === 'zh' ? '正在使用 Skill' : 'Using skill',
      language === 'zh' ? '已使用 Skill' : 'Used skill',
      language === 'zh' ? '已停止使用 Skill' : 'Stopped using skill',
      language === 'zh' ? 'Skill 执行失败' : 'Skill failed',
      detail,
    );
  }

  if (item.category === 'mcp') {
    const detail = normalizeNamedToolActivityDetail(item);
    return formatNamedToolActivityText(
      item.status,
      language === 'zh' ? '正在调用 MCP' : 'Calling MCP',
      language === 'zh' ? '已调用 MCP' : 'Called MCP',
      language === 'zh' ? '已停止调用 MCP' : 'Stopped calling MCP',
      language === 'zh' ? 'MCP 调用失败' : 'MCP call failed',
      detail,
    );
  }

  return formatToolActivityItemLabel(item, language);
}

function normalizeNamedToolActivityDetail(item) {
  if (item?.category === 'mcp') {
    const normalizedName = normalizeMcpToolName(item.name);
    if (normalizedName) {
      return normalizedName;
    }
  }

  return normalizeToolActivityLabel(item?.category, item?.label || '');
}

function normalizeMcpToolName(value) {
  const normalized = (value || '').trim();
  if (!normalized) {
    return '';
  }

  if (!normalized.startsWith('mcp__')) {
    return normalized;
  }

  return normalized
    .replace(/^mcp__/, '')
    .split('__')
    .filter(Boolean)
    .join(' / ');
}

function formatNamedToolActivityText(status, runningPrefix, completedPrefix, stoppedPrefix, errorPrefix, detail) {
  const prefix = status === 'running'
    ? runningPrefix
    : (status === 'completed'
      ? completedPrefix
      : (status === 'stopped' ? stoppedPrefix : errorPrefix));

  return detail ? `${prefix} ${detail}` : prefix;
}

function countToolActivityByCategory(items, targetStatus) {
  const orderedCategories = [];
  const counts = new Map();

  for (const item of items) {
    if (item.status !== targetStatus) {
      continue;
    }

    const category = item.category || 'generic';
    if (category === 'edit') {
      continue;
    }

    if (!counts.has(category)) {
      orderedCategories.push(category);
      counts.set(category, 0);
    }
    counts.set(category, counts.get(category) + 1);
  }

  return orderedCategories.map((category) => [category, counts.get(category)]);
}

function formatToolActivityPhrase(status, category, count, language) {
  if (language === 'zh') {
    return formatChineseToolActivityPhrase(status, category, count);
  }

  return formatEnglishToolActivityPhrase(status, category, count);
}

function formatChineseToolActivityPhrase(status, category, count) {
  if (category === 'read') {
    return formatChineseActivityLabel(status, count, '正在浏览文件', '已浏览文件', '已停止浏览文件', '浏览文件失败', '浏览', '个文件');
  }

  if (category === 'browse') {
    return formatChineseActivityLabel(status, count, '正在浏览目录', '已浏览目录', '已停止浏览目录', '浏览目录失败', '浏览', '个目录');
  }

  if (category === 'search') {
    return formatChineseActivityLabel(status, count, '正在执行搜索', '已执行搜索', '已停止执行搜索', '搜索失败', '执行', '个搜索');
  }

  if (category === 'command') {
    return formatChineseActivityLabel(status, count, '正在运行命令', '已运行命令', '已停止运行命令', '命令运行失败', '运行', '条命令');
  }

  if (category === 'edit') {
    return formatChineseActivityLabel(status, count, '正在编辑文件', '已编辑文件', '已停止编辑文件', '编辑文件失败', '编辑', '个文件');
  }

  if (category === 'fetch') {
    return formatChineseActivityLabel(status, count, '正在获取网页', '已获取网页', '已停止获取网页', '获取网页失败', '获取', '个网页');
  }

  if (category === 'todo') {
    return formatChineseActivityLabel(status, count, '正在更新待办', '已更新待办', '已停止更新待办', '待办更新失败', '更新', '项待办');
  }

  if (category === 'mcp') {
    return formatChineseActivityLabel(status, count, '正在调用 MCP', '已调用 MCP', '已停止调用 MCP', 'MCP 调用失败', '调用', '个 MCP 调用');
  }

  if (category === 'skill') {
    return formatChineseActivityLabel(status, count, '正在使用 Skill', '已使用 Skill', '已停止使用 Skill', 'Skill 执行失败', '使用', '个 Skill');
  }

  return formatChineseActivityLabel(status, count, '正在执行操作', '已执行操作', '已停止执行操作', '操作执行失败', '执行', '个操作');
}

function formatChineseActivityLabel(status, count, singularRunning, singularCompleted, singularStopped, singularError, pluralVerb, pluralUnit) {
  if (status === 'running') {
    if (count <= 1) {
      return singularRunning;
    }

    return `正在${pluralVerb} ${count} ${pluralUnit}`;
  }

  if (status === 'completed') {
    return `已${pluralVerb} ${count} ${pluralUnit}`;
  }

  if (status === 'stopped') {
    if (count <= 1) {
      return singularStopped;
    }

    return `已停止${pluralVerb} ${count} ${pluralUnit}`;
  }

  if (count <= 1) {
    return singularError;
  }

  return `${count} ${pluralUnit}${pluralVerb}失败`;
}

function formatEnglishToolActivityPhrase(status, category, count) {
  const labels = {
    browse: {
      completedMany: 'Browsed directories',
      completedOne: 'Browsed directory',
      error: 'Directory browse failed',
      running: 'Browsing directory',
      stoppedMany: 'Stopped browsing directories',
      stoppedOne: 'Stopped browsing directory',
    },
    command: {
      completedMany: 'Ran commands',
      completedOne: 'Ran command',
      error: 'Command failed',
      running: 'Running command',
      stoppedMany: 'Stopped commands',
      stoppedOne: 'Stopped command',
    },
    edit: {
      completedMany: 'Edited files',
      completedOne: 'Edited file',
      error: 'File edit failed',
      running: 'Editing file',
      stoppedMany: 'Stopped editing files',
      stoppedOne: 'Stopped editing file',
    },
    fetch: {
      completedMany: 'Fetched webpages',
      completedOne: 'Fetched webpage',
      error: 'Webpage fetch failed',
      running: 'Fetching webpage',
      stoppedMany: 'Stopped fetching webpages',
      stoppedOne: 'Stopped fetching webpage',
    },
    generic: {
      completedMany: 'Completed actions',
      completedOne: 'Completed action',
      error: 'Action failed',
      running: 'Running action',
      stoppedMany: 'Stopped actions',
      stoppedOne: 'Stopped action',
    },
    mcp: {
      completedMany: 'Called MCP tools',
      completedOne: 'Called MCP',
      error: 'MCP call failed',
      running: 'Calling MCP',
      stoppedMany: 'Stopped MCP calls',
      stoppedOne: 'Stopped MCP call',
    },
    read: {
      completedMany: 'Read files',
      completedOne: 'Read file',
      error: 'File read failed',
      running: 'Reading file',
      stoppedMany: 'Stopped reading files',
      stoppedOne: 'Stopped reading file',
    },
    search: {
      completedMany: 'Completed searches',
      completedOne: 'Completed search',
      error: 'Search failed',
      running: 'Searching',
      stoppedMany: 'Stopped searches',
      stoppedOne: 'Stopped search',
    },
    skill: {
      completedMany: 'Used skills',
      completedOne: 'Used skill',
      error: 'Skill failed',
      running: 'Using skill',
      stoppedMany: 'Stopped skills',
      stoppedOne: 'Stopped skill',
    },
    todo: {
      completedMany: 'Updated todos',
      completedOne: 'Updated todo',
      error: 'Todo update failed',
      running: 'Updating todo',
      stoppedMany: 'Stopped todo updates',
      stoppedOne: 'Stopped todo update',
    },
  };
  const copy = labels[category] || labels.generic;

  if (status === 'running') {
    if (count <= 1) {
      return copy.running;
    }

    return `${copy.running} (${count})`;
  }

  if (status === 'completed') {
    return count <= 1 ? `${copy.completedOne} (1)` : `${copy.completedMany} (${count})`;
  }

  if (status === 'stopped') {
    return count <= 1 ? copy.stoppedOne : `${copy.stoppedMany} (${count})`;
  }

  if (count <= 1) {
    return copy.error;
  }

  return `${copy.error} (${count})`;
}

function formatToolActivityItemLabel(item, language) {
  if (language === 'zh') {
    return formatChineseToolActivityItemLabel(item);
  }

  return formatEnglishToolActivityItemLabel(item);
}

function formatChineseToolActivityItemLabel(item) {
  const detail = normalizeToolActivityLabel(item.category, item.label);

  if (item.category === 'read') {
    return formatToolActivityItemText(item.status, '正在浏览文件', '已浏览文件', '已停止浏览文件', '浏览文件失败', detail);
  }

  if (item.category === 'browse') {
    return formatToolActivityItemText(item.status, '正在浏览目录', '已浏览目录', '已停止浏览目录', '浏览目录失败', detail);
  }

  if (item.category === 'search') {
    return formatToolActivityItemText(item.status, '正在执行搜索', '已执行搜索', '已停止执行搜索', '搜索失败', detail);
  }

  if (item.category === 'command') {
    return formatToolActivityItemText(item.status, '正在运行命令', '已运行命令', '已停止运行命令', '命令运行失败', detail);
  }

  if (item.category === 'edit') {
    return formatToolActivityItemText(item.status, '正在编辑文件', '已编辑文件', '已停止编辑文件', '编辑文件失败', detail);
  }

  if (item.category === 'fetch') {
    return formatToolActivityItemText(item.status, '正在获取网页', '已获取网页', '已停止获取网页', '获取网页失败', detail);
  }

  if (item.category === 'todo') {
    return formatToolActivityItemText(item.status, '正在更新待办', '已更新待办', '已停止更新待办', '待办更新失败', detail);
  }

  if (item.category === 'mcp') {
    return formatToolActivityItemText(item.status, '正在调用 MCP', '已调用 MCP', '已停止调用 MCP', 'MCP 调用失败', detail);
  }

  if (item.category === 'skill') {
    return formatToolActivityItemText(item.status, '正在使用 Skill', '已使用 Skill', '已停止使用 Skill', 'Skill 执行失败', detail);
  }

  return formatToolActivityItemText(item.status, '正在执行操作', '已执行操作', '已停止执行操作', '操作执行失败', detail);
}

function formatEnglishToolActivityItemLabel(item) {
  const detail = normalizeToolActivityLabel(item.category, item.label);

  if (item.category === 'read') {
    return formatToolActivityItemText(item.status, 'Reading file', 'Read file', 'Stopped reading file', 'File read failed', detail);
  }

  if (item.category === 'browse') {
    return formatToolActivityItemText(item.status, 'Browsing directory', 'Browsed directory', 'Stopped browsing directory', 'Directory browse failed', detail);
  }

  if (item.category === 'search') {
    return formatToolActivityItemText(item.status, 'Searching', 'Completed search', 'Stopped search', 'Search failed', detail);
  }

  if (item.category === 'command') {
    return formatToolActivityItemText(item.status, 'Running command', 'Ran command', 'Stopped command', 'Command failed', detail);
  }

  if (item.category === 'edit') {
    return formatToolActivityItemText(item.status, 'Editing file', 'Edited file', 'Stopped editing file', 'File edit failed', detail);
  }

  if (item.category === 'fetch') {
    return formatToolActivityItemText(item.status, 'Fetching webpage', 'Fetched webpage', 'Stopped fetching webpage', 'Webpage fetch failed', detail);
  }

  if (item.category === 'todo') {
    return formatToolActivityItemText(item.status, 'Updating todo', 'Updated todo', 'Stopped todo update', 'Todo update failed', detail);
  }

  if (item.category === 'mcp') {
    return formatToolActivityItemText(item.status, 'Calling MCP', 'Called MCP', 'Stopped MCP call', 'MCP call failed', detail);
  }

  if (item.category === 'skill') {
    return formatToolActivityItemText(item.status, 'Using skill', 'Used skill', 'Stopped skill', 'Skill failed', detail);
  }

  return formatToolActivityItemText(item.status, 'Running action', 'Completed action', 'Stopped action', 'Action failed', detail);
}

function formatToolActivityItemText(status, runningPrefix, completedPrefix, stoppedPrefix, errorPrefix, detail) {
  const prefix = status === 'running'
    ? runningPrefix
    : (status === 'completed'
      ? completedPrefix
      : (status === 'stopped' ? stoppedPrefix : errorPrefix));

  return detail ? `${prefix} ${detail}` : prefix;
}

function normalizeToolActivityLabel(category, label) {
  const value = (label || '').trim();
  if (!value) {
    return '';
  }

  if (category === 'read') {
    return value === 'Read file' ? '' : value.replace(/^Read\s+/i, '').trim();
  }

  if (category === 'browse') {
    return value === 'Browsed files' ? '' : value.replace(/^Browsed\s+/i, '').trim();
  }

  if (category === 'search') {
    return value === 'Searched files' ? '' : value.replace(/^Searched(?:\s+for)?\s+/i, '').trim();
  }

  if (category === 'edit') {
    return /^(Wrote|Edited|Updated)\s+file$/i.test(value) ? '' : value.replace(/^(Wrote|Edited|Updated)\s+/i, '').trim();
  }

  if (category === 'fetch') {
    return value === 'Fetched webpage' ? '' : value.replace(/^Fetched\s+/i, '').trim();
  }

  return value;
}

function formatPendingApprovalActionLabel(approval, language) {
  const detail = formatPendingApprovalDetail(approval);
  const category = approval?.category || 'generic';

  if (language === 'zh') {
    const prefixMap = {
      browse: '浏览目录',
      command: '运行命令',
      edit: '编辑文件',
      fetch: '获取网页',
      generic: '执行操作',
      mcp: '调用 MCP',
      read: '浏览文件',
      search: '执行搜索',
      skill: '使用 Skill',
      todo: '更新待办',
    };

    return detail ? `${prefixMap[category] || prefixMap.generic} ${detail}` : (prefixMap[category] || prefixMap.generic);
  }

  const prefixMap = {
    browse: 'Browse directory',
    command: 'Run command',
    edit: 'Edit file',
    fetch: 'Fetch webpage',
    generic: 'Run action',
    mcp: 'Call MCP',
    read: 'Read file',
    search: 'Run search',
    skill: 'Use skill',
    todo: 'Update todo',
  };

  return detail ? `${prefixMap[category] || prefixMap.generic} ${detail}` : (prefixMap[category] || prefixMap.generic);
}

function formatPendingApprovalDetail(approval) {
  const blockedPath = (approval?.blockedPath || '').trim();
  if (blockedPath) {
    return blockedPath;
  }

  const detail = normalizeToolActivityLabel(approval?.category, approval?.detail || '');
  if (detail) {
    return detail;
  }

  return (approval?.displayName || approval?.title || approval?.toolName || '').trim();
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
      detail: isChinese ? '设置当前会话模型，例如 /model sonnet、/model opus，或直接填写完整模型名' : 'Set the current model, for example /model sonnet, /model opus, or a full model name',
      name: 'model',
      template: '/model ',
    },
    {
      aliases: [],
      description: isChinese ? '切换当前会话 provider' : 'Switch the current provider',
      detail: isChinese ? '可用值：claude、codex。切换后下一条消息会从新的 provider 线程开始。' : 'Available values: claude, codex. The next message starts on a fresh provider thread.',
      name: 'provider',
      template: '/provider ',
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
    ...builtinCommands.slice(0, 6),
    ...skillCommands,
    builtinCommands[6],
  ];
}

function getComposerProviderOptions(copy, providerCatalog) {
  return [
    {
      icon: Bot,
      label: copy.providerOptionClaude,
      summary: copy.providerSummaryClaude,
      value: 'claude',
    },
    {
      icon: Sparkles,
      label: copy.providerOptionCodex,
      summary: copy.providerSummaryCodex,
      value: 'codex',
    },
  ].filter((option) => isProviderSelectable(providerCatalog, option.value));
}

function getComposerModelOptions(copy, provider, selectedModel, currentModel, availableProviderModels = []) {
  const providerLabel = getProviderDisplayName(provider, copy);
  const defaultCurrentLabel = !selectedModel ? getModelDisplayName(currentModel, availableProviderModels, provider) : '';
  const defaultOption = {
    commandValue: 'default',
    label: copy.modelOptionDefault,
    summary: copy.modelSummaryDefault(defaultCurrentLabel, providerLabel),
    value: '',
  };

  const dynamicPresets = availableProviderModels
    .filter((model) => model && typeof model.value === 'string' && model.value)
    .map((model) => ({
      commandValue: model.value,
      label: model.label || getModelDisplayName(model.value, availableProviderModels, provider) || model.value,
      summary: model.summary || model.description || '',
      value: model.value,
    }));

  const fallbackPresets = provider === 'claude' ? [
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
  ] : [];

  const presets = [defaultOption, ...(dynamicPresets.length > 0 ? dynamicPresets : fallbackPresets)];

  if (!selectedModel || presets.some((option) => option.value === selectedModel)) {
    return presets;
  }

  return [
    ...presets,
    {
      commandValue: selectedModel,
      label: getModelDisplayName(selectedModel, availableProviderModels, provider) || copy.modelOptionCustom,
      summary: copy.modelSummaryCustom(getModelDisplayName(currentModel || selectedModel, availableProviderModels, provider) || selectedModel),
      value: selectedModel,
    },
  ];
}

function getComposerSessionModeOptions(copy) {
  return [
    {
      commandValue: 'ask',
      icon: Hand,
      label: copy.modeOptionAskBeforeEdits,
      summary: copy.modeSummaryAskBeforeEdits,
      value: 'default',
    },
    {
      commandValue: 'auto',
      icon: Pencil,
      label: copy.modeOptionEditAutomatically,
      summary: copy.modeSummaryEditAutomatically,
      value: 'acceptEdits',
    },
    {
      commandValue: 'plan',
      icon: BrainCircuit,
      label: copy.modeOptionPlanMode,
      summary: copy.modeSummaryPlanMode,
      value: 'plan',
    },
  ];
}

function getSessionModeLabel(permissionMode, copy) {
  switch (permissionMode) {
    case 'acceptEdits':
      return copy.modeOptionEditAutomatically;
    case 'plan':
      return copy.modeOptionPlanMode;
    case 'dontAsk':
      return 'Don\'t Ask';
    case 'bypassPermissions':
      return 'Bypass Permissions';
    case 'auto':
      return 'Auto mode';
    case 'default':
    default:
      return copy.modeOptionAskBeforeEdits;
  }
}

function getSessionModeCommandValue(permissionMode) {
  switch (permissionMode) {
    case 'acceptEdits':
      return 'auto';
    case 'plan':
      return 'plan';
    case 'dontAsk':
      return 'dont-ask';
    case 'bypassPermissions':
      return 'bypass';
    case 'auto':
      return 'auto-mode';
    case 'default':
    default:
      return 'ask';
  }
}

function getSessionModeIcon(permissionMode) {
  switch (permissionMode) {
    case 'acceptEdits':
      return Pencil;
    case 'plan':
      return BrainCircuit;
    case 'bypassPermissions':
      return AlertTriangle;
    case 'dontAsk':
    case 'auto':
      return Wrench;
    case 'default':
    default:
      return Hand;
  }
}

function normalizeProviderKey(value) {
  return value === 'codex' ? 'codex' : 'claude';
}

function getLockedProviderChipLabel(provider) {
  return normalizeProviderKey(provider) === 'codex' ? 'Codex' : 'Claude Code';
}

function getProviderBadgeClasses(provider) {
  return normalizeProviderKey(provider) === 'codex'
    ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-400/80 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/16'
    : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/16';
}

function getProviderDotClasses(provider) {
  return normalizeProviderKey(provider) === 'codex'
    ? 'bg-sky-500 dark:bg-sky-300'
    : 'bg-emerald-500 dark:bg-emerald-300';
}

function getSelectedProviderBadgeClasses() {
  return 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-400/80 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/16';
}

function getSelectedProviderDotClasses() {
  return 'bg-amber-500 dark:bg-amber-300';
}

function isSessionProviderLocked(session) {
  if (!session || !Array.isArray(session.messages)) {
    return Boolean(session?.providerLocked);
  }

  return Boolean(
    session.providerLocked
    || session.messages.some((message) => (
      message?.role === 'user'
      || (message?.role === 'event' && message?.kind === 'command')
    )),
  );
}

function normalizeProviderCommandArg(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'claude' || normalized === 'codex') {
    return normalized;
  }

  return '';
}

function getProviderDisplayName(provider, copy) {
  return normalizeProviderKey(provider) === 'codex'
    ? copy.providerOptionCodex
    : copy.providerOptionClaude;
}

function getProviderInfo(providerCatalog, provider, fallbackProvider = 'claude') {
  const normalizedProvider = normalizeProviderKey(provider || fallbackProvider);
  if (providerCatalog && providerCatalog[normalizedProvider]) {
    return providerCatalog[normalizedProvider];
  }

  const fallbackKey = normalizeProviderKey(fallbackProvider);
  if (providerCatalog && providerCatalog[fallbackKey]) {
    return providerCatalog[fallbackKey];
  }

  return {
    available: false,
    enabled: true,
    key: normalizedProvider,
    label: normalizedProvider === 'codex' ? 'Codex' : 'Claude',
    models: [],
    skills: [],
    version: '',
  };
}

function getEnabledProviderKeys(providerCatalog) {
  return PROVIDER_KEYS.filter((provider) => getProviderInfo(providerCatalog, provider, provider).enabled !== false);
}

function getAvailableEnabledProviderKeys(providerCatalog) {
  return PROVIDER_KEYS.filter((provider) => isProviderSelectable(providerCatalog, provider));
}

function isProviderSelectable(providerCatalog, provider) {
  const providerInfo = getProviderInfo(providerCatalog, provider, provider);
  return providerInfo.enabled !== false && Boolean(providerInfo.available);
}

function resolveProviderSelection(providerCatalog, preferredProvider, fallbackProvider = 'claude') {
  const preferredKey = normalizeProviderKey(preferredProvider || fallbackProvider);
  const availableEnabledProviders = getAvailableEnabledProviderKeys(providerCatalog);
  if (availableEnabledProviders.length > 0) {
    return availableEnabledProviders.includes(preferredKey)
      ? preferredKey
      : availableEnabledProviders[0];
  }

  const enabledProviders = getEnabledProviderKeys(providerCatalog);
  if (enabledProviders.length > 0) {
    return enabledProviders.includes(preferredKey)
      ? preferredKey
      : enabledProviders[0];
  }

  return normalizeProviderKey(fallbackProvider);
}

function getModelDisplayName(value, availableProviderModels = [], provider = 'claude') {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const matchedModel = availableProviderModels.find((model) => (
    typeof model?.value === 'string'
    && model.value.trim().toLowerCase() === normalized
    && typeof model.label === 'string'
    && model.label.trim()
  ));
  if (matchedModel) {
    return matchedModel.label.trim();
  }

  if (normalizeProviderKey(provider) === 'codex') {
    return value.trim();
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

function getMessageAttachments(message) {
  return normalizeComposerAttachments(message?.attachments);
}

function mergeComposerAttachments(currentAttachments, nextAttachments) {
  return normalizeComposerAttachments([...(currentAttachments || []), ...(nextAttachments || [])]);
}

function normalizeComposerAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const normalized = [];
  const seenPaths = new Set();

  for (const attachment of attachments) {
    const normalizedAttachment = normalizeComposerAttachment(attachment);
    if (!normalizedAttachment || seenPaths.has(normalizedAttachment.path)) {
      continue;
    }

    seenPaths.add(normalizedAttachment.path);
    normalized.push(normalizedAttachment);
  }

  return normalized;
}

function normalizeComposerAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }

  const attachmentPath = typeof attachment.path === 'string' ? attachment.path.trim() : '';
  if (!attachmentPath) {
    return null;
  }

  const attachmentName = typeof attachment.name === 'string' && attachment.name.trim()
    ? attachment.name.trim()
    : getFileBaseName(attachmentPath);

  return {
    kind: normalizeComposerAttachmentKind(attachment.kind, attachmentPath),
    name: attachmentName,
    path: attachmentPath,
  };
}

function normalizeComposerAttachmentKind(kind, attachmentPath) {
  if (kind === 'image' || kind === 'file') {
    return kind;
  }

  const extension = getFileExtension(attachmentPath);
  return IMAGE_ATTACHMENT_EXTENSIONS.has(extension) ? 'image' : 'file';
}

function getClipboardFiles(clipboardData) {
  if (!clipboardData) {
    return [];
  }

  const files = [];
  const seenKeys = new Set();

  const appendFile = (file) => {
    if (!(file instanceof File)) {
      return;
    }

    const filePath = typeof file.path === 'string' ? file.path.trim() : '';
    const key = [file.name, file.size, file.type, filePath].join('::');
    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    files.push(file);
  };

  if (clipboardData.files && clipboardData.files.length > 0) {
    Array.from(clipboardData.files).forEach(appendFile);
  }

  if (clipboardData.items && clipboardData.items.length > 0) {
    Array.from(clipboardData.items).forEach((item) => {
      if (item.kind !== 'file') {
        return;
      }

      const file = item.getAsFile();
      appendFile(file);
    });
  }

  return files;
}

async function createPastedAttachmentPayload(file) {
  const attachmentKind = typeof file.type === 'string' && file.type.toLowerCase().startsWith('image/')
    ? 'image'
    : normalizeComposerAttachmentKind('', file.path || file.name || '');
  const attachmentName = file.name || '';
  const attachmentPath = typeof file.path === 'string' ? file.path.trim() : '';

  if (attachmentPath) {
    return {
      kind: attachmentKind,
      mimeType: file.type || '',
      name: attachmentName || getFileBaseName(attachmentPath),
      path: attachmentPath,
    };
  }

  const dataBase64 = await readFileAsBase64(file);
  return {
    dataBase64,
    kind: attachmentKind,
    mimeType: file.type || '',
    name: attachmentName || '',
  };
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error || new Error('Failed to read pasted file.'));
    };

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',').pop() : result;
      resolve(base64 || '');
    };

    reader.readAsDataURL(file);
  });
}

function getFileBaseName(filePath) {
  const normalizedPath = String(filePath || '').replace(/\\/g, '/');
  return normalizedPath.split('/').filter(Boolean).pop() || normalizedPath;
}

function getFileExtension(filePath) {
  const fileName = getFileBaseName(filePath);
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex >= 0 ? fileName.slice(lastDotIndex + 1).toLowerCase() : '';
}

function getMarkdownCopyText(copyShell) {
  if (!(copyShell instanceof HTMLElement)) {
    return '';
  }

  const copyKind = copyShell.getAttribute('data-copy-kind');
  if (copyKind === 'table') {
    return serializeMarkdownTableForCopy(copyShell.querySelector('table'));
  }

  const codeElement = copyShell.querySelector('pre code') || copyShell.querySelector('pre');
  return typeof codeElement?.textContent === 'string' ? codeElement.textContent : '';
}

function serializeMarkdownTableForCopy(table) {
  if (!(table instanceof HTMLTableElement)) {
    return '';
  }

  return Array.from(table.querySelectorAll('tr'))
    .map((row) => Array.from(row.querySelectorAll('th, td'))
      .map((cell) => normalizeMarkdownCopyCell(cell.textContent || ''))
      .join('\t'))
    .filter(Boolean)
    .join('\n');
}

function normalizeMarkdownCopyCell(value) {
  return value.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

async function copyTextToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard API unavailable.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('Clipboard API unavailable.');
  }
}

function flashMarkdownCopyButton(button) {
  if (!(button instanceof HTMLElement) || typeof window === 'undefined') {
    return;
  }

  const defaultLabel = button.getAttribute('data-copy-default-label') || '';
  const successLabel = button.getAttribute('data-copy-success-label') || defaultLabel;
  const currentTimer = Number(button.dataset.copyResetTimer || 0);
  if (currentTimer) {
    window.clearTimeout(currentTimer);
  }

  button.setAttribute('aria-label', successLabel);
  button.setAttribute('title', successLabel);
  button.dataset.copyActive = 'true';

  const timer = window.setTimeout(() => {
    button.setAttribute('aria-label', defaultLabel);
    button.setAttribute('title', defaultLabel);
    delete button.dataset.copyActive;
    delete button.dataset.copyResetTimer;
  }, 1600);

  button.dataset.copyResetTimer = String(timer);
}

function getComposerHistoryEntries(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const entries = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const value = getComposerHistoryValue(messages[index]);
    if (!value) {
      continue;
    }

    entries.push(value);
  }

  return entries;
}

function getComposerHistoryValue(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }

  if (message.role === 'user') {
    return typeof message.content === 'string' ? message.content.trim() : '';
  }

  if (message.role === 'event' && message.kind === 'command') {
    const title = typeof message.title === 'string' ? message.title.trim() : '';
    return title || (typeof message.content === 'string' ? message.content.trim() : '');
  }

  return '';
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
      `请使用已安装的本地 skill "${skillName}" 来处理这次请求。`,
      skillDescription ? `Skill 说明：${skillDescription}` : '',
      skillPath ? `Skill 路径：${skillPath}` : '',
      '',
      userRequest ? `用户请求：\n${userRequest}` : '如果这个 skill 需要额外信息，请先根据它的说明继续处理或主动追问。',
    ].filter(Boolean).join('\n');
  }

  return [
    `Please use the installed local skill "${skillName}" for this request.`,
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

function getInitialPaneLayout() {
  if (typeof window === 'undefined') {
    return DEFAULT_PANE_LAYOUT;
  }

  try {
    const storedValue = window.localStorage.getItem(PANE_LAYOUT_STORAGE_KEY);
    if (!storedValue) {
      return DEFAULT_PANE_LAYOUT;
    }

    return normalizePaneLayout(JSON.parse(storedValue));
  } catch {
    return DEFAULT_PANE_LAYOUT;
  }
}

function getInitialPaneRecentIds() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(PANE_RECENT_IDS_STORAGE_KEY);
    if (!storedValue) {
      return [];
    }

    return normalizePaneRecentIds(JSON.parse(storedValue));
  } catch {
    return [];
  }
}

function getInitialPaneBoardSize() {
  if (typeof window === 'undefined') {
    return { height: 0, width: 0 };
  }

  return getEstimatedPaneBoardSize(window.innerWidth, window.innerHeight);
}

function getEstimatedPaneBoardSize(windowWidth, windowHeight) {
  const estimatedTopBarHeight = 44;
  const estimatedPanePadding = 2;

  return {
    height: Math.max(0, windowHeight - estimatedTopBarHeight - estimatedPanePadding),
    width: Math.max(0, windowWidth - SIDEBAR_EXPANDED_WIDTH - estimatedPanePadding),
  };
}

function syncPaneRecentIds(currentIds, panes, focusedPaneId) {
  const paneIds = normalizePaneRecentIds(null, panes);
  const knownPaneIds = new Set(paneIds);
  const nextIds = [];

  if (focusedPaneId && knownPaneIds.has(focusedPaneId)) {
    nextIds.push(focusedPaneId);
  }

  for (const paneId of Array.isArray(currentIds) ? currentIds : []) {
    if (!paneId || paneId === focusedPaneId || !knownPaneIds.has(paneId) || nextIds.includes(paneId)) {
      continue;
    }

    nextIds.push(paneId);
  }

  for (const paneId of paneIds) {
    if (!nextIds.includes(paneId)) {
      nextIds.push(paneId);
    }
  }

  return arePaneIdListsEqual(currentIds, nextIds) ? currentIds : nextIds;
}

function normalizePaneRecentIds(value, panes = []) {
  const knownPaneIds = new Set(
    Array.isArray(panes) && panes.length > 0
      ? panes.map((pane) => pane?.id).filter(Boolean)
      : [],
  );
  const nextIds = [];

  for (const paneId of Array.isArray(value) ? value : []) {
    if (typeof paneId !== 'string' || !paneId.trim()) {
      continue;
    }

    const normalizedId = paneId.trim();
    if ((knownPaneIds.size > 0 && !knownPaneIds.has(normalizedId)) || nextIds.includes(normalizedId)) {
      continue;
    }

    nextIds.push(normalizedId);
  }

  if (knownPaneIds.size > 0) {
    for (const paneId of knownPaneIds) {
      if (!nextIds.includes(paneId)) {
        nextIds.push(paneId);
      }
    }
  }

  return nextIds;
}

function countAssignedPaneBindings(layout) {
  return normalizePaneLayout(layout).panes.filter((pane) => pane.sessionId && pane.workspaceId).length;
}

function resolveHydratedPaneState({ localLayout, localRecentIds, remoteLayout, remoteRecentIds }) {
  const normalizedLocalLayout = normalizePaneLayout(localLayout);
  const normalizedRemoteLayout = remoteLayout ? normalizePaneLayout(remoteLayout) : null;
  const shouldUseLocalLayout = shouldPreferLocalPaneLayout(normalizedLocalLayout, normalizedRemoteLayout);
  const resolvedLayout = shouldUseLocalLayout
    ? normalizedLocalLayout
    : (normalizedRemoteLayout || normalizedLocalLayout);
  const normalizedLocalRecentIds = normalizePaneRecentIds(localRecentIds, resolvedLayout.panes);
  const normalizedRemoteRecentIds = normalizePaneRecentIds(remoteRecentIds, resolvedLayout.panes);
  const shouldUseLocalRecentIds = shouldPreferLocalPaneRecentIds({
    localRecentIds: normalizedLocalRecentIds,
    preferredLayoutSource: shouldUseLocalLayout ? 'local' : 'remote',
    remoteRecentIds: normalizedRemoteRecentIds,
  });

  return {
    layout: resolvedLayout,
    recentPaneIds: syncPaneRecentIds(
      shouldUseLocalRecentIds ? normalizedLocalRecentIds : normalizedRemoteRecentIds,
      resolvedLayout.panes,
      resolvedLayout.focusedPaneId,
    ),
  };
}

function shouldPreferLocalPaneLayout(localLayout, remoteLayout) {
  if (!remoteLayout) {
    return true;
  }

  if (arePaneLayoutsEqual(localLayout, remoteLayout)) {
    return true;
  }

  const localAssignedPaneCount = countAssignedPaneBindings(localLayout);
  const remoteAssignedPaneCount = countAssignedPaneBindings(remoteLayout);
  if (localAssignedPaneCount !== remoteAssignedPaneCount) {
    return localAssignedPaneCount > remoteAssignedPaneCount;
  }

  if (localLayout.panes.length !== remoteLayout.panes.length) {
    return localLayout.panes.length > remoteLayout.panes.length;
  }

  return true;
}

function shouldPreferLocalPaneRecentIds({ localRecentIds, preferredLayoutSource, remoteRecentIds }) {
  if (localRecentIds.length !== remoteRecentIds.length) {
    return localRecentIds.length > remoteRecentIds.length;
  }

  if (arePaneIdListsEqual(localRecentIds, remoteRecentIds)) {
    return preferredLayoutSource === 'local';
  }

  return preferredLayoutSource === 'local';
}

function getPrioritizedPaneIds(panes, recentPaneIds, focusedPaneId) {
  return syncPaneRecentIds(recentPaneIds, panes, focusedPaneId);
}

function getVisiblePaneIds(panes, prioritizedPaneIds, maxPaneCount) {
  const paneIds = Array.isArray(panes) ? panes.map((pane) => pane?.id).filter(Boolean) : [];
  const capacity = Math.max(1, maxPaneCount || 1);
  if (paneIds.length <= capacity) {
    return paneIds;
  }

  const visiblePaneIdSet = new Set(prioritizedPaneIds.slice(0, capacity));
  return paneIds.filter((paneId) => visiblePaneIdSet.has(paneId));
}

function orderPaneViewsByIds(paneViews, orderedPaneIds) {
  const priority = new Map(
    (Array.isArray(orderedPaneIds) ? orderedPaneIds : []).map((paneId, index) => [paneId, index]),
  );

  return [...(Array.isArray(paneViews) ? paneViews : [])].sort((left, right) => {
    const leftRank = priority.has(left.id) ? priority.get(left.id) : Number.MAX_SAFE_INTEGER;
    const rightRank = priority.has(right.id) ? priority.get(right.id) : Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
}

function arePaneIdListsEqual(left, right) {
  if (left === right) {
    return true;
  }

  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function normalizePaneLayout(value) {
  const requestedCount = Array.isArray(value?.panes) && value.panes.length > 0 ? value.panes.length : 1;
  const nextPanes = normalizePaneLayoutPanes(value?.panes, requestedCount);
  const focusedPaneId = nextPanes.some((pane) => pane.id === value?.focusedPaneId)
    ? value.focusedPaneId
    : nextPanes[0].id;

  return {
    focusedPaneId,
    panes: nextPanes,
  };
}

function normalizePaneLayoutPanes(value, targetCount) {
  const normalized = Array.isArray(value)
    ? value
      .filter(Boolean)
      .map((pane, index) => {
        const sessionId = typeof pane.sessionId === 'string' && pane.sessionId.trim() ? pane.sessionId.trim() : null;
        const workspaceId = sessionId && typeof pane.workspaceId === 'string' && pane.workspaceId.trim()
          ? pane.workspaceId.trim()
          : null;

        return {
          id: typeof pane.id === 'string' && pane.id.trim() ? pane.id.trim() : `pane-${index + 1}`,
          sessionId,
          workspaceId,
        };
      })
    : [];

  const nextPanes = normalized.slice(0, targetCount);
  let nextIndex = nextPanes.length + 1;

  while (nextPanes.length < targetCount) {
    nextPanes.push({
      id: `pane-${nextIndex}`,
      sessionId: null,
      workspaceId: null,
    });
    nextIndex += 1;
  }

  return nextPanes;
}

function appendPaneToLayout(currentLayout, payload = {}) {
  return normalizePaneLayout({
    ...currentLayout,
    focusedPaneId: createNextPaneId(currentLayout?.panes),
    panes: [
      ...normalizePaneLayout(currentLayout).panes,
      {
        id: createNextPaneId(currentLayout?.panes),
        sessionId: null,
        workspaceId: payload.workspaceId || null,
      },
    ],
  });
}

function focusPaneInLayout(currentLayout, paneId) {
  if (!paneId) {
    return normalizePaneLayout(currentLayout);
  }

  return normalizePaneLayout({
    ...currentLayout,
    focusedPaneId: paneId,
  });
}

function assignSessionToPaneState(currentLayout, paneId, payload) {
  const normalized = normalizePaneLayout(currentLayout);
  const targetPaneId = normalized.panes.some((pane) => pane.id === paneId)
    ? paneId
    : normalized.focusedPaneId;

  return normalizePaneLayout({
    ...normalized,
    focusedPaneId: targetPaneId,
    panes: normalized.panes.map((pane) => (
      pane.id === targetPaneId
        ? {
          ...pane,
          sessionId: payload?.sessionId || null,
          workspaceId: payload?.workspaceId || null,
        }
        : pane
    )),
  });
}

function assignWorkspaceToPaneState(currentLayout, paneId, workspaceId) {
  const normalized = normalizePaneLayout(currentLayout);
  const targetPaneId = normalized.panes.some((pane) => pane.id === paneId)
    ? paneId
    : normalized.focusedPaneId;

  return normalizePaneLayout({
    ...normalized,
    panes: normalized.panes.map((pane) => (
      pane.id === targetPaneId
        ? {
          ...pane,
          sessionId: pane.sessionId,
          workspaceId: pane.sessionId ? (workspaceId || null) : null,
        }
        : pane
    )),
  });
}

function removePaneFromLayout(currentLayout, paneId) {
  const normalized = normalizePaneLayout(currentLayout);
  if (normalized.panes.length <= 1) {
    const targetPaneId = normalized.panes.some((pane) => pane.id === paneId)
      ? paneId
      : normalized.focusedPaneId;

    return normalizePaneLayout({
      ...normalized,
      focusedPaneId: targetPaneId,
      panes: normalized.panes.map((pane) => (
        pane.id === targetPaneId
          ? {
            ...pane,
            sessionId: null,
            workspaceId: null,
          }
          : pane
      )),
    });
  }

  const filteredPanes = normalized.panes.filter((pane) => pane.id !== paneId);
  const nextFocusedPane = filteredPanes.find((pane) => pane.id === normalized.focusedPaneId)
    || filteredPanes[Math.max(0, normalized.panes.findIndex((pane) => pane.id === paneId) - 1)]
    || filteredPanes[0];

  return normalizePaneLayout({
    focusedPaneId: nextFocusedPane?.id || filteredPanes[0]?.id || DEFAULT_PANE_LAYOUT.focusedPaneId,
    panes: filteredPanes,
  });
}

function normalizePaneLayoutWithAppState(currentLayout, appState) {
  const normalized = normalizePaneLayout(currentLayout);

  const panes = normalized.panes.map((pane) => {
    if (!pane.workspaceId) {
      return pane;
    }

    const workspace = appState.workspaces.find((entry) => entry.id === pane.workspaceId);
    if (!workspace) {
      return {
        ...pane,
        sessionId: null,
        workspaceId: null,
      };
    }

    if (!pane.sessionId) {
      return pane;
    }

    const session = workspace.sessions.find((entry) => entry.id === pane.sessionId);
    if (session) {
      return pane;
    }

    return pane;
  });

  return normalizePaneLayout({
    ...normalized,
    panes,
  });
}

function arePaneLayoutsEqual(left, right) {
  return JSON.stringify(normalizePaneLayout(left)) === JSON.stringify(normalizePaneLayout(right));
}

function createNextPaneId(existingPanes) {
  const normalized = Array.isArray(existingPanes) ? existingPanes : [];
  const maxIndex = normalized.reduce((currentMax, pane) => {
    const match = /^pane-(\d+)$/.exec(pane?.id || '');
    if (!match) {
      return currentMax;
    }

    return Math.max(currentMax, Number.parseInt(match[1], 10));
  }, 0);

  return `pane-${maxIndex + 1}`;
}

function createSessionCacheKey(workspaceId, sessionId) {
  if (!workspaceId || !sessionId) {
    return '';
  }

  return `${workspaceId}:${sessionId}`;
}

function buildSessionPaneBindingMap(panes) {
  const bindingMap = new Map();

  (Array.isArray(panes) ? panes : []).forEach((pane, index) => {
    const cacheKey = createSessionCacheKey(pane?.workspaceId, pane?.sessionId);
    if (!cacheKey) {
      return;
    }

    const paneNumber = index + 1;
    const existingNumbers = bindingMap.get(cacheKey) || [];
    bindingMap.set(cacheKey, [...existingNumbers, paneNumber]);
  });

  return bindingMap;
}

function getPaneAccentColorAlpha(paneNumber, alpha) {
  const seed = getPaneAccentSeed(paneNumber);
  return `hsl(${formatPaneAccentToken(seed.hue, seed.saturation, seed.lightness, alpha)})`;
}

function getPaneAccentColor(paneNumber) {
  const seed = getPaneAccentSeed(paneNumber);
  return `hsl(${formatPaneAccentToken(seed.hue, seed.saturation, seed.lightness)})`;
}

function getPaneAccentTone(paneNumber) {
  const seed = getPaneAccentSeed(paneNumber);

  return {
    backgroundDark: formatPaneAccentToken(
      seed.hue,
      clampNumber(seed.saturation + 6, 52, 100),
      clampNumber(seed.lightness + 2, 42, 56),
      0.16,
    ),
    backgroundLight: formatPaneAccentToken(
      seed.hue,
      clampNumber(seed.saturation - 14, 42, 92),
      96,
    ),
    borderDark: formatPaneAccentToken(
      seed.hue,
      clampNumber(seed.saturation - 4, 50, 92),
      clampNumber(seed.lightness + 12, 54, 68),
      0.9,
    ),
    borderLight: formatPaneAccentToken(
      seed.hue,
      clampNumber(seed.saturation - 8, 44, 88),
      clampNumber(seed.lightness + 18, 58, 72),
    ),
    textDark: formatPaneAccentToken(
      seed.hue,
      clampNumber(seed.saturation + 8, 58, 100),
      clampNumber(seed.lightness + 24, 72, 84),
    ),
    textLight: formatPaneAccentToken(
      seed.hue,
      clampNumber(seed.saturation + 4, 48, 100),
      clampNumber(seed.lightness - 14, 32, 42),
    ),
  };
}

function getPaneAccentSeed(paneNumber) {
  const palette = [
    { hue: 222, saturation: 78, lightness: 52 },
    { hue: 36, saturation: 88, lightness: 48 },
    { hue: 332, saturation: 74, lightness: 52 },
    { hue: 145, saturation: 68, lightness: 34 },
    { hue: 4, saturation: 74, lightness: 54 },
    { hue: 268, saturation: 62, lightness: 56 },
    { hue: 190, saturation: 78, lightness: 42 },
    { hue: 84, saturation: 72, lightness: 38 },
  ];
  const normalizedPaneNumber = Math.max(1, paneNumber);
  if (normalizedPaneNumber <= palette.length) {
    return palette[normalizedPaneNumber - 1];
  }

  const overflowIndex = normalizedPaneNumber - palette.length - 1;
  return {
    hue: Math.round((overflowIndex * 137.508 + 18) % 360),
    saturation: overflowIndex % 2 === 0 ? 74 : 64,
    lightness: overflowIndex % 3 === 0 ? 46 : (overflowIndex % 3 === 1 ? 54 : 40),
  };
}

function formatPaneAccentToken(hue, saturation, lightness, alpha) {
  const normalizedHue = Math.round(hue);
  const normalizedSaturation = Math.round(clampNumber(saturation, 0, 100));
  const normalizedLightness = Math.round(clampNumber(lightness, 0, 100));

  return alpha == null
    ? `${normalizedHue} ${normalizedSaturation}% ${normalizedLightness}%`
    : `${normalizedHue} ${normalizedSaturation}% ${normalizedLightness}% / ${alpha}`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function areSessionSnapshotsEqual(left, right) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id
    && left.workspaceId === right.workspaceId
    && left.updatedAt === right.updatedAt
    && left.status === right.status
    && (left.messages?.length || 0) === (right.messages?.length || 0)
    && (left.pendingApprovals?.length || 0) === (right.pendingApprovals?.length || 0)
  );
}

function buildPaneViewModel({
  activeSession,
  appState,
  copy,
  focusedPaneId,
  sendingPaneIds,
  language,
  paneCount,
  pane,
  sessionViewCache,
}) {
  const workspace = appState.workspaces.find((entry) => entry.id === pane.workspaceId) || null;
  const sessionMeta = workspace?.sessions.find((entry) => entry.id === pane.sessionId) || null;
  const sessionCacheKey = createSessionCacheKey(pane.workspaceId, pane.sessionId);
  const isSelectedPaneSession = (
    activeSession
    && activeSession.workspaceId === pane.workspaceId
    && activeSession.id === pane.sessionId
  );
  const session = isSelectedPaneSession
    ? activeSession
    : (sessionViewCache[sessionCacheKey] || null);
  const pendingApprovals = Array.isArray(session?.pendingApprovals)
    ? session.pendingApprovals.filter(Boolean)
    : [];
  const isPaneSending = Array.isArray(sendingPaneIds) && sendingPaneIds.includes(pane.id);
  const renderableMessages = session
    ? mergeRenderableMessages(
      session.messages || [],
      language,
      Boolean(isPaneSending || session.status === 'running'),
      pendingApprovals,
    )
    : [];
  const isRunning = Boolean(session?.isRunning || sessionMeta?.isRunning || session?.status === 'running');

  return {
    id: pane.id,
    isBusy: isRunning,
    isFocused: pane.id === focusedPaneId,
    isLoading: Boolean(pane.sessionId && !session && sessionMeta),
    isOnlyPane: paneCount <= 1,
    isSending: Boolean(isPaneSending),
    renderableMessages,
    session,
    sessionMeta,
    shouldShowRunIndicator: shouldRenderRunIndicator(session, renderableMessages, isPaneSending),
    title: sessionMeta?.title || session?.title || copy.paneEmptyTitle,
    workspace,
    workspaceName: workspace?.name || '',
  };
}

function getAdaptivePaneLimit(width, height) {
  if (!width || !height) {
    return 1;
  }

  const maxColumns = Math.max(1, Math.floor(width / MIN_PANE_WIDTH));
  const maxRows = Math.max(1, Math.floor(height / MIN_PANE_HEIGHT));
  return Math.max(1, maxColumns * maxRows);
}

function getAdaptivePaneGridSpec(count, width, height) {
  const paneCount = Math.max(1, count || 1);
  if (!width || !height) {
    return {
      columns: 1,
      rows: paneCount,
    };
  }
  const isLandscape = width >= height;

  if (paneCount === 1) {
    return { columns: 1, rows: 1 };
  }

  if (paneCount === 2) {
    return isLandscape ? { columns: 2, rows: 1 } : { columns: 1, rows: 2 };
  }

  if (paneCount === 3) {
    return isLandscape ? { columns: 3, rows: 1 } : { columns: 1, rows: 3 };
  }

  if (paneCount === 4) {
    if (width >= height * 1.7) {
      return { columns: 4, rows: 1 };
    }

    if (height >= width * 1.7) {
      return { columns: 1, rows: 4 };
    }

    return { columns: 2, rows: 2 };
  }

  if (isLandscape) {
    const columns = Math.min(paneCount, Math.max(2, Math.floor(width / MIN_PANE_WIDTH)));
    return {
      columns,
      rows: Math.ceil(paneCount / columns),
    };
  }

  const rows = Math.min(paneCount, Math.max(2, Math.floor(height / MIN_PANE_HEIGHT)));
  return {
    columns: Math.ceil(paneCount / rows),
    rows,
  };
}

function setPaneViewportNode(refStore, paneId, node) {
  if (!refStore?.current || !paneId) {
    return;
  }

  if (node) {
    refStore.current.set(paneId, node);
    return;
  }

  refStore.current.delete(paneId);
}

function normalizeToastMessage(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value.message === 'string') {
    return value.message.trim();
  }

  return '';
}

function appendToast(currentItems, payload) {
  const message = normalizeToastMessage(payload?.message);
  if (!message) {
    return currentItems;
  }

  if (Array.isArray(currentItems) && currentItems.some((item) => item.message === message && item.tone === payload?.tone)) {
    return currentItems;
  }

  return [
    ...(Array.isArray(currentItems) ? currentItems : []),
    {
      duration: payload?.duration ?? 3200,
      id: createToastId(),
      message,
      tone: payload?.tone || 'error',
    },
  ].slice(-4);
}

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function getInitialSidebarCollapsed() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getWindowView() {
  if (typeof window === 'undefined') {
    return 'main';
  }

  return new URLSearchParams(window.location.search).get('view') || 'main';
}

function formatProviderStatusLabel(providerInfo, language) {
  const copy = COPY[language];
  return providerInfo?.label || copy.claudeCode;
}

function formatProviderStatusTitle(providerInfo, language) {
  const copy = COPY[language];
  const label = providerInfo?.label || copy.claudeCode;
  if (!providerInfo?.available) {
    return copy.providerUnavailable(label);
  }

  return normalizeProviderVersion(providerInfo.version, label) || label;
}

function getProviderStatusTone(providerInfo) {
  return providerInfo?.available ? 'success' : 'error';
}

function getCompactProviderMonogram(provider) {
  return normalizeProviderKey(provider) === 'codex' ? 'CX' : 'CL';
}

function normalizeProviderVersion(value, providerLabel) {
  if (!value) {
    return '';
  }

  const normalizedValue = String(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-1)[0] || '';

  return normalizedValue
    .replace(/\(Claude Code\)/gi, '')
    .replace(/^Claude Code\s*/i, '')
    .replace(/^codex-cli\s*/i, providerLabel ? `${providerLabel} ` : 'Codex ')
    .trim();
}

function shouldRenderRunIndicator(session, renderableMessages, isSending) {
  if (!session) {
    return false;
  }

  if (!isSending && session.status !== 'running') {
    return false;
  }

  const messages = Array.isArray(renderableMessages) && renderableMessages.length > 0
    ? renderableMessages
    : session.messages;
  const lastUserIndex = findLastMessageIndex(messages, 'user');
  if (lastUserIndex === -1) {
    return isSending;
  }

  const trailingMessages = messages.slice(lastUserIndex + 1);
  if (trailingMessages.some((message) => message.role === 'assistant' && assistantMessageHasText(message))) {
    return false;
  }

  if (trailingMessages.some((message) => message.role === 'assistant' && assistantMessageHasRunningToolActivity(message))) {
    return false;
  }

  if (trailingMessages.some((message) => message.role === 'assistant' && assistantMessageHasToolActivity(message))) {
    return false;
  }

  if (trailingMessages.some((message) => message.role === 'assistant' && assistantMessageHasPendingApproval(message))) {
    return false;
  }

  return true;
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
