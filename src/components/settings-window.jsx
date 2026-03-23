import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit,
  ChevronDown,
  Info,
  LoaderCircle,
  Settings,
  TerminalSquare,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToastViewport } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const PROVIDER_KEYS = ['claude', 'codex'];
const LANGUAGE_STORAGE_KEY = 'cc-desktop-proxy-language';
const PANE_FINISH_FLASH_ENABLED_STORAGE_KEY = 'cc-desktop-proxy-pane-finish-flash-enabled';
const PANE_SIZE_LIMIT_IGNORED_STORAGE_KEY = 'cc-desktop-proxy-pane-size-limit-ignored';
const THEME_STORAGE_KEY = 'cc-desktop-proxy-theme';
const EMPTY_NETWORK_PROXY_SETTINGS = {
  allProxy: '',
  enabled: false,
  httpProxy: '',
  httpsProxy: '',
  noProxy: '',
};
const EMPTY_APP_STATE = {
  appInfo: {
    arch: '',
    chromeVersion: '',
    electronVersion: '',
    name: '',
    nodeVersion: '',
    userDataPath: '',
    version: '',
  },
  codeEditors: [],
  defaultProvider: 'claude',
  networkProxy: EMPTY_NETWORK_PROXY_SETTINGS,
  platform: '',
  providers: {},
  selectedCodeEditor: '',
};
const COPY = {
  zh: {
    bridgeUnavailable: '当前页面没有接到 Electron bridge，请通过桌面应用启动。',
    claudeCode: 'Claude',
    languageChinese: '🇨🇳 中文',
    languageEnglish: '🇺🇸 English',
    languageLabel: '语言',
    providerLabel: 'Provider',
    providerOptionClaude: 'Claude',
    providerOptionCodex: 'Codex',
    providerSummaryClaude: '本地 Claude CLI',
    providerSummaryCodex: '本地 Codex CLI',
    providerUnavailable: (label) => `${label} 不可用`,
    settingsAboutArch: '架构',
    settingsAboutChrome: 'Chrome',
    settingsAboutDataDirectory: '数据目录',
    settingsAboutDescription: '查看当前应用版本、运行平台和本地数据目录。',
    settingsAboutElectron: 'Electron',
    settingsAboutName: '应用名称',
    settingsAboutNode: 'Node.js',
    settingsAboutPlatform: '平台',
    settingsAboutTitle: '关于应用',
    settingsAboutUnavailable: '暂无信息',
    settingsAboutVersion: '版本',
    settingsCodeEditorDescription: '展示当前系统中检测到的代码编辑器，并设置默认选择。',
    settingsCodeEditorEmpty: '当前没有检测到可用的代码编辑器。',
    settingsCodeEditorTitle: '代码编辑器',
    settingsDescription: '调整客户端语言、主题、代码编辑器、分屏和 Provider 偏好，并查看应用信息。',
    settingsNetworkProxyDescription: '为 Claude / Codex CLI 子进程注入自定义代理环境变量。',
    settingsNetworkProxyEnabledDescription: '开启后，应用会覆盖子进程继承到的代理变量；关闭后保持启动环境中的原始代理配置。',
    settingsNetworkProxyEnabledTitle: '启用自定义代理',
    settingsNetworkProxyFieldAll: 'ALL_PROXY',
    settingsNetworkProxyFieldHttp: 'HTTP_PROXY',
    settingsNetworkProxyFieldHttps: 'HTTPS_PROXY',
    settingsNetworkProxyFieldNo: 'NO_PROXY',
    settingsNetworkProxyHint: '按环境变量格式填写。留空表示不设置该变量。',
    settingsNetworkProxyPlaceholderAll: 'socks5://127.0.0.1:7891',
    settingsNetworkProxyPlaceholderHttp: 'http://127.0.0.1:7890',
    settingsNetworkProxyPlaceholderHttps: 'http://127.0.0.1:7890',
    settingsNetworkProxyPlaceholderNo: 'localhost,127.0.0.1,.example.com',
    settingsNetworkProxyTestAction: '测试连接',
    settingsNetworkProxyTestDescription: '手动填写要通过代理访问的目标地址，支持 `google.com`、`google.com:443` 或完整 URL；无需先保存。',
    settingsNetworkProxyTestResultFailure: '失败',
    settingsNetworkProxyTestResultSuccess: '成功',
    settingsNetworkProxyTestResultTarget: (value) => `目标 ${value}`,
    settingsNetworkProxyTestTargetLabel: '测试目标',
    settingsNetworkProxyTestTargetPlaceholder: 'google.com',
    settingsNetworkProxyTestRunning: '测试中...',
    settingsNetworkProxyTestTitle: '连接测试',
    settingsNetworkProxyTitle: '网络代理',
    settingsPaneBehaviorDescription: '控制是否根据窗口尺寸限制分屏数量。',
    settingsPaneBehaviorTitle: '分屏',
    settingsPaneFinishFlashDescription: '开启后，未选中的分屏在输出结束时会闪烁边框，直到再次选中。',
    settingsPaneFinishFlashTitle: '后台完成时闪烁边框',
    settingsPaneSizeLimitDescription: '开启后不再因为屏幕或窗口尺寸隐藏分屏，可以继续新增分屏。',
    settingsPaneSizeLimitTitle: '无视屏幕大小限制',
    settingsProviderPromptDescription: (label) => `为 ${label} 追加全局额外指令。留空时使用 CLI 默认行为。`,
    settingsProviderPromptHintClaude: 'Claude 会通过 CLI 的附加系统提示参数应用这段内容。',
    settingsProviderPromptHintCodex: 'Codex 会通过 developer instructions 注入这段内容，不替换内置基础能力配置。',
    settingsProviderPromptPlaceholder: (label) => `给 ${label} 的额外要求，例如：默认使用中文；先给简短计划；修改前说明风险。`,
    settingsProviderPromptReset: '恢复默认',
    settingsProviderPromptSave: '保存',
    settingsProviderPromptSaving: '保存中...',
    settingsProviderPromptTitle: '系统提示词',
    settingsProviderStatusAuthMode: '登录方式',
    settingsProviderStatusContextWindow: '上下文窗口',
    settingsProviderStatusCurrentModel: '当前模型',
    settingsProviderStatusDefaultModel: '默认模型',
    settingsProviderStatusEmpty: '当前没有可展示的本地状态。',
    settingsProviderStatusFavoriteModel: '常用模型',
    settingsProviderStatusLastActive: '最近活跃',
    settingsProviderStatusLastTokens: '最近 Tokens',
    settingsProviderStatusPlanType: '套餐',
    settingsProviderStatusPrimaryLimit: '5 小时剩余',
    settingsProviderStatusReasoning: '推理默认',
    settingsProviderStatusSecondaryLimit: '7 天剩余',
    settingsProviderStatusTitle: '状态概览',
    settingsProviderStatusTotalMessages: '累计消息',
    settingsProviderStatusTotalSessions: '累计会话',
    settingsProviderStatusUpdatedAt: (value) => `更新于 ${value}`,
    settingsProviderStatusUsageStreak: '连续活跃',
    settingsProvidersDescription: '控制哪些本地 CLI 可以用于新会话和可切换会话。',
    settingsProvidersHint: '至少保留一个 Provider 处于启用状态。',
    settingsProvidersRefresh: '刷新状态',
    settingsProvidersRefreshing: '刷新中...',
    settingsProvidersTitle: 'Provider',
    settingsShortcutAddPane: '新增空分屏',
    settingsShortcutAddPaneAndCreate: '新增分屏并立即新建对话',
    settingsShortcutAddWorkspace: '添加工作目录',
    settingsShortcutClosePane: '关闭当前分屏',
    settingsShortcutCreateConversation: '在当前工作目录新建对话',
    settingsShortcutFocusPane: '切换到当前可见的第 1-9 个分屏',
    settingsShortcutOpenSettings: '打开设置',
    settingsShortcutToggleFreshProvider: '在新建对话中切换 Provider',
    settingsShortcutToggleSidebar: '切换侧边栏展开 / 收起',
    settingsShortcutsTitle: '快捷键',
    settingsTabApp: '应用设置',
    settingsTabAppDescription: '语言、主题、代码编辑器和分屏行为。',
    settingsTabAbout: '关于应用',
    settingsTabAboutDescription: '查看当前应用版本、运行平台和本地数据目录。',
    settingsTabProviders: '模型与 Provider',
    settingsTabProvidersDescription: 'Provider 可用性与相关能力配置。',
    settingsTabShortcuts: '快捷键',
    settingsTabShortcutsDescription: '查看当前应用内的操作快捷键。',
    settingsTitle: '设置',
    themeDark: '🌙 深色',
    themeLabel: '主题',
    themeLight: '☀️ 浅色',
    themeSystem: '🖥️ 跟随系统',
  },
  en: {
    bridgeUnavailable: 'Electron bridge is not available on this page. Please open it from the desktop app.',
    claudeCode: 'Claude',
    languageChinese: '🇨🇳 Chinese',
    languageEnglish: '🇺🇸 English',
    languageLabel: 'Language',
    providerLabel: 'Provider',
    providerOptionClaude: 'Claude',
    providerOptionCodex: 'Codex',
    providerSummaryClaude: 'Local Claude CLI',
    providerSummaryCodex: 'Local Codex CLI',
    providerUnavailable: (label) => `${label} unavailable`,
    settingsAboutArch: 'Architecture',
    settingsAboutChrome: 'Chrome',
    settingsAboutDataDirectory: 'Data directory',
    settingsAboutDescription: 'Review the current app version, runtime platform, and local data directory.',
    settingsAboutElectron: 'Electron',
    settingsAboutName: 'App name',
    settingsAboutNode: 'Node.js',
    settingsAboutPlatform: 'Platform',
    settingsAboutTitle: 'About',
    settingsAboutUnavailable: 'Unavailable',
    settingsAboutVersion: 'Version',
    settingsCodeEditorDescription: 'Review the code editors detected on this system and choose the default one.',
    settingsCodeEditorEmpty: 'No available code editors were detected on this system.',
    settingsCodeEditorTitle: 'Code editor',
    settingsDescription: 'Adjust language, theme, code editor, split behavior, provider preferences, and review app information.',
    settingsNetworkProxyDescription: 'Inject custom proxy environment variables into Claude / Codex CLI subprocesses.',
    settingsNetworkProxyEnabledDescription: 'When enabled, the app overrides inherited proxy variables for CLI subprocesses. When disabled, it keeps the original launch environment.',
    settingsNetworkProxyEnabledTitle: 'Use custom proxy',
    settingsNetworkProxyFieldAll: 'ALL_PROXY',
    settingsNetworkProxyFieldHttp: 'HTTP_PROXY',
    settingsNetworkProxyFieldHttps: 'HTTPS_PROXY',
    settingsNetworkProxyFieldNo: 'NO_PROXY',
    settingsNetworkProxyHint: 'Use environment variable format. Leave a field empty to avoid setting that variable.',
    settingsNetworkProxyPlaceholderAll: 'socks5://127.0.0.1:7891',
    settingsNetworkProxyPlaceholderHttp: 'http://127.0.0.1:7890',
    settingsNetworkProxyPlaceholderHttps: 'http://127.0.0.1:7890',
    settingsNetworkProxyPlaceholderNo: 'localhost,127.0.0.1,.example.com',
    settingsNetworkProxyTestAction: 'Test connection',
    settingsNetworkProxyTestDescription: 'Enter the target to reach through the proxy manually. Supports `google.com`, `google.com:443`, or a full URL. Saving first is not required.',
    settingsNetworkProxyTestResultFailure: 'Failed',
    settingsNetworkProxyTestResultSuccess: 'Success',
    settingsNetworkProxyTestResultTarget: (value) => `Target ${value}`,
    settingsNetworkProxyTestTargetLabel: 'Test target',
    settingsNetworkProxyTestTargetPlaceholder: 'google.com',
    settingsNetworkProxyTestRunning: 'Testing...',
    settingsNetworkProxyTestTitle: 'Connection test',
    settingsNetworkProxyTitle: 'Network proxy',
    settingsPaneBehaviorDescription: 'Control whether split count follows the current window size.',
    settingsPaneBehaviorTitle: 'Splits',
    settingsPaneFinishFlashDescription: 'When enabled, an inactive pane flashes its border after output finishes until you focus it again.',
    settingsPaneFinishFlashTitle: 'Flash border on background completion',
    settingsPaneSizeLimitDescription: 'When enabled, panes stay visible and you can keep adding splits regardless of screen or window size.',
    settingsPaneSizeLimitTitle: 'Ignore screen size limit',
    settingsProviderPromptDescription: (label) => `Add global extra instructions for ${label}. Leave it empty to use the CLI default behavior.`,
    settingsProviderPromptHintClaude: 'Claude applies this through its append-system-prompt CLI option.',
    settingsProviderPromptHintCodex: 'Codex applies this through developer instructions without replacing its built-in base behavior.',
    settingsProviderPromptPlaceholder: (label) => `Extra instructions for ${label}, for example: respond in Chinese; give a brief plan first; explain risks before editing.`,
    settingsProviderPromptReset: 'Reset',
    settingsProviderPromptSave: 'Save',
    settingsProviderPromptSaving: 'Saving...',
    settingsProviderPromptTitle: 'System prompt',
    settingsProviderStatusAuthMode: 'Auth',
    settingsProviderStatusContextWindow: 'Context window',
    settingsProviderStatusCurrentModel: 'Current model',
    settingsProviderStatusDefaultModel: 'Default model',
    settingsProviderStatusEmpty: 'No local status is available right now.',
    settingsProviderStatusFavoriteModel: 'Favorite model',
    settingsProviderStatusLastActive: 'Last active',
    settingsProviderStatusLastTokens: 'Last tokens',
    settingsProviderStatusPlanType: 'Plan',
    settingsProviderStatusPrimaryLimit: '5h remaining',
    settingsProviderStatusReasoning: 'Reasoning',
    settingsProviderStatusSecondaryLimit: '7d remaining',
    settingsProviderStatusTitle: 'Status',
    settingsProviderStatusTotalMessages: 'Total messages',
    settingsProviderStatusTotalSessions: 'Total sessions',
    settingsProviderStatusUpdatedAt: (value) => `Updated ${value}`,
    settingsProviderStatusUsageStreak: 'Active streak',
    settingsProvidersDescription: 'Control which local CLIs are available for new and switchable conversations.',
    settingsProvidersHint: 'Keep at least one provider enabled.',
    settingsProvidersRefresh: 'Refresh status',
    settingsProvidersRefreshing: 'Refreshing...',
    settingsProvidersTitle: 'Providers',
    settingsShortcutAddPane: 'Add an empty split',
    settingsShortcutAddPaneAndCreate: 'Add a split and create a conversation',
    settingsShortcutAddWorkspace: 'Add workspace',
    settingsShortcutClosePane: 'Close the current split',
    settingsShortcutCreateConversation: 'Create a conversation in the current workspace',
    settingsShortcutFocusPane: 'Focus visible split 1-9',
    settingsShortcutOpenSettings: 'Open settings',
    settingsShortcutToggleFreshProvider: 'Switch provider in a new conversation',
    settingsShortcutToggleSidebar: 'Toggle the sidebar',
    settingsShortcutsTitle: 'Shortcuts',
    settingsTabApp: 'App settings',
    settingsTabAppDescription: 'Language, theme, code editor, and split behavior.',
    settingsTabAbout: 'About',
    settingsTabAboutDescription: 'Review the current app version, runtime platform, and local data directory.',
    settingsTabProviders: 'Models & Providers',
    settingsTabProvidersDescription: 'Provider availability and related capabilities.',
    settingsTabShortcuts: 'Shortcuts',
    settingsTabShortcutsDescription: 'Review the in-app keyboard shortcuts.',
    settingsTitle: 'Settings',
    themeDark: '🌙 Dark',
    themeLabel: 'Theme',
    themeLight: '☀️ Light',
    themeSystem: '🖥️ System',
  },
};

export default function SettingsWindow({ desktopClient }) {
  const [appState, setAppState] = useState(EMPTY_APP_STATE);
  const [language, setLanguage] = useState(() => getInitialLanguage());
  const [themePreference, setThemePreference] = useState(() => getInitialThemePreference());
  const [isPaneSizeLimitIgnored, setIsPaneSizeLimitIgnored] = useState(() => getInitialPaneSizeLimitIgnored());
  const [isPaneFinishFlashEnabled, setIsPaneFinishFlashEnabled] = useState(() => getInitialPaneFinishFlashEnabled());
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme());
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingCodeEditor, setIsUpdatingCodeEditor] = useState(false);
  const [isUpdatingProviders, setIsUpdatingProviders] = useState(false);
  const [isRefreshingProviderStatus, setIsRefreshingProviderStatus] = useState(false);
  const [isSavingNetworkProxy, setIsSavingNetworkProxy] = useState(false);
  const [isTestingNetworkProxy, setIsTestingNetworkProxy] = useState(false);
  const [networkProxyTestTarget, setNetworkProxyTestTarget] = useState('google.com');
  const [networkProxyTestReport, setNetworkProxyTestReport] = useState(null);
  const [savingProviderSystemPromptKey, setSavingProviderSystemPromptKey] = useState('');
  const [toastItems, setToastItems] = useState([]);
  const [activeTab, setActiveTab] = useState('app');

  const copy = COPY[language];
  const resolvedTheme = themePreference === 'system' ? systemTheme : themePreference;
  const appInfo = useMemo(() => normalizeAppInfo(appState.appInfo), [appState.appInfo]);
  const platform = appState.platform || '';
  const codeEditors = useMemo(
    () => (
      Array.isArray(appState.codeEditors)
        ? appState.codeEditors.filter((editor) => editor && typeof editor.key === 'string')
        : []
    ),
    [appState.codeEditors],
  );
  const selectedCodeEditor = useMemo(() => {
    if (codeEditors.length === 0) {
      return null;
    }

    return codeEditors.find((editor) => editor.key === appState.selectedCodeEditor)
      || codeEditors.find((editor) => editor.key === 'vscode')
      || codeEditors[0];
  }, [appState.selectedCodeEditor, codeEditors]);
  const providerCatalog = appState.providers && typeof appState.providers === 'object'
    ? appState.providers
    : {};
  const providerSettings = useMemo(
    () => PROVIDER_KEYS.map((providerKey) => {
      const info = getProviderInfo(providerCatalog, providerKey, providerKey);

      return {
        available: Boolean(info.available),
        enabled: info.enabled !== false,
        key: providerKey,
        label: getProviderDisplayName(providerKey, copy),
        models: Array.isArray(info.models) ? info.models : [],
        status: info?.status && typeof info.status === 'object' ? info.status : null,
        summary: providerKey === 'codex' ? copy.providerSummaryCodex : copy.providerSummaryClaude,
        systemPrompt: typeof info.systemPrompt === 'string' ? info.systemPrompt : '',
        version: typeof info.version === 'string' ? info.version : '',
      };
    }),
    [copy, providerCatalog],
  );
  const savedProviderPromptDrafts = useMemo(
    () => createProviderPromptDrafts(providerSettings),
    [providerSettings],
  );
  const [providerPromptDrafts, setProviderPromptDrafts] = useState(() => savedProviderPromptDrafts);
  const savedProviderPromptDraftsRef = useRef(savedProviderPromptDrafts);
  const savedNetworkProxy = useMemo(
    () => normalizeNetworkProxySettings(appState.networkProxy),
    [appState.networkProxy],
  );
  const [networkProxyDraft, setNetworkProxyDraft] = useState(() => savedNetworkProxy);
  const savedNetworkProxyRef = useRef(savedNetworkProxy);
  const isNetworkProxyDirty = useMemo(
    () => !areNetworkProxySettingsEqual(networkProxyDraft, savedNetworkProxy),
    [networkProxyDraft, savedNetworkProxy],
  );
  const hasSavedNetworkProxy = useMemo(
    () => !areNetworkProxySettingsEqual(savedNetworkProxy, EMPTY_NETWORK_PROXY_SETTINGS),
    [savedNetworkProxy],
  );
  const networkProxyFields = useMemo(
    () => [
      {
        key: 'httpProxy',
        label: copy.settingsNetworkProxyFieldHttp,
        placeholder: copy.settingsNetworkProxyPlaceholderHttp,
      },
      {
        key: 'httpsProxy',
        label: copy.settingsNetworkProxyFieldHttps,
        placeholder: copy.settingsNetworkProxyPlaceholderHttps,
      },
      {
        key: 'allProxy',
        label: copy.settingsNetworkProxyFieldAll,
        placeholder: copy.settingsNetworkProxyPlaceholderAll,
      },
      {
        key: 'noProxy',
        label: copy.settingsNetworkProxyFieldNo,
        placeholder: copy.settingsNetworkProxyPlaceholderNo,
      },
    ],
    [copy],
  );
  const aboutItems = useMemo(
    () => [
      { label: copy.settingsAboutName, value: appInfo.name || copy.settingsAboutUnavailable },
      { label: copy.settingsAboutVersion, value: appInfo.version || copy.settingsAboutUnavailable },
      { label: copy.settingsAboutPlatform, value: formatPlatformDisplayName(platform) || copy.settingsAboutUnavailable },
      { label: copy.settingsAboutArch, value: appInfo.arch || copy.settingsAboutUnavailable },
      { label: copy.settingsAboutElectron, value: appInfo.electronVersion || copy.settingsAboutUnavailable },
      { label: copy.settingsAboutChrome, value: appInfo.chromeVersion || copy.settingsAboutUnavailable },
      { label: copy.settingsAboutNode, value: appInfo.nodeVersion || copy.settingsAboutUnavailable },
    ],
    [appInfo, copy, platform],
  );
  const shortcutItems = useMemo(
    () => [
      {
        action: copy.settingsShortcutAddWorkspace,
        shortcut: formatShortcutLabel(platform, 'O'),
      },
      {
        action: copy.settingsShortcutOpenSettings,
        shortcut: formatShortcutLabel(platform, '.'),
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
        action: copy.settingsShortcutToggleFreshProvider,
        shortcut: formatShortcutLabel(platform, 'T'),
      },
      {
        action: copy.settingsShortcutClosePane,
        shortcut: formatShortcutLabel(platform, 'W'),
      },
      {
        action: copy.settingsShortcutFocusPane,
        shortcut: formatShortcutRangeLabel(platform, '1', '9'),
      },
    ].filter((item) => item.shortcut),
    [copy, platform],
  );
  const enabledProviderCount = useMemo(
    () => providerSettings.filter((provider) => provider.enabled).length,
    [providerSettings],
  );
  const settingsTabs = useMemo(
    () => [
      {
        description: copy.settingsTabAppDescription,
        icon: Settings,
        key: 'app',
        label: copy.settingsTabApp,
      },
      {
        description: copy.settingsTabProvidersDescription,
        icon: BrainCircuit,
        key: 'providers',
        label: copy.settingsTabProviders,
      },
      {
        description: copy.settingsTabShortcutsDescription,
        icon: TerminalSquare,
        key: 'shortcuts',
        label: copy.settingsTabShortcuts,
      },
      {
        description: copy.settingsTabAboutDescription,
        icon: Info,
        key: 'about',
        label: copy.settingsTabAbout,
      },
    ],
    [copy],
  );
  const activeTabItem = settingsTabs.find((item) => item.key === activeTab) || settingsTabs[0];
  const ActiveTabIcon = activeTabItem.icon;

  useEffect(() => {
    const previousSavedDrafts = savedProviderPromptDraftsRef.current;
    savedProviderPromptDraftsRef.current = savedProviderPromptDrafts;
    setProviderPromptDrafts((currentDrafts) => (
      syncProviderPromptDrafts(currentDrafts, previousSavedDrafts, savedProviderPromptDrafts)
    ));
  }, [savedProviderPromptDrafts]);

  useEffect(() => {
    const previousSavedNetworkProxy = savedNetworkProxyRef.current;
    savedNetworkProxyRef.current = savedNetworkProxy;
    setNetworkProxyDraft((currentDraft) => (
      syncNetworkProxyDraft(currentDraft, previousSavedNetworkProxy, savedNetworkProxy)
    ));
  }, [savedNetworkProxy]);

  useEffect(() => {
    setNetworkProxyTestReport(null);
  }, [networkProxyDraft, networkProxyTestTarget]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
    root.lang = getIntlLocale(language);
  }, [language, resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = (event) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    const handleStorage = (event) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key === LANGUAGE_STORAGE_KEY) {
        setLanguage(getInitialLanguage());
      }

      if (event.key === THEME_STORAGE_KEY) {
        setThemePreference(getInitialThemePreference());
      }

      if (event.key === PANE_SIZE_LIMIT_IGNORED_STORAGE_KEY) {
        setIsPaneSizeLimitIgnored(getInitialPaneSizeLimitIgnored());
      }

      if (event.key === PANE_FINISH_FLASH_ENABLED_STORAGE_KEY) {
        setIsPaneFinishFlashEnabled(getInitialPaneFinishFlashEnabled());
      }
    };

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', syncSystemTheme);
    window.addEventListener('storage', handleStorage);

    return () => {
      mediaQuery.removeEventListener('change', syncSystemTheme);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

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

    window.localStorage.setItem(PANE_SIZE_LIMIT_IGNORED_STORAGE_KEY, JSON.stringify(isPaneSizeLimitIgnored));
  }, [isPaneSizeLimitIgnored]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PANE_FINISH_FLASH_ENABLED_STORAGE_KEY, JSON.stringify(isPaneFinishFlashEnabled));
  }, [isPaneFinishFlashEnabled]);

  useEffect(() => {
    if (!desktopClient) {
      pushError(copy.bridgeUnavailable);
      setIsLoading(false);
      return undefined;
    }

    const unsubscribe = desktopClient.onStateChange((event) => {
      if (event?.type === 'state' && event.state) {
        setAppState(event.state);
      }
    });

    void loadAppState();

    return () => {
      unsubscribe?.();
    };
  }, [desktopClient]);

  async function loadAppState() {
    if (!desktopClient) {
      return;
    }

    setIsLoading(true);

    try {
      const nextState = await desktopClient.getAppState();
      setAppState(nextState);
    } catch (error) {
      pushError(error);
    } finally {
      setIsLoading(false);
    }
  }

  function dismissToast(toastId) {
    setToastItems((current) => current.filter((item) => item.id !== toastId));
  }

  function pushError(error) {
    setToastItems((current) => appendToast(current, {
      message: normalizeToastMessage(error),
      tone: 'error',
    }));
  }

  async function handleRefreshProviderStatus() {
    if (!desktopClient || isRefreshingProviderStatus) {
      return;
    }

    setIsRefreshingProviderStatus(true);

    try {
      const nextState = await desktopClient.refreshProviderStatus();
      setAppState(nextState);
    } catch (error) {
      pushError(error);
    } finally {
      setIsRefreshingProviderStatus(false);
    }
  }

  async function handleCodeEditorChange(codeEditorKey) {
    if (!desktopClient || !codeEditorKey) {
      return;
    }

    setIsUpdatingCodeEditor(true);

    try {
      const nextState = await desktopClient.setCodeEditor({ codeEditor: codeEditorKey });
      setAppState(nextState);
    } catch (error) {
      pushError(error);
    } finally {
      setIsUpdatingCodeEditor(false);
    }
  }

  async function handleSetProviderEnabled(providerKey, enabled) {
    if (!desktopClient || !providerKey) {
      return;
    }

    setIsUpdatingProviders(true);

    try {
      const nextState = await desktopClient.setProviderEnabled({
        enabled,
        provider: providerKey,
      });
      setAppState(nextState);
    } catch (error) {
      pushError(error);
    } finally {
      setIsUpdatingProviders(false);
    }
  }

  async function handleSetProviderSystemPrompt(providerKey, systemPrompt) {
    if (!desktopClient || !providerKey) {
      return;
    }

    setSavingProviderSystemPromptKey(providerKey);

    try {
      const nextState = await desktopClient.setProviderSystemPrompt({
        provider: providerKey,
        systemPrompt,
      });
      setAppState(nextState);
    } catch (error) {
      pushError(error);
    } finally {
      setSavingProviderSystemPromptKey('');
    }
  }

  async function handleSetNetworkProxy(networkProxy) {
    if (!desktopClient) {
      return;
    }

    setIsSavingNetworkProxy(true);

    try {
      const nextState = await desktopClient.setNetworkProxy({
        networkProxy,
      });
      setAppState(nextState);
    } catch (error) {
      pushError(error);
    } finally {
      setIsSavingNetworkProxy(false);
    }
  }

  async function handleTestNetworkProxy() {
    if (!desktopClient?.testNetworkProxy) {
      return;
    }

    setIsTestingNetworkProxy(true);
    setNetworkProxyTestReport(null);

    try {
      const nextReport = await desktopClient.testNetworkProxy({
        networkProxy: networkProxyDraft,
        testTarget: networkProxyTestTarget,
      });
      setNetworkProxyTestReport(nextReport);
    } catch (error) {
      pushError(error);
    } finally {
      setIsTestingNetworkProxy(false);
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <ToastViewport items={toastItems} onDismiss={dismissToast} />
      <div className="drag-region h-10 shrink-0 border-b border-border/60 bg-background/70 backdrop-blur" />

      <header className="border-b border-border/70 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.12),_transparent_42%),linear-gradient(to_bottom,_hsl(var(--background)),_hsl(var(--background)))] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-foreground">{copy.settingsTitle}</p>
            <p className="mt-1 max-w-2xl text-[12px] leading-6 text-muted-foreground">{copy.settingsDescription}</p>
          </div>
          <div className="rounded-2xl border border-border/80 bg-background/75 px-3 py-2 text-right">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {appInfo.name || copy.settingsTitle}
            </p>
            <p className="mt-1 text-[12px] font-medium text-foreground">
              {[appInfo.version, formatPlatformDisplayName(platform)].filter(Boolean).join(' · ') || copy.settingsAboutUnavailable}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col lg:flex-row">
          <aside className="shrink-0 border-b border-border/70 bg-muted/15 lg:w-[248px] lg:border-b-0 lg:border-r">
            <div className="flex gap-2 overflow-x-auto px-4 py-4 lg:flex-col lg:overflow-visible">
              {settingsTabs.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      if (item.key !== activeTab) {
                        setActiveTab(item.key);
                      }
                    }}
                    className={cn(
                      'flex min-w-[220px] items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors lg:min-w-0',
                      isActive
                        ? 'border-border/80 bg-background text-foreground shadow-sm'
                        : 'border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-background/70 hover:text-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                        isActive ? 'bg-primary/12 text-primary' : 'bg-background text-muted-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium">{item.label}</span>
                      <span className="mt-1 block text-[11px] leading-5 text-current/80">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,_transparent,_hsl(var(--muted)/0.14))] px-5 py-5">
            <div className="mb-5 rounded-2xl border border-border/70 bg-background/75 px-4 py-3 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <ActiveTabIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{activeTabItem.label}</p>
                  <p className="mt-1 text-[12px] leading-6 text-muted-foreground">{activeTabItem.description}</p>
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-border/70 bg-background/70">
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span>Loading...</span>
                </div>
              </div>
            ) : null}

            {!isLoading && activeTab === 'app' ? (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <p className="text-[12px] font-medium text-foreground">{copy.languageLabel}</p>
                  <TopbarSelect
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
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
                    onChange={(event) => setThemePreference(event.target.value)}
                    ariaLabel={copy.themeLabel}
                  >
                    <option value="system">{copy.themeSystem}</option>
                    <option value="light">{copy.themeLight}</option>
                    <option value="dark">{copy.themeDark}</option>
                  </TopbarSelect>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium text-foreground">{copy.settingsCodeEditorTitle}</p>
                    <p className="text-[11px] leading-5 text-muted-foreground">{copy.settingsCodeEditorDescription}</p>
                  </div>
                  {codeEditors.length > 0 ? (
                    <div className="space-y-1.5">
                      <TopbarSelect
                        value={selectedCodeEditor?.key || ''}
                        onChange={(event) => {
                          void handleCodeEditorChange(event.target.value);
                        }}
                        disabled={isUpdatingCodeEditor}
                        ariaLabel={copy.settingsCodeEditorTitle}
                      >
                        {codeEditors.map((editor) => (
                          <option key={editor.key} value={editor.key}>{editor.label}</option>
                        ))}
                      </TopbarSelect>
                      {selectedCodeEditor?.path ? (
                        <p className="break-all rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                          {selectedCodeEditor.path}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/80 bg-background/50 px-3 py-3 text-[11px] leading-5 text-muted-foreground">
                      {copy.settingsCodeEditorEmpty}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium text-foreground">{copy.settingsPaneBehaviorTitle}</p>
                    <p className="text-[11px] leading-5 text-muted-foreground">{copy.settingsPaneBehaviorDescription}</p>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border/80 bg-background/60">
                    <ToggleSettingRow
                      checked={isPaneFinishFlashEnabled}
                      description={copy.settingsPaneFinishFlashDescription}
                      title={copy.settingsPaneFinishFlashTitle}
                      tone="emerald"
                      onChange={setIsPaneFinishFlashEnabled}
                    />
                    <ToggleSettingRow
                      checked={isPaneSizeLimitIgnored}
                      description={copy.settingsPaneSizeLimitDescription}
                      title={copy.settingsPaneSizeLimitTitle}
                      tone="amber"
                      withBorder={false}
                      onChange={setIsPaneSizeLimitIgnored}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium text-foreground">{copy.settingsNetworkProxyTitle}</p>
                    <p className="text-[11px] leading-5 text-muted-foreground">{copy.settingsNetworkProxyDescription}</p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-background/60 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-foreground">{copy.settingsNetworkProxyEnabledTitle}</p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{copy.settingsNetworkProxyEnabledDescription}</p>
                      </div>
                      <ToggleSwitch
                        checked={networkProxyDraft.enabled}
                        disabled={isSavingNetworkProxy}
                        label={copy.settingsNetworkProxyEnabledTitle}
                        tone="emerald"
                        onChange={(checked) => {
                          setNetworkProxyDraft((current) => ({
                            ...normalizeNetworkProxySettings(current),
                            enabled: checked,
                          }));
                        }}
                      />
                    </div>

                    <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{copy.settingsNetworkProxyHint}</p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {networkProxyFields.map((field) => (
                        <label key={field.key} className="space-y-1.5">
                          <span className="text-[11px] font-medium text-foreground">{field.label}</span>
                          <Input
                            value={networkProxyDraft[field.key] ?? ''}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setNetworkProxyDraft((current) => ({
                                ...normalizeNetworkProxySettings(current),
                                [field.key]: nextValue,
                              }));
                            }}
                            disabled={isSavingNetworkProxy}
                            placeholder={field.placeholder}
                            aria-label={field.label}
                            className="h-9 border-border/80 bg-background/80 text-[12px]"
                          />
                        </label>
                      ))}
                    </div>

                    <div className="mt-3 rounded-xl border border-border/70 bg-background/70 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-foreground">{copy.settingsNetworkProxyTestTitle}</p>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{copy.settingsNetworkProxyTestDescription}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isTestingNetworkProxy}
                          onClick={() => {
                            void handleTestNetworkProxy();
                          }}
                          className="h-7 shrink-0 border-border/80 px-2 text-[11px]"
                        >
                          {isTestingNetworkProxy ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          {isTestingNetworkProxy ? copy.settingsNetworkProxyTestRunning : copy.settingsNetworkProxyTestAction}
                        </Button>
                      </div>

                      <label className="mt-3 block space-y-1.5">
                        <span className="text-[11px] font-medium text-foreground">{copy.settingsNetworkProxyTestTargetLabel}</span>
                        <Input
                          value={networkProxyTestTarget}
                          onChange={(event) => {
                            setNetworkProxyTestTarget(event.target.value);
                          }}
                          disabled={isTestingNetworkProxy}
                          placeholder={copy.settingsNetworkProxyTestTargetPlaceholder}
                          aria-label={copy.settingsNetworkProxyTestTargetLabel}
                          className="h-9 border-border/80 bg-background/80 text-[12px]"
                        />
                      </label>

                      {networkProxyTestReport ? (
                        <div
                          className={cn(
                            'mt-3 overflow-hidden rounded-xl border',
                            networkProxyTestReport.ok
                              ? 'border-emerald-200/80 bg-emerald-500/5 dark:border-emerald-400/30'
                              : 'border-rose-200/80 bg-rose-500/5 dark:border-rose-400/30',
                          )}
                        >
                          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
                            <p className="text-[11px] font-medium text-foreground">{copy.settingsNetworkProxyTestTitle}</p>
                            <p className="text-[10px] leading-5 text-muted-foreground">
                              {copy.settingsNetworkProxyTestResultTarget(
                                networkProxyTestReport.targetDisplay || `${networkProxyTestReport.targetHost}:${networkProxyTestReport.targetPort}`,
                              )}
                            </p>
                          </div>
                          <div className="space-y-2 px-3 py-3">
                            {(Array.isArray(networkProxyTestReport.results) ? networkProxyTestReport.results : []).map((result) => (
                              <div
                                key={`${result.proxyUrl}-${(result.labels || []).join('-')}`}
                                className={cn(
                                  'rounded-lg border px-2.5 py-2',
                                  result.ok
                                    ? 'border-emerald-200/80 bg-background/80 dark:border-emerald-400/25'
                                    : 'border-rose-200/80 bg-background/80 dark:border-rose-400/25',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-[11px] font-medium text-foreground">
                                    {(result.labels || []).join(' · ')}
                                  </p>
                                  <span
                                    className={cn(
                                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                      result.ok
                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                                    )}
                                  >
                                    {result.ok ? copy.settingsNetworkProxyTestResultSuccess : copy.settingsNetworkProxyTestResultFailure}
                                  </span>
                                </div>
                                <p className="mt-1 break-all text-[11px] leading-5 text-foreground">{result.proxyUrl}</p>
                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                  {[result.message, Number.isFinite(result.durationMs) ? `${result.durationMs} ms` : '']
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSavingNetworkProxy || (!hasSavedNetworkProxy && !isNetworkProxyDirty)}
                        onClick={() => {
                          setNetworkProxyDraft(EMPTY_NETWORK_PROXY_SETTINGS);
                          void handleSetNetworkProxy(EMPTY_NETWORK_PROXY_SETTINGS);
                        }}
                        className="h-7 px-2 text-[11px]"
                      >
                        {copy.settingsProviderPromptReset}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!isNetworkProxyDirty || isSavingNetworkProxy}
                        onClick={() => {
                          void handleSetNetworkProxy(networkProxyDraft);
                        }}
                        className="h-7 px-2 text-[11px]"
                      >
                        {isSavingNetworkProxy ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {isSavingNetworkProxy ? copy.settingsProviderPromptSaving : copy.settingsProviderPromptSave}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!isLoading && activeTab === 'providers' ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[12px] font-medium text-foreground">{copy.settingsProvidersTitle}</p>
                    <p className="text-[11px] leading-5 text-muted-foreground">{copy.settingsProvidersDescription}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isRefreshingProviderStatus}
                    onClick={() => {
                      void handleRefreshProviderStatus();
                    }}
                    className="shrink-0 border-border/80"
                  >
                    <LoaderCircle className={cn('h-3.5 w-3.5', isRefreshingProviderStatus && 'animate-spin')} />
                    {isRefreshingProviderStatus ? copy.settingsProvidersRefreshing : copy.settingsProvidersRefresh}
                  </Button>
                </div>

                <div className="overflow-hidden rounded-xl border border-border/80 bg-background/60">
                  {providerSettings.map((provider) => {
                    const disableToggle = isUpdatingProviders || (provider.enabled && enabledProviderCount <= 1);
                    const statusItems = getProviderSettingsStatusItems(provider, copy, language);
                    const statusMeta = getProviderSettingsStatusMeta(provider, copy, language);
                    const systemPromptDraft = providerPromptDrafts[provider.key] ?? '';
                    const savedSystemPrompt = typeof provider.systemPrompt === 'string' ? provider.systemPrompt : '';
                    const isSavingSystemPrompt = savingProviderSystemPromptKey === provider.key;
                    const isSystemPromptDirty = systemPromptDraft !== savedSystemPrompt;
                    const systemPromptHint = provider.key === 'codex'
                      ? copy.settingsProviderPromptHintCodex
                      : copy.settingsProviderPromptHintClaude;

                    return (
                      <div key={provider.key} className="border-b border-border/70 px-3 py-3 last:border-b-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
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

                            <div className="mt-3 overflow-hidden rounded-xl border border-border/70 bg-muted/20">
                              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
                                <p className="text-[11px] font-medium text-foreground">{copy.settingsProviderStatusTitle}</p>
                                {statusMeta ? (
                                  <p className="text-[10px] leading-5 text-muted-foreground">{statusMeta}</p>
                                ) : null}
                              </div>
                              {statusItems.length > 0 ? (
                                <div className="grid gap-2 px-3 py-3 sm:grid-cols-2">
                                  {statusItems.map((item) => (
                                    <div key={`${provider.key}-${item.label}`} className="min-w-0 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2">
                                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
                                      <p className="mt-1 break-words text-[11px] leading-5 text-foreground">{item.value}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="px-3 py-3 text-[11px] leading-5 text-muted-foreground">
                                  {copy.settingsProviderStatusEmpty}
                                </div>
                              )}
                            </div>

                            <div className="mt-3 rounded-xl border border-border/70 bg-background/70 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-medium text-foreground">{copy.settingsProviderPromptTitle}</p>
                                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                    {copy.settingsProviderPromptDescription(provider.label)}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isSavingSystemPrompt || (!savedSystemPrompt && !isSystemPromptDirty)}
                                    onClick={() => {
                                      setProviderPromptDrafts((current) => ({
                                        ...current,
                                        [provider.key]: '',
                                      }));
                                      void handleSetProviderSystemPrompt(provider.key, '');
                                    }}
                                    className="h-7 px-2 text-[11px]"
                                  >
                                    {copy.settingsProviderPromptReset}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={!isSystemPromptDirty || isSavingSystemPrompt}
                                    onClick={() => {
                                      void handleSetProviderSystemPrompt(provider.key, systemPromptDraft);
                                    }}
                                    className="h-7 px-2 text-[11px]"
                                  >
                                    {isSavingSystemPrompt ? (
                                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                    ) : null}
                                    {isSavingSystemPrompt ? copy.settingsProviderPromptSaving : copy.settingsProviderPromptSave}
                                  </Button>
                                </div>
                              </div>

                              <Textarea
                                value={systemPromptDraft}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setProviderPromptDrafts((current) => ({
                                    ...current,
                                    [provider.key]: nextValue,
                                  }));
                                }}
                                disabled={isSavingSystemPrompt}
                                placeholder={copy.settingsProviderPromptPlaceholder(provider.label)}
                                aria-label={copy.settingsProviderPromptTitle}
                                className="mt-3 min-h-[108px] resize-y border-border/80 bg-background/80 text-[12px] leading-6"
                              />
                              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                                {systemPromptHint}
                              </p>
                            </div>
                          </div>
                          <ToggleSwitch
                            checked={provider.enabled}
                            disabled={disableToggle}
                            label={`${provider.label} ${copy.providerLabel}`}
                            tone="amber"
                            onChange={(checked) => {
                              void handleSetProviderEnabled(provider.key, checked);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground">{copy.settingsProvidersHint}</p>
              </div>
            ) : null}

            {!isLoading && activeTab === 'shortcuts' ? (
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
            ) : null}

            {!isLoading && activeTab === 'about' ? (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-xl border border-border/80 bg-background/60">
                  <div className="flex items-start gap-3 border-b border-border/70 px-3 py-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <Info className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-foreground">{appInfo.name || copy.settingsAboutTitle}</p>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{copy.settingsAboutDescription}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 px-3 py-3 sm:grid-cols-2">
                    {aboutItems.map((item) => (
                      <div key={item.label} className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
                        <p className="mt-1 break-words text-[11px] leading-5 text-foreground">{item.value}</p>
                      </div>
                    ))}
                    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 sm:col-span-2">
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{copy.settingsAboutDataDirectory}</p>
                      <p className="mt-1 break-all text-[11px] leading-5 text-foreground">
                        {appInfo.userDataPath || copy.settingsAboutUnavailable}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

function TopbarSelect({ ariaLabel, children, disabled = false, onChange, value }) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="h-8 w-full appearance-none rounded border border-border/80 bg-background px-3 pr-9 text-[12px] text-foreground outline-none transition-colors hover:bg-background focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function ToggleSettingRow({
  checked,
  description,
  onChange,
  title,
  tone,
  withBorder = true,
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-3 py-3', withBorder && 'border-b border-border/70')}>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-foreground">{title}</p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <ToggleSwitch
        checked={checked}
        label={title}
        tone={tone}
        onChange={onChange}
      />
    </div>
  );
}

function ToggleSwitch({
  checked,
  disabled = false,
  label,
  onChange,
  tone = 'amber',
}) {
  const activeClasses = tone === 'emerald'
    ? 'border-emerald-300 bg-emerald-400/90 dark:border-emerald-400/70 dark:bg-emerald-400/80'
    : 'border-amber-300 bg-amber-400/90 dark:border-amber-400/70 dark:bg-amber-400/80';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        onChange?.(!checked);
      }}
      className={cn(
        'inline-flex h-6 w-10 shrink-0 items-center rounded-full border p-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-45',
        checked ? activeClasses : 'border-border/80 bg-muted/80',
      )}
    >
      <span
        className={cn(
          'h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function createProviderPromptDrafts(providerSettings) {
  return Array.isArray(providerSettings)
    ? providerSettings.reduce((drafts, provider) => {
      drafts[provider.key] = typeof provider?.systemPrompt === 'string' ? provider.systemPrompt : '';
      return drafts;
    }, {})
    : {};
}

function syncProviderPromptDrafts(currentDrafts, previousSavedDrafts, nextSavedDrafts) {
  const currentEntries = currentDrafts && typeof currentDrafts === 'object' ? currentDrafts : {};
  const previousEntries = previousSavedDrafts && typeof previousSavedDrafts === 'object' ? previousSavedDrafts : {};
  const nextEntries = nextSavedDrafts && typeof nextSavedDrafts === 'object' ? nextSavedDrafts : {};
  const nextDrafts = {};
  let hasChanges = false;

  Object.keys(nextEntries).forEach((providerKey) => {
    const hasCurrentValue = Object.prototype.hasOwnProperty.call(currentEntries, providerKey);
    const currentValue = hasCurrentValue ? currentEntries[providerKey] : '';
    const previousSavedValue = typeof previousEntries[providerKey] === 'string' ? previousEntries[providerKey] : '';
    const nextSavedValue = typeof nextEntries[providerKey] === 'string' ? nextEntries[providerKey] : '';
    const nextValue = !hasCurrentValue || currentValue === previousSavedValue
      ? nextSavedValue
      : currentValue;

    nextDrafts[providerKey] = nextValue;
    if (!hasCurrentValue || nextValue !== currentValue) {
      hasChanges = true;
    }
  });

  if (!hasChanges && Object.keys(currentEntries).length !== Object.keys(nextDrafts).length) {
    hasChanges = true;
  }

  return hasChanges ? nextDrafts : currentEntries;
}

function normalizeNetworkProxySettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    allProxy: normalizeNetworkProxyValue(source.allProxy),
    enabled: source.enabled === true,
    httpProxy: normalizeNetworkProxyValue(source.httpProxy),
    httpsProxy: normalizeNetworkProxyValue(source.httpsProxy),
    noProxy: normalizeNetworkProxyValue(source.noProxy),
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

function syncNetworkProxyDraft(currentDraft, previousSavedDraft, nextSavedDraft) {
  const normalizedCurrentDraft = normalizeNetworkProxySettings(currentDraft);
  const normalizedPreviousSavedDraft = normalizeNetworkProxySettings(previousSavedDraft);
  return areNetworkProxySettingsEqual(normalizedCurrentDraft, normalizedPreviousSavedDraft)
    ? normalizeNetworkProxySettings(nextSavedDraft)
    : normalizedCurrentDraft;
}

function normalizeAppInfo(appInfo) {
  return {
    arch: typeof appInfo?.arch === 'string' ? appInfo.arch.trim() : '',
    chromeVersion: typeof appInfo?.chromeVersion === 'string' ? appInfo.chromeVersion.trim() : '',
    electronVersion: typeof appInfo?.electronVersion === 'string' ? appInfo.electronVersion.trim() : '',
    name: typeof appInfo?.name === 'string' ? appInfo.name.trim() : '',
    nodeVersion: typeof appInfo?.nodeVersion === 'string' ? appInfo.nodeVersion.trim() : '',
    userDataPath: typeof appInfo?.userDataPath === 'string' ? appInfo.userDataPath.trim() : '',
    version: typeof appInfo?.version === 'string' ? appInfo.version.trim() : '',
  };
}

function normalizeProviderKey(value) {
  return value === 'codex' ? 'codex' : 'claude';
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
    version: '',
  };
}

function getProviderDisplayName(provider, copy) {
  return normalizeProviderKey(provider) === 'codex'
    ? copy.providerOptionCodex
    : copy.providerOptionClaude;
}

function getProviderDotClasses(provider) {
  return normalizeProviderKey(provider) === 'codex'
    ? 'bg-sky-500 dark:bg-sky-300'
    : 'bg-emerald-500 dark:bg-emerald-300';
}

function getProviderSettingsStatusMeta(provider, copy, language) {
  const metaParts = [];
  const versionLabel = normalizeProviderVersion(provider?.version, provider?.label);
  const updatedAtLabel = formatProviderStatusUpdatedValue(provider?.status?.updatedAt, language);

  if (versionLabel) {
    metaParts.push(versionLabel);
  }

  if (updatedAtLabel) {
    metaParts.push(copy.settingsProviderStatusUpdatedAt(updatedAtLabel));
  }

  return metaParts.join(' · ');
}

function getProviderSettingsStatusItems(provider, copy, language) {
  const status = provider?.status;
  if (!status || typeof status !== 'object') {
    return [];
  }

  return normalizeProviderKey(provider?.key) === 'codex'
    ? getCodexProviderSettingsStatusItems(status, provider, copy, language)
    : getClaudeProviderSettingsStatusItems(status, provider, copy, language);
}

function getClaudeProviderSettingsStatusItems(status, provider, copy, language) {
  const items = [];
  const currentModel = formatProviderSettingsModelValue(status.currentModel, provider);
  const favoriteModel = formatFavoriteClaudeModelValue(status.favoriteModel, provider, language);
  const usageStreak = Number.isFinite(status.usageStreak) && status.usageStreak > 0
    ? formatProviderStatusDuration(status.usageStreak, language)
    : '';
  const lastActive = formatClaudeLastActiveValue(status.lastActive, language);
  const totalSessions = status.totalSessions > 0 ? formatLocalizedNumber(status.totalSessions, language) : '';
  const totalMessages = status.totalMessages > 0 ? formatLocalizedNumber(status.totalMessages, language) : '';

  if (currentModel) {
    items.push({ label: copy.settingsProviderStatusCurrentModel, value: currentModel });
  }

  if (favoriteModel) {
    items.push({ label: copy.settingsProviderStatusFavoriteModel, value: favoriteModel });
  }

  if (usageStreak) {
    items.push({ label: copy.settingsProviderStatusUsageStreak, value: usageStreak });
  }

  if (lastActive) {
    items.push({ label: copy.settingsProviderStatusLastActive, value: lastActive });
  }

  if (totalSessions) {
    items.push({ label: copy.settingsProviderStatusTotalSessions, value: totalSessions });
  }

  if (totalMessages) {
    items.push({ label: copy.settingsProviderStatusTotalMessages, value: totalMessages });
  }

  return items;
}

function getCodexProviderSettingsStatusItems(status, provider, copy, language) {
  const items = [];
  const authMode = formatCodexAuthMode(status.authMode, language);
  const planType = formatCodexPlanType(status.planType);
  const defaultModel = formatProviderSettingsModelValue(status.defaultModel, provider);
  const reasoning = getReasoningEffortDisplayLabel(status.reasoningEffort, language);
  const lastTokens = formatCodexTokenUsageValue(status.lastTokenUsage, language);
  const contextWindow = status.modelContextWindow > 0
    ? formatTokenCountValue(status.modelContextWindow, language)
    : '';
  const primaryLimit = formatCodexRateLimitValue(status.rateLimits?.primary, language);
  const secondaryLimit = formatCodexRateLimitValue(status.rateLimits?.secondary, language);

  if (authMode) {
    items.push({ label: copy.settingsProviderStatusAuthMode, value: authMode });
  }

  if (planType) {
    items.push({ label: copy.settingsProviderStatusPlanType, value: planType });
  }

  if (defaultModel) {
    items.push({ label: copy.settingsProviderStatusDefaultModel, value: defaultModel });
  }

  if (reasoning) {
    items.push({ label: copy.settingsProviderStatusReasoning, value: reasoning });
  }

  if (lastTokens) {
    items.push({ label: copy.settingsProviderStatusLastTokens, value: lastTokens });
  }

  if (contextWindow) {
    items.push({ label: copy.settingsProviderStatusContextWindow, value: contextWindow });
  }

  if (primaryLimit) {
    items.push({ label: copy.settingsProviderStatusPrimaryLimit, value: primaryLimit });
  }

  if (secondaryLimit) {
    items.push({ label: copy.settingsProviderStatusSecondaryLimit, value: secondaryLimit });
  }

  return items;
}

function formatProviderSettingsModelValue(model, provider) {
  if (typeof model !== 'string' || !model.trim()) {
    return '';
  }

  const normalized = model.trim().toLowerCase();
  const matchedModel = (provider?.models || []).find((item) => (
    typeof item?.value === 'string'
    && item.value.trim().toLowerCase() === normalized
    && typeof item.label === 'string'
    && item.label.trim()
  ));

  return matchedModel?.label?.trim() || model.trim();
}

function formatFavoriteClaudeModelValue(favoriteModel, provider, language) {
  if (!favoriteModel || typeof favoriteModel !== 'object') {
    return '';
  }

  const modelLabel = formatProviderSettingsModelValue(favoriteModel.name, provider);
  if (!modelLabel) {
    return '';
  }

  const tokenCount = Number.isFinite(favoriteModel.totalTokens) && favoriteModel.totalTokens > 0
    ? formatTokenCountValue(favoriteModel.totalTokens, language)
    : '';
  return tokenCount ? `${modelLabel} · ${tokenCount}` : modelLabel;
}

function formatClaudeLastActiveValue(lastActive, language) {
  if (!lastActive || typeof lastActive !== 'object' || !lastActive.date) {
    return '';
  }

  const dateLabel = formatProviderStatusDateValue(lastActive.date, language);
  if (!dateLabel) {
    return '';
  }

  const messageCount = Number.isFinite(lastActive.messageCount) && lastActive.messageCount > 0
    ? `${formatLocalizedNumber(lastActive.messageCount, language)}${language === 'zh' ? ' 条消息' : ' msgs'}`
    : '';

  return [dateLabel, messageCount].filter(Boolean).join(' · ');
}

function formatCodexAuthMode(value, language) {
  const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalizedValue) {
    return '';
  }

  if (normalizedValue === 'chatgpt') {
    return 'ChatGPT';
  }

  if (['api_key', 'api-key', 'apikey'].includes(normalizedValue)) {
    return language === 'zh' ? 'API Key' : 'API key';
  }

  return formatStatusWord(normalizedValue);
}

function formatCodexPlanType(value) {
  const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalizedValue ? formatStatusWord(normalizedValue) : '';
}

function formatStatusWord(value) {
  return String(value || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getReasoningEffortDisplayLabel(value, language) {
  const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalizedValue) {
    return language === 'zh' ? '默认' : 'Default';
  }

  if (normalizedValue === 'xhigh') {
    return language === 'zh' ? '超高' : 'Very high';
  }

  return formatStatusWord(normalizedValue);
}

function getCodexContextTokenCount(usage) {
  if (!usage || typeof usage !== 'object') {
    return 0;
  }

  const totalTokens = Number.isFinite(usage.totalTokens) ? Math.max(Number(usage.totalTokens), 0) : 0;
  if (totalTokens > 0) {
    return totalTokens;
  }

  const inputTokens = Number.isFinite(usage.inputTokens) ? Math.max(Number(usage.inputTokens), 0) : 0;
  const outputTokens = Number.isFinite(usage.outputTokens) ? Math.max(Number(usage.outputTokens), 0) : 0;
  return inputTokens + outputTokens;
}

function formatCodexTokenUsageValue(usage, language) {
  const tokenCount = getCodexContextTokenCount(usage);
  if (!(tokenCount > 0)) {
    return '';
  }

  return formatTokenCountValue(tokenCount, language);
}

function formatCodexRateLimitValue(rateLimit, language) {
  if (!rateLimit || typeof rateLimit !== 'object' || !Number.isFinite(rateLimit.usedPercent)) {
    return '';
  }

  const remainingPercent = Math.round(clampNumber(1 - (Number(rateLimit.usedPercent) / 100), 0, 1) * 100);
  const resetLabel = formatCodexRateLimitResetValue(rateLimit.resetsAt, language);
  return resetLabel ? `${remainingPercent}% · ${resetLabel}` : `${remainingPercent}%`;
}

function formatCodexRateLimitResetValue(value, language) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  const now = new Date();
  const isSameDay = parsedDate.getFullYear() === now.getFullYear()
    && parsedDate.getMonth() === now.getMonth()
    && parsedDate.getDate() === now.getDate();

  if (isSameDay) {
    return parsedDate.toLocaleTimeString(getIntlLocale(language), {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return parsedDate.toLocaleDateString(getIntlLocale(language), {
    day: 'numeric',
    month: language === 'zh' ? 'long' : 'short',
  });
}

function formatProviderStatusDuration(value, language) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  return language === 'zh' ? `${value} 天` : `${value} days`;
}

function formatTokenCountValue(value, language) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  return `${formatLocalizedNumber(value, language)} tokens`;
}

function formatLocalizedNumber(value, language) {
  return new Intl.NumberFormat(getIntlLocale(language)).format(Number(value) || 0);
}

function formatProviderStatusUpdatedValue(value, language) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  return value.includes('T')
    ? formatDateTime(value, language)
    : formatProviderStatusDateValue(value, language);
}

function formatProviderStatusDateValue(value, language) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  const parsedDate = value.includes('T')
    ? new Date(value)
    : new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString(getIntlLocale(language), {
    day: '2-digit',
    month: '2-digit',
  });
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

function formatDateTime(value, language) {
  return new Date(value).toLocaleString(getIntlLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
}

function getIntlLocale(language) {
  return language === 'zh' ? 'zh-CN' : 'en-US';
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

function getInitialPaneSizeLimitIgnored() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(PANE_SIZE_LIMIT_IGNORED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getInitialPaneFinishFlashEnabled() {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const storedValue = window.localStorage.getItem(PANE_FINISH_FLASH_ENABLED_STORAGE_KEY);
    if (storedValue === null) {
      return true;
    }

    return storedValue === 'true';
  } catch {
    return true;
  }
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
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message,
      tone: payload?.tone || 'error',
    },
  ].slice(-4);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPlatformDisplayName(platform) {
  const normalizedPlatform = typeof platform === 'string' ? platform.trim().toLowerCase() : '';
  if (normalizedPlatform === 'darwin') {
    return 'macOS';
  }

  if (normalizedPlatform === 'win32') {
    return 'Windows';
  }

  if (normalizedPlatform === 'linux') {
    return 'Linux';
  }

  return normalizedPlatform;
}

function formatShortcutLabel(platform, key) {
  const normalizedKey = String(key || '').trim().toUpperCase();
  if (!normalizedKey) {
    return '';
  }

  return platform === 'darwin'
    ? `⌘${normalizedKey}`
    : `Meta+${normalizedKey}`;
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
