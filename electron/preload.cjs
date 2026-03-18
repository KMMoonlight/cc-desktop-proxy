const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeDesktop', {
  addWorkspace: (workspacePath) => ipcRenderer.invoke('desktop:add-workspace', workspacePath),
  createSession: (workspaceId) => ipcRenderer.invoke('desktop:create-session', workspaceId),
  getAppState: () => ipcRenderer.invoke('desktop:get-app-state'),
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
  selectSession: (payload) => ipcRenderer.invoke('desktop:select-session', payload),
  selectWorkspace: (workspaceId) => ipcRenderer.invoke('desktop:select-workspace', workspaceId),
  sendMessage: (payload) => ipcRenderer.invoke('desktop:send-message', payload),
  stopRun: () => ipcRenderer.invoke('desktop:stop-run'),
});
