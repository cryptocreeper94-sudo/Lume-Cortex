import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { exec } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: true, // We keep the standard OS frame for standard minimize/maximize controls
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#020208',
      symbolColor: '#ffffff',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Load the built dist folder
  mainWindow.loadFile(path.join(__dirname, '../app.html'))

  // Intercept external links to open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('https')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// IPC Handler to open external URLs manually
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url)
})

// IPC Handler to launch or install TrustShield locally
ipcMain.handle('launch-trustshield', async () => {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) {
    shell.openExternal('https://trustshield.tech')
    return { success: false, reason: 'LOCALAPPDATA not found' }
  }

  // Check standard per-user install path for electron apps
  const exePath = path.join(localAppData, 'Programs', 'trustshield', 'TrustShield.exe')
  
  if (fs.existsSync(exePath)) {
    // Already installed — launch the sentinel
    exec(`"${exePath}"`, (err) => {
      if (err) console.error('Failed to launch TrustShield:', err)
    })
    return { success: true, action: 'launched' }
  } else {
    // Not installed — fall back to the local installer we just built for this environment
    const localInstaller = 'D:\\TrustShield\\dist\\TrustShield Setup 1.0.0.exe'
    if (fs.existsSync(localInstaller)) {
      exec(`"${localInstaller}"`, (err) => {
        if (err) console.error('Failed to launch TrustShield installer:', err)
      })
      return { success: true, action: 'installing' }
    } else {
      // Ultimate fallback: open the website to download
      shell.openExternal('https://trustshield.tech')
      return { success: true, action: 'download' }
    }
  }
})
