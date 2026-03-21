import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FilePlus2,
  FileSymlink,
  FileWarning,
  Folder,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToastViewport } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const LANGUAGE_STORAGE_KEY = 'cc-desktop-proxy-language';
const THEME_STORAGE_KEY = 'cc-desktop-proxy-theme';

const COPY = {
  zh: {
    added: '新增',
    allClean: '当前仓库已经没有待查看的变更了。',
    bridgeUnavailable: '当前页面没有接到 Electron bridge，请通过桌面应用启动。',
    changedFiles: (count) => `${count} 个变更文件`,
    deleted: '删除',
    emptyDiff: '这个文件当前没有可展示的文本 diff。',
    gitChanges: 'Git 变更',
    modified: '修改',
    noFileSelected: '从左侧选择一个文件查看 diff',
    openFileInEditor: '在编辑器中打开当前文件',
    openWorkspaceInEditor: '在编辑器中打开工作目录',
    refresh: '刷新',
    refreshing: '刷新中...',
    renamed: '重命名',
    repoPath: '仓库路径',
    typeChanged: '类型变更',
    unmerged: '冲突',
    untracked: '未跟踪',
    workspace: '工作目录',
  },
  en: {
    added: 'Added',
    allClean: 'This repository no longer has pending changes to inspect.',
    bridgeUnavailable: 'Electron bridge is not available on this page. Please open it from the desktop app.',
    changedFiles: (count) => `${count} changed files`,
    deleted: 'Deleted',
    emptyDiff: 'There is no textual diff to show for this file right now.',
    gitChanges: 'Git Changes',
    modified: 'Modified',
    noFileSelected: 'Select a file on the left to inspect its diff',
    openFileInEditor: 'Open current file in editor',
    openWorkspaceInEditor: 'Open workspace in editor',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    renamed: 'Renamed',
    repoPath: 'Repository',
    typeChanged: 'Type changed',
    unmerged: 'Unmerged',
    untracked: 'Untracked',
    workspace: 'Workspace',
  },
};

export default function GitDiffWindow({ desktopClient }) {
  const workspaceId = useMemo(() => getWindowWorkspaceId(), []);
  const [language, setLanguage] = useState(() => getInitialLanguage());
  const [themePreference, setThemePreference] = useState(() => getInitialThemePreference());
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme());
  const [data, setData] = useState(null);
  const [toastItems, setToastItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState('');

  const copy = COPY[language];
  const resolvedTheme = themePreference === 'system' ? systemTheme : themePreference;
  const files = Array.isArray(data?.files) ? data.files : [];
  const summary = data?.summary || {};
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());
  const selectedFile = files.find((file) => file.path === selectedPath) || files[0] || null;
  const headerAddedLines = Number.isFinite(summary.addedLines) ? summary.addedLines : 0;
  const headerDeletedLines = Number.isFinite(summary.deletedLines) ? summary.deletedLines : 0;
  const showHeaderChangeSummary = headerAddedLines > 0 || headerDeletedLines > 0;

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    document.documentElement.lang = getIntlLocale(language);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [language, themePreference]);

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
      setError(copy.bridgeUnavailable);
      setIsLoading(false);
      return;
    }

    void loadData();
  }, [copy.bridgeUnavailable, desktopClient, workspaceId]);

  useEffect(() => {
    if (!files.length) {
      setSelectedPath('');
      return;
    }

    if (files.some((file) => file.path === selectedPath)) {
      return;
    }

    setSelectedPath(files[0].path);
  }, [files, selectedPath]);

  async function loadData() {
    if (!desktopClient) {
      return;
    }

    if (!workspaceId) {
      setError(language === 'zh' ? '缺少工作目录参数。' : 'Missing workspace id.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const nextData = await desktopClient.getGitDiffViewData({ workspaceId });
      setData(nextData);
      setSelectedPath((current) => (
        nextData.files.some((file) => file.path === current)
          ? current
          : (nextData.files[0]?.path || '')
      ));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsLoading(false);
    }
  }

  function dismissToast(toastId) {
    setToastItems((current) => current.filter((item) => item.id !== toastId));
  }

  function setError(nextError) {
    const message = normalizeToastMessage(nextError);
    if (!message) {
      return;
    }

    setToastItems((current) => appendToast(current, {
      message,
      tone: 'error',
    }));
  }

  async function openWorkspaceInEditor() {
    if (!desktopClient || !workspaceId) {
      return;
    }

    try {
      await desktopClient.openWorkspaceInCodeEditor(workspaceId);
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function openSelectedFileInEditor() {
    if (!desktopClient || !workspaceId || !selectedFile?.path) {
      return;
    }

    try {
      await desktopClient.openGitDiffFileInCodeEditor({
        path: selectedFile.path,
        workspaceId,
      });
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <ToastViewport items={toastItems} onDismiss={dismissToast} />
      <div className="drag-region h-10 shrink-0 border-b border-border/60 bg-background/70 backdrop-blur" />

      <header className="border-b border-border/70 bg-background/85 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground">{copy.gitChanges}</p>
            {showHeaderChangeSummary ? (
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <span className="text-muted-foreground">·</span>
                <span className="text-emerald-700 dark:text-emerald-300">+{headerAddedLines}</span>
                <span className="text-rose-600 dark:text-rose-300">-{headerDeletedLines}</span>
              </div>
            ) : null}
          </div>
          <div className="no-drag flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="h-6 bg-background/80 px-2 text-[10px] text-foreground">
              {copy.changedFiles(summary.filesChanged || 0)}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void openWorkspaceInEditor();
              }}
              disabled={!desktopClient || !workspaceId}
              className="h-8 w-8 rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
              aria-label={copy.openWorkspaceInEditor}
              title={copy.openWorkspaceInEditor}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void loadData();
              }}
              disabled={isLoading || !desktopClient}
              className="h-8 w-8 rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
              aria-label={isLoading ? copy.refreshing : copy.refresh}
              title={isLoading ? copy.refreshing : copy.refresh}
            >
              {isLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-0">
          <aside className="flex w-[320px] min-w-[280px] flex-col border-r border-border/70 bg-background/55">
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-2 py-3">
                {!isLoading && files.length === 0 ? (
                  <EmptyPanel text={copy.allClean} />
                ) : (
                  <FileTree
                    collapsedFolders={collapsedFolders}
                    onSelectFile={setSelectedPath}
                    onToggleFolder={(folderPath) => {
                      setCollapsedFolders((current) => {
                        const next = new Set(current);
                        if (next.has(folderPath)) {
                          next.delete(folderPath);
                        } else {
                          next.add(folderPath);
                        }
                        return next;
                      });
                    }}
                    selectedFilePath={selectedFile?.path || ''}
                    tree={fileTree}
                  />
                )}
              </div>
            </ScrollArea>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col bg-background/30">
            <div className="border-b border-border/70 px-4 py-3">
              {selectedFile ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[12px] font-medium text-foreground">
                        {selectedFile.oldPath ? `${selectedFile.oldPath} -> ${selectedFile.path}` : selectedFile.path}
                      </p>
                      <StatusBadge language={language} status={selectedFile.status} />
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        +{selectedFile.addedLines || 0}
                      </span>
                      <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                        -{selectedFile.deletedLines || 0}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      void openSelectedFileInEditor();
                    }}
                    disabled={!desktopClient || !selectedFile?.path}
                    className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-label={copy.openFileInEditor}
                    title={copy.openFileInEditor}
                  >
                    <FileSymlink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">{copy.noFileSelected}</p>
              )}
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4">
                {selectedFile ? (
                  selectedFile.diff ? (
                    <UnifiedDiff diff={selectedFile.diff} />
                  ) : (
                    <EmptyPanel text={copy.emptyDiff} />
                  )
                ) : (
                  <EmptyPanel text={copy.noFileSelected} />
                )}
              </div>
            </ScrollArea>
          </section>
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({ text }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-border/80 bg-background/50 px-6 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}

function FileTree({ collapsedFolders, onSelectFile, onToggleFolder, selectedFilePath, tree }) {
  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          collapsedFolders={collapsedFolders}
          depth={0}
          node={node}
          onSelectFile={onSelectFile}
          onToggleFolder={onToggleFolder}
          selectedFilePath={selectedFilePath}
        />
      ))}
    </div>
  );
}

function FileTreeNode({ collapsedFolders, depth, node, onSelectFile, onToggleFolder, selectedFilePath }) {
  if (node.type === 'folder') {
    const isCollapsed = collapsedFolders.has(node.path);
    const FolderIcon = isCollapsed ? Folder : FolderOpen;

    return (
      <div>
        <button
          type="button"
          onClick={() => onToggleFolder(node.path)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-background/60"
          style={{ paddingLeft: `${8 + depth * 20}px` }}
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <FolderIcon className="h-4 w-4 shrink-0 text-sky-500" />
          <span className="truncate text-[12px] font-medium text-foreground">{node.name}</span>
        </button>
        {!isCollapsed ? node.children.map((child) => (
          <FileTreeNode
            key={child.path}
            collapsedFolders={collapsedFolders}
            depth={depth + 1}
            node={child}
            onSelectFile={onSelectFile}
            onToggleFolder={onToggleFolder}
            selectedFilePath={selectedFilePath}
          />
        )) : null}
      </div>
    );
  }

  const FileTypeIcon = getFileStatusIcon(node.file.status);
  const isSelected = selectedFilePath === node.file.path;

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.file.path)}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left',
        isSelected ? 'bg-background/80 text-foreground' : 'hover:bg-background/60 text-foreground/92',
      )}
      style={{ paddingLeft: `${30 + depth * 20}px` }}
    >
      <FileTypeIcon className={cn('h-4 w-4 shrink-0', getFileStatusIconClassName(node.file.status))} />
      <span className="truncate text-[12px]">{node.name}</span>
    </button>
  );
}

function StatusBadge({ language, status }) {
  const copy = COPY[language];
  const labelMap = {
    added: copy.added,
    copied: copy.renamed,
    deleted: copy.deleted,
    modified: copy.modified,
    renamed: copy.renamed,
    'type-changed': copy.typeChanged,
    unmerged: copy.unmerged,
    untracked: copy.untracked,
  };

  const toneMap = {
    added: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    copied: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200',
    deleted: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200',
    modified: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
    renamed: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200',
    'type-changed': 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-200',
    unmerged: 'border-destructive/25 bg-destructive/10 text-destructive',
    untracked: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };

  return (
    <span className={cn(
      'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
      toneMap[status] || toneMap.modified,
    )}
    >
      {labelMap[status] || copy.modified}
    </span>
  );
}

function UnifiedDiff({ diff }) {
  const lines = diff.split(/\r?\n/);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {lines.map((line, index) => (
          <div
            key={`${index}-${line}`}
            className={cn(
              'flex items-start gap-4 px-4 py-0.5 font-mono text-[12px] leading-6',
              getDiffLineClassName(line),
            )}
          >
            <span className="w-10 shrink-0 select-none text-right text-[10px] text-muted-foreground/80">
              {index + 1}
            </span>
            <span className="whitespace-pre">{line || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getDiffLineClassName(line) {
  if (line.startsWith('@@')) {
    return 'bg-sky-500/10 text-sky-700 dark:text-sky-200';
  }

  if (line.startsWith('+') && !line.startsWith('+++')) {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200';
  }

  if (line.startsWith('-') && !line.startsWith('---')) {
    return 'bg-rose-500/10 text-rose-700 dark:text-rose-200';
  }

  if (line.startsWith('diff --git')) {
    return 'border-b border-border/60 bg-secondary/70 font-semibold text-foreground';
  }

  if (
    line.startsWith('index ')
    || line.startsWith('new file mode')
    || line.startsWith('deleted file mode')
    || line.startsWith('similarity index')
    || line.startsWith('rename from ')
    || line.startsWith('rename to ')
  ) {
    return 'text-muted-foreground';
  }

  return '';
}

function getWindowWorkspaceId() {
  if (typeof window === 'undefined') {
    return '';
  }

  return new URLSearchParams(window.location.search).get('workspaceId') || '';
}

function getInitialThemePreference() {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
  return ['system', 'light', 'dark'].includes(storedValue) ? storedValue : 'system';
}

function getSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return 'zh';
  }

  const storedValue = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (storedValue === 'zh' || storedValue === 'en') {
    return storedValue;
  }

  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function getIntlLocale(language) {
  return language === 'zh' ? 'zh-CN' : 'en-US';
}

function getPathBaseName(value) {
  const normalized = String(value || '');
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
}

function getPathDirName(value) {
  const normalized = String(value || '');
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex > 0 ? normalized.slice(0, slashIndex) : '';
}

function buildFileTree(files) {
  const root = [];

  for (const file of files) {
    const segments = String(file.path || '').split('/').filter(Boolean);
    if (!segments.length) {
      continue;
    }

    let cursor = root;
    let currentPath = '';

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;

      if (isLeaf) {
        cursor.push({
          file,
          name: segment,
          path: currentPath,
          type: 'file',
        });
        continue;
      }

      let folderNode = cursor.find((entry) => entry.type === 'folder' && entry.name === segment);
      if (!folderNode) {
        folderNode = {
          children: [],
          name: segment,
          path: currentPath,
          type: 'folder',
        };
        cursor.push(folderNode);
      }

      cursor = folderNode.children;
    }
  }

  return sortFileTreeNodes(root);
}

function sortFileTreeNodes(nodes) {
  return nodes
    .map((node) => (
      node.type === 'folder'
        ? { ...node, children: sortFileTreeNodes(node.children) }
        : node
    ))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'folder' ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
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

function getFileStatusIcon(status) {
  switch (status) {
    case 'added':
    case 'untracked':
      return FilePlus2;
    case 'renamed':
    case 'copied':
      return FileSymlink;
    case 'unmerged':
      return FileWarning;
    default:
      return FileIcon;
  }
}

function getFileStatusIconClassName(status) {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'deleted':
      return 'text-rose-700 dark:text-rose-300';
    case 'renamed':
    case 'copied':
      return 'text-sky-600 dark:text-sky-300';
    case 'unmerged':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}
