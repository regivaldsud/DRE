const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  saveFile: (content, defaultName, filters, isBase64) =>
    ipcRenderer.invoke("save-file", { content, defaultName, filters, isBase64 }),
});
