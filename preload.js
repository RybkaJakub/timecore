const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  invoke: (...args) => ipcRenderer.invoke(...args),
  send: (...args) => ipcRenderer.send(...args),
  receive: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  on: (...args) => ipcRenderer.on(...args)
});


contextBridge.exposeInMainWorld('api', {
  // vrátí Promise<boolean>, ale interně používá .send / .once
  checkLicense(key) {
    return new Promise((resolve) => {
      ipcRenderer.once('license-result', (_ev, ok) => resolve(ok));
      ipcRenderer.send('check-license', key);
    });
  },
  closeWindow: () => ipcRenderer.send('window-close'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
});