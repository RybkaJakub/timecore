const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  invoke: (...args) => ipcRenderer.invoke(...args),
  send: (...args) => ipcRenderer.send(...args),
  receive: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  on: (...args) => ipcRenderer.on(...args)
});
