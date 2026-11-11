const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#EDF1F6",
    title: `DRE ${app.getVersion()} — Dimensionamento de Fossa, Filtro e Sumidouro`,
    icon: path.join(__dirname, "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("save-file", async (event, { content, defaultName, filters, isBase64 }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: filters || [{ name: "Todos os arquivos", extensions: ["*"] }],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }
  try {
    const data = isBase64 ? Buffer.from(content, "base64") : content;
    fs.writeFileSync(result.filePath, data, isBase64 ? undefined : "utf-8");
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
