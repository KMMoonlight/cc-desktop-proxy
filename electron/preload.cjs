const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeDesktop', {
  addWorkspace: (workspacePath) => ipcRenderer.invoke('desktop:add-workspace', workspacePath),
  archiveSession: (payload) => ipcRenderer.invoke('desktop:archive-session', payload),
  createSession: (workspaceId) => ipcRenderer.invoke('desktop:create-session', workspaceId),
  getAppState: () => ipcRenderer.invoke('desktop:get-app-state'),
  installSkill: (payload) => ipcRenderer.invoke('desktop:install-skill', payload),
  listSkills: (payload) => ipcRenderer.invoke('desktop:list-skills', payload),
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
  pickWorkspaceDirectory: () => ipcRenderer.invoke('desktop:pick-workspace'),
  removeWorkspace: (workspaceId) => ipcRenderer.invoke('desktop:remove-workspace', workspaceId),
  setExpandedWorkspaces: (workspaceIds) => ipcRenderer.invoke('desktop:set-expanded-workspaces', workspaceIds),
  selectSession: (payload) => ipcRenderer.invoke('desktop:select-session', payload),
  selectWorkspace: (workspaceId) => ipcRenderer.invoke('desktop:select-workspace', workspaceId),
  sendMessage: (payload) => ipcRenderer.invoke('desktop:send-message', payload),
  stopRun: () => ipcRenderer.invoke('desktop:stop-run'),
  runMcpCommand: (payload) => ipcRenderer.invoke('desktop:run-mcp-command', payload),
  updateSessionModel: (payload) => ipcRenderer.invoke('desktop:update-session-model', payload),
});
