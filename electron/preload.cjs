const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeDesktop', {
  addWorkspace: (workspacePath) => ipcRenderer.invoke('desktop:add-workspace', workspacePath),
  archiveSession: (payload) => ipcRenderer.invoke('desktop:archive-session', payload),
  createSession: (payload) => ipcRenderer.invoke('desktop:create-session', payload),
  getAppState: () => ipcRenderer.invoke('desktop:get-app-state'),
  getGitDiffViewData: (payload) => ipcRenderer.invoke('desktop:get-git-diff-view-data', payload),
  getSession: (payload) => ipcRenderer.invoke('desktop:get-session', payload),
  installSkill: (payload) => ipcRenderer.invoke('desktop:install-skill', payload),
  listSkills: (payload) => ipcRenderer.invoke('desktop:list-skills', payload),
  openLink: (href) => ipcRenderer.invoke('desktop:open-link', href),
  openGitDiffFileInCodeEditor: (payload) => ipcRenderer.invoke('desktop:open-git-diff-file-in-code-editor', payload),
  openGitDiffWindow: (payload) => ipcRenderer.invoke('desktop:open-git-diff-window', payload),
  openWorkspaceInCodeEditor: (workspaceId) => ipcRenderer.invoke('desktop:open-workspace-in-code-editor', workspaceId),
  openWorkspaceInFinder: (workspaceId) => ipcRenderer.invoke('desktop:open-workspace-in-finder', workspaceId),
  onStateChange: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on('claude:event', listener);

    return () => {
      ipcRenderer.removeListener('claude:event', listener);
    };
  },
  pickAttachments: () => ipcRenderer.invoke('desktop:pick-attachments'),
  preparePastedAttachments: (payload) => ipcRenderer.invoke('desktop:prepare-pasted-attachments', payload),
  pickWorkspaceDirectory: () => ipcRenderer.invoke('desktop:pick-workspace'),
  refreshProviderStatus: () => ipcRenderer.invoke('desktop:refresh-provider-status'),
  removeWorkspace: (workspaceId) => ipcRenderer.invoke('desktop:remove-workspace', workspaceId),
  respondToApproval: (payload) => ipcRenderer.invoke('desktop:respond-to-approval', payload),
  setCodeEditor: (payload) => ipcRenderer.invoke('desktop:set-code-editor', payload),
  setExpandedWorkspaces: (workspaceIds) => ipcRenderer.invoke('desktop:set-expanded-workspaces', workspaceIds),
  setPaneLayout: (paneLayout) => ipcRenderer.invoke('desktop:set-pane-layout', paneLayout),
  selectSession: (payload) => ipcRenderer.invoke('desktop:select-session', payload),
  selectWorkspace: (workspaceId) => ipcRenderer.invoke('desktop:select-workspace', workspaceId),
  sendMessage: (payload) => ipcRenderer.invoke('desktop:send-message', payload),
  setProviderEnabled: (payload) => ipcRenderer.invoke('desktop:set-provider-enabled', payload),
  setProviderSystemPrompt: (payload) => ipcRenderer.invoke('desktop:set-provider-system-prompt', payload),
  stopRun: (payload) => ipcRenderer.invoke('desktop:stop-run', payload),
  updateSessionProvider: (payload) => ipcRenderer.invoke('desktop:update-session-provider', payload),
  runMcpCommand: (payload) => ipcRenderer.invoke('desktop:run-mcp-command', payload),
  updateSessionModel: (payload) => ipcRenderer.invoke('desktop:update-session-model', payload),
  updateSessionReasoningEffort: (payload) => ipcRenderer.invoke('desktop:update-session-reasoning-effort', payload),
  updateSessionPermissionMode: (payload) => ipcRenderer.invoke('desktop:update-session-permission-mode', payload),
});
