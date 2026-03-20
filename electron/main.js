const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

let mainWindow;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Disable webSecurity to allow CORS from file:// to https://
    },
    icon: path.join(__dirname, 'icon.png')
  });

  // Hide the default menu
  mainWindow.setMenu(null);

  if (isDev) {
    // Enable insecure localhost in dev
    app.commandLine.appendSwitch('ignore-certificate-errors');
    app.commandLine.appendSwitch('disable-features', 'Autofill,AutofillServerCommunication');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, we might want to allow it too if users have self-signed certs
    // CAUTION: This disables SSL validation globally.
    // For a self-hosted app, this is often requested.
    app.commandLine.appendSwitch('ignore-certificate-errors');
    
    // Load local file
    // Ensure frontend is built to resources/frontend
    mainWindow.loadFile(path.join(__dirname, '../resources/frontend/index.html'));
  }
}

app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');

app.whenReady().then(() => {
  // IPC: Resolve URL (follow redirects)
  ipcMain.handle('resolve-url', async (event, targetUrl) => {
    return new Promise((resolve, reject) => {
      // Use redirect: 'follow' to let net.request handle redirects.
      // But capturing the final URL is not directly exposed in the response object easily
      // unless we check response.responseUrl (if available in Electron's net module).
      // A more robust way for "Resolve URL" is manual following or checking if response.url exists.
      // Electron net.request response doesn't always have the final URL property.
      
      // Let's use the manual redirect logic from 'resolve-redirect' as it is more reliable for extracting the final destination.
      // Or simplify: just check if the URL is reachable.
      
      // Actually, 'resolve-url' seems unused in frontend? 
      // 'resolve-redirect' is the one used in LoginPage.
      const request = net.request({ url: targetUrl, redirect: 'follow' });
      request.on('response', (response) => {
        resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, url: targetUrl }); 
      });
      request.on('error', (error) => {
        reject(error);
      });
      request.end();
    });
  });

  // IPC: Advanced Resolve (Manual Redirect Following)
  ipcMain.handle('resolve-redirect', async (event, initialUrl) => {
    // Add protocol if missing
    let currentUrl = initialUrl;
    if (!currentUrl.startsWith('http')) {
        currentUrl = 'http://' + currentUrl;
    }
    
    // Fix: Handle malformed URLs like "http:// http://localhost:3000"
    // This happens if client prepends http:// to an already full URL
    // or if initialUrl is garbage.
    if (currentUrl.match(/^http:\/\/\s*http/i) || currentUrl.match(/^https:\/\/\s*http/i)) {
         currentUrl = currentUrl.replace(/^https?:\/\/\s*/i, '');
    }
    
    let loopCount = 0;
    const maxRedirects = 10;

    try {
      while (loopCount < maxRedirects) {
        console.log(`Resolving redirect loop ${loopCount}: ${currentUrl}`);
        const result = await new Promise((resolve, reject) => {
          // Use 'follow' for first hop? No, 'manual' is safer to inspect location header.
          // But Electron net.request might be strict about SSL or other things.
          // Try/catch around request creation
          try {
              const request = net.request({ url: currentUrl, redirect: 'manual' });
              
              request.on('response', (response) => {
                // Check for redirect status codes (301, 302, 307, 308)
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers['location']) {
                  let newLocation = response.headers['location'];
                  if (Array.isArray(newLocation)) newLocation = newLocation[0];
                  // Handle relative URLs
                  try {
                      const nextUrl = new URL(newLocation, currentUrl).toString();
                      resolve({ redirect: true, nextUrl });
                  } catch (e) {
                      reject(new Error(`Invalid redirect URL: ${newLocation}`));
                  }
                } else {
                  // No redirect, return this as final
                  resolve({ redirect: false, finalUrl: currentUrl, statusCode: response.statusCode });
                }
              });
              
              request.on('error', (err) => {
                  console.error('Net request error:', err);
                  // "Redirect was cancelled" can happen if network error or CORS? 
                  // Or if the request was aborted.
                  reject(err);
              });

              // Add headers if needed? User-Agent?
              // request.setHeader('User-Agent', 'Electron');
              
              request.end();
          } catch (e) {
              reject(e);
          }
        });

        if (result.redirect) {
          currentUrl = result.nextUrl;
          loopCount++;
        } else {
          // Final destination reached
          if (result.statusCode >= 200 && result.statusCode < 500) {
             // Accept 2xx, 4xx (e.g. 401 Unauthorized is a valid server response)
             return currentUrl;
          } else {
             throw new Error(`Failed with status ${result.statusCode}`);
          }
        }
      }
      throw new Error('Too many redirects');
    } catch (err) {
      console.error('Resolve redirect failed:', err);
      // If resolution fails, return original to let frontend try (or throw)
      return initialUrl;
    }
  });

  // IPC: Clear Cache
  ipcMain.handle('clear-cache', async () => {
    return { success: true };
  });

  // IPC: Get Cache Size
  ipcMain.handle('get-cache-size', async () => {
    return 0;
  });

  // IPC: Open External Link
  ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
  });

  // IPC: Get App Version
  ipcMain.handle('get-version', async () => {
    return app.getVersion();
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});


