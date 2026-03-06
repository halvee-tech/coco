import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to Renderer via window.cocoAPI
contextBridge.exposeInMainWorld('cocoAPI', {
  // Placeholder - will be populated as IPC handlers are implemented
  ping: () => ipcRenderer.invoke('ping')
})
