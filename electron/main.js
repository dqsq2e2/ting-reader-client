const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const cacheManager = require('./cache-manager');

let mainWindow;

const isDev = process.env.NODE_ENV === 'development';

// Register privileged schemes for ting protocol
protocol.registerSchemesAsPrivileged([
  { scheme: 'ting', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'icon.png')
  });

  // Hide the default menu
  mainWindow.setMenu(null);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Load local file
    // Ensure frontend is built to resources/frontend
    mainWindow.loadFile(path.join(__dirname, '../resources/frontend/index.html'));
  }
}

app.whenReady().then(() => {
  // IPC: Resolve URL (follow redirects)
  ipcMain.handle('resolve-url', async (event, targetUrl) => {
    return new Promise((resolve, reject) => {
      const request = net.request({ url: targetUrl, redirect: 'follow' });
      request.on('response', (response) => {
        // In electron net module, getting the final URL is tricky if it followed redirects automatically.
        // However, usually the response object might contain the final URL or we trust the input if it works.
        // If we want to strictly find the final URL, we might need manual redirect handling.
        // But for "302 redirect to new server", usually the Location header is what we want.
        // Let's assume if status is 200, the URL is good.
        // If we want to capture the *last* 302 location, we must use redirect: 'manual'.
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
    let currentUrl = initialUrl;
    let loopCount = 0;
    const maxRedirects = 10;

    try {
      while (loopCount < maxRedirects) {
        const result = await new Promise((resolve, reject) => {
          const request = net.request({ url: currentUrl, redirect: 'manual' });
          request.on('response', (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers['location']) {
              let newLocation = response.headers['location'];
              if (Array.isArray(newLocation)) newLocation = newLocation[0];
              // Handle relative URLs
              const nextUrl = new URL(newLocation, currentUrl).toString();
              resolve({ redirect: true, nextUrl });
            } else {
              resolve({ redirect: false, finalUrl: currentUrl, statusCode: response.statusCode });
            }
          });
          request.on('error', reject);
          request.end();
        });

        if (result.redirect) {
          currentUrl = result.nextUrl;
          loopCount++;
        } else {
          if (result.statusCode >= 200 && result.statusCode < 300) {
             return currentUrl;
          } else {
             // It might be a valid URL but returns 401 (Auth required) or 404.
             // If 401, the URL is likely correct, just needs auth.
             if (result.statusCode === 401) return currentUrl;
             throw new Error(`Failed with status ${result.statusCode}`);
          }
        }
      }
      throw new Error('Too many redirects');
    } catch (err) {
      console.error('Resolve redirect failed:', err);
      throw err;
    }
  });

  // IPC: Clear Cache
  ipcMain.handle('clear-cache', async () => {
    return await cacheManager.clearCache();
  });

  // IPC: Get Cache Size
  ipcMain.handle('get-cache-size', async () => {
    const stats = await cacheManager.getCacheStats();
    return stats.size;
  });

  // Protocol: ting://stream/<chapterId>?token=...&remote=...
  protocol.handle('ting', async (request) => {
    const url = new URL(request.url);
    const action = url.hostname; // 'stream'

    if (action === 'stream') {
      const chapterId = url.pathname.replace(/^\//, ''); // /123 -> 123
      const token = url.searchParams.get('token');
      const remoteBase = url.searchParams.get('remote');
      
      if (!remoteBase || !chapterId) {
        return new Response('Invalid parameters', { status: 400 });
      }

      // Ensure cache limits before writing (async check)
      cacheManager.ensureCacheLimits().catch(err => console.error('Cache limit check failed:', err));

      // Cache directory
      const cacheDir = cacheManager.getCacheDir();
      await fs.ensureDir(cacheDir);
      
      // Filename based on chapterId (and maybe server to avoid collisions?)
      // Use hash of remoteBase + chapterId to be safe
      const fileHash = crypto.createHash('md5').update(`${remoteBase}-${chapterId}`).digest('hex');
      const cacheFilePath = path.join(cacheDir, `${fileHash}.mp3`); // Assume mp3 for now, or detect mime
      
      // Check if exists
      if (await fs.pathExists(cacheFilePath)) {
        const stats = await fs.stat(cacheFilePath);
        // Basic integrity check: if size is 0, delete it
        if (stats.size === 0) {
            console.log('Cache file empty, deleting:', cacheFilePath);
            await fs.unlink(cacheFilePath);
        } else {
            console.log('Serving from cache:', cacheFilePath);
            const fileUrl = 'file:///' + cacheFilePath.replace(/\\/g, '/');
            
            // Handle range requests if present in original request
            const rangeHeader = request.headers.get('Range');
            if (rangeHeader) {
                // net.fetch(file://) usually handles range if we pass the header?
                // But for file:// protocol, Electron/Chromium might handle it automatically if we just return the file URL fetch.
                // However, let's ensure we pass headers.
                return net.fetch(fileUrl, {
                    headers: { 'Range': rangeHeader }
                });
            }
            
            return net.fetch(fileUrl);
        }
      }

      // Not in cache, fetch from remote
      const remoteUrl = `${remoteBase}/api/stream/${chapterId}`;
      console.log('Fetching remote:', remoteUrl);
      
      // We need to fetch, stream response to frontend, AND pipe to file.
      // Using net.request is node-stream based. 
      // Using global fetch (if available in main process Node 18+) or net.fetch (Electron)
      
      try {
        // Handle 302 redirects manually for the audio stream if needed?
        // net.fetch should follow redirects by default.
        // But if remoteUrl is a 302 to a signed URL (e.g. S3), it should work.
        
        // Use session to share cookies if needed (though we use token)
        const response = await net.fetch(remoteUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error(`Stream fetch failed: ${response.status} ${response.statusText}`);
            return response;
        }

        // Clone response to split streams?
        // Response body is a ReadableStream.
        const [stream1, stream2] = response.body.tee();
        
        // Stream 2 goes to file
        // IMPORTANT: We must handle errors during writing to avoid partial corrupt files being marked as valid.
        // If writing fails or is incomplete, we should delete the file.
        saveStreamToFile(stream2, cacheFilePath).catch(async err => {
            console.error('Cache write failed:', err);
            // Try to delete partial file
            try { await fs.unlink(cacheFilePath); } catch (e) {}
        });

        // Stream 1 goes to frontend
        // We need to support Range requests for seeking?
        // If we are streaming from net.fetch, it might not support range requests easily unless we proxy them.
        // However, standard HTML5 audio usually handles non-range streams by buffering.
        // But seeking might be limited until fully downloaded.
        // For 'ting://' protocol, Electron might handle it.
        return new Response(stream1, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText
        });

      } catch (err) {
        console.error('Stream fetch failed:', err);
        return new Response('Fetch failed', { status: 500 });
      }
    }

    return new Response('Not found', { status: 404 });
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Helper to save Web ReadableStream to file
async function saveStreamToFile(stream, filePath) {
    const reader = stream.getReader();
    // Use a temporary file first
    const tempPath = filePath + '.tmp';
    const fileStream = fs.createWriteStream(tempPath);
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fileStream.write(value);
        }
        fileStream.end();
        
        // Only rename to final path if successful
        await fs.move(tempPath, filePath, { overwrite: true });
    } catch (err) {
        // Cleanup temp file
        fileStream.destroy();
        try { await fs.unlink(tempPath); } catch (e) {}
        throw err;
    } finally {
        reader.releaseLock();
    }
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});


