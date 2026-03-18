import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Blocks,
  Bot,
  BrainCircuit,
  ChevronRight,
  CheckCircle2,
  Folder,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  MessageSquarePlus,
  PlugZap,
  Sparkles,
  Square,
  TerminalSquare,
  Workflow,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { renderMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';

const EMPTY_APP_STATE = {
  activeSession: null,
  claude: {
    available: false,
    busy: false,
    version: '',
  },
  platform: '',
  selectedSessionId: null,
  selectedWorkspaceId: null,
  workspaces: [],
};

export default function App() {
  const desktopClient = typeof window !== 'undefined' ? window.claudeDesktop : null;

  const [appState, setAppState] = useState(EMPTY_APP_STATE);
  const [inputValue, setInputValue] = useState('');
  const [sidebarError, setSidebarError] = useState(
    desktopClient ? '' : '当前页面没有接到 Electron bridge，请通过桌面应用启动。',
  );
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isPickingWorkspace, setIsPickingWorkspace] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const textareaRef = useRef(null);
  const messageViewportRef = useRef(null);

  const selectedWorkspace = useMemo(
    () => appState.workspaces.find((workspace) => workspace.id === appState.selectedWorkspaceId) || null,
    [appState.selectedWorkspaceId, appState.workspaces],
  );
  const selectedSession = appState.activeSession;
  const isMac = appState.platform === 'darwin';
  const shouldShowRunIndicator = useMemo(
    () => shouldRenderRunIndicator(selectedSession, isSending),
    [isSending, selectedSession],
  );

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
    setExpandedWorkspaceIds((current) => {
      const validIds = new Set(appState.workspaces.map((workspace) => workspace.id));
      let next = current.filter((id) => validIds.has(id));

      if (appState.selectedWorkspaceId && !next.includes(appState.selectedWorkspaceId)) {
        next = [...next, appState.selectedWorkspaceId];
      }

      if (!next.length && appState.workspaces[0]?.id) {
        next = [appState.workspaces[0].id];
      }

      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current;
      }

      return next;
    });
  }, [appState.selectedWorkspaceId, appState.workspaces]);

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

  async function sendMessage() {
    if (!desktopClient || !selectedSession || !selectedWorkspace || appState.claude.busy) {
      return;
    }

    const prompt = inputValue.trim();
    if (!prompt) {
      return;
    }

    setIsSending(true);
    setSidebarError('');
    setInputValue('');

    try {
      await desktopClient.sendMessage({
        prompt,
        sessionId: selectedSession.id,
        workspaceId: selectedWorkspace.id,
      });
    } catch (error) {
      setIsSending(false);
      setInputValue(prompt);
      setSidebarError(error.message);
    }
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

  function toggleWorkspaceExpansion(workspaceId) {
    setExpandedWorkspaceIds((current) => (
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId]
    ));
  }

  const canSend = Boolean(desktopClient && selectedWorkspace && selectedSession && !appState.claude.busy && inputValue.trim());

  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--card)/0.88)_0%,transparent_18%,transparent_82%,hsl(var(--background)/0.96)_100%)]" />

      <div
        className={cn(
          'drag-region fixed inset-x-0 top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur',
          isMac ? 'h-14' : 'h-11',
        )}
      >
        <div
          className={cn(
            'flex h-full w-full items-center gap-2 px-3.5 text-[11px] sm:px-5',
            isMac && 'pl-24 sm:pl-28',
          )}
        >
          <div className="flex items-center gap-2">
            <StatusPill
              tone={appState.claude.available ? 'success' : 'error'}
              label={formatClaudeStatusLabel(appState.claude)}
            />
            {appState.claude.busy && <StatusPill tone="running" label="运行中" />}
          </div>
        </div>
      </div>

      <main
        className={cn(
          'relative flex h-full w-full overflow-hidden',
          isMac ? 'pt-16' : 'pt-14',
        )}
      >
        <aside className="flex w-[360px] min-w-[360px] shrink-0 flex-col overflow-hidden border-r border-border/70 bg-background/60">
          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full px-3 py-3">
              <div className="space-y-5">
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
                  title="工作目录"
                  action={(
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={addWorkspace}
                      disabled={!desktopClient || isPickingWorkspace || appState.claude.busy}
                      aria-label="添加工作目录"
                      title="添加工作目录"
                      className="h-7 w-7 shrink-0 rounded-md"
                    >
                      {isPickingWorkspace ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                    </Button>
                  )}
                >
                  {appState.workspaces.length === 0 ? (
                    <SidebarEmpty text="还没有工作目录，先添加一个本地目录。" />
                  ) : (
                    appState.workspaces.map((workspace) => (
                      <WorkspaceItem
                        key={workspace.id}
                        disabled={appState.claude.busy}
                        isExpanded={expandedWorkspaceIds.includes(workspace.id)}
                        onCreateSession={() => createSession(workspace.id)}
                        onSelectSession={(sessionId) => selectSession(workspace.id, sessionId)}
                        onSelectWorkspace={() => selectWorkspace(workspace.id)}
                        onToggleExpand={() => toggleWorkspaceExpansion(workspace.id)}
                        selectedSessionId={appState.selectedSessionId}
                        workspace={workspace}
                      />
                    ))
                  )}
                </SidebarSection>
              </div>
            </ScrollArea>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background/35">
          <div className="border-b border-border/70 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate pr-3 text-[13px] font-medium text-foreground">
                {selectedSession?.title || (selectedWorkspace ? '还没有打开对话' : '选择一个工作目录')}
              </p>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {selectedWorkspace && (
                  <Badge variant="outline" className="bg-background/80 text-foreground">
                    {selectedWorkspace.name}
                  </Badge>
                )}
                {selectedSession?.claudeSessionId && (
                  <Badge variant="outline">
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
                title="先添加一个工作目录"
                description="工作目录会成为 Claude Code 运行时的本地上下文。你可以创建多个目录，并在左侧切换它们各自的历史对话。"
              />
            ) : !selectedSession ? (
              <ConversationEmptyState
                icon={MessageSquarePlus}
                title="为当前目录新开对话"
                description="这个工作目录已经选中，但还没有打开任何会话。点击左侧目录项右侧的“新对话”，就会在该目录下创建新的历史会话。"
              />
            ) : (
              <ScrollArea viewportRef={messageViewportRef} className="h-full px-4 md:px-5">
                <div className="mx-auto flex w-full max-w-[780px] flex-col gap-3 py-4">
                    {selectedSession.messages.length === 0 ? (
                      <ConversationEmptyState
                        icon={Bot}
                        title="这个会话还没有内容"
                      />
                    ) : (
                    <>
                      {selectedSession.messages.map((message) => <ChatMessage key={message.id} message={message} />)}
                      {shouldShowRunIndicator && <RunIndicator />}
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
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={
                    selectedSession
                      ? '输入消息，Enter 发送，Shift+Enter 换行...'
                      : '先在左侧创建或选择一个历史会话'
                  }
                  className="min-h-[96px] resize-none pb-12 pr-14"
                  disabled={!selectedSession || !desktopClient || appState.claude.busy || isBootstrapping}
                />
                <Button
                  onClick={appState.claude.busy ? stopRun : sendMessage}
                  disabled={appState.claude.busy ? false : !canSend}
                  size="icon"
                  aria-label={appState.claude.busy ? '停止生成' : (isSending ? '发送中' : '发送消息')}
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
    </div>
  );
}

function SidebarSection({ action, title, children }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SidebarEmpty({ text }) {
  return <div className="rounded-xl border border-dashed border-border/80 bg-background/70 px-3 py-3 text-[13px] leading-5 text-muted-foreground">{text}</div>;
}

function WorkspaceItem({
  disabled,
  isExpanded,
  onCreateSession,
  onSelectSession,
  onSelectWorkspace,
  onToggleExpand,
  selectedSessionId,
  workspace,
}) {
  const FolderIcon = isExpanded ? FolderOpen : Folder;

  return (
    <div title={workspace.path} className="py-0.5">
      <div className="group flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform,box-shadow] hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-95 active:bg-background"
            disabled={disabled}
            aria-label={isExpanded ? '收起工作目录' : '展开工作目录'}
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
        <Button
          variant="ghost"
          size="icon"
          onClick={onCreateSession}
          disabled={disabled}
          className="pointer-events-none h-7 w-7 shrink-0 rounded-none border-0 bg-transparent p-0 text-muted-foreground opacity-0 shadow-none transition-[opacity,color,transform] duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-transparent hover:text-foreground focus-visible:opacity-100"
          title={`在 ${workspace.path} 中新建对话`}
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-1.5 ml-7 border-l border-border/70 pl-2.5">
          {workspace.sessions.length === 0 ? (
            <p className="py-1.5 text-[11px] text-muted-foreground">还没有对话</p>
          ) : (
            <div className="divide-y divide-border/60">
              {workspace.sessions.map((session) => (
                <SessionItem
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

function SessionItem({ isSelected, onSelect, session }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full px-3 py-2.5 text-left transition-[background-color,color,transform,box-shadow] hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35 active:translate-y-px active:bg-background"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[12px] font-medium text-foreground/90">{session.title}</p>
        {session.isRunning && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" />}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground/90">{session.preview}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/90">
        <span>{formatDateTime(session.updatedAt)}</span>
        {session.claudeSessionId && <span>{truncateMiddle(session.claudeSessionId, 14)}</span>}
      </div>
    </button>
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

function ChatMessage({ message }) {
  if (message.role === 'event') {
    return <EventMessage message={message} />;
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

function EventMessage({ message }) {
  const meta = getEventMeta(message.kind, message.status);
  const Icon = meta.icon;
  const collapsible = isCollapsibleEvent(message);
  const [isOpen, setIsOpen] = useState(false);
  const preview = createEventPreview(message.content);

  return (
    <div className="flex items-start gap-2.5 py-0.5">
      <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md', meta.iconWrapperClassName)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[12px] font-medium text-muted-foreground">{message.title}</p>
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">{formatTime(message.createdAt)}</span>
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
              {isOpen ? '收起详情' : '展开详情'}
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
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em]',
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

  return {
    icon: PlugZap,
    iconWrapperClassName: 'bg-secondary text-secondary-foreground',
  };
}

function isCollapsibleEvent(message) {
  return ['agent', 'debug', 'mcp', 'skill', 'tool', 'tool_result'].includes(message.kind);
}

function createEventPreview(content) {
  if (!content) {
    return '';
  }

  return content.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function formatClaudeStatusLabel(claude) {
  const version = normalizeClaudeVersion(claude?.version);

  if (claude?.available) {
    return version ? `Claude Code · ${version}` : 'Claude Code';
  }

  return version ? `Claude Code 不可用 · ${version}` : 'Claude Code 不可用';
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

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncateMiddle(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value || '';
  }

  const edgeLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, edgeLength)}...${value.slice(-edgeLength)}`;
}
