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
            const fileUrl = require('url').pathToFileURL(cacheFilePath).href;
            
            // Handle range requests if present in original request
            const rangeHeader = request.headers.get('Range');
            
            // IMPORTANT: If client requests Range, we MUST return 206 Partial Content
            // net.fetch(file://) usually handles this, BUT we need to make sure 
            // the response headers are correctly passed back to the audio element.
            // Sometimes net.fetch returns 200 OK for file:// even with Range header, 
            // which confuses the audio element if it expects 206.
            
            // Let's manually handle file serving for maximum compatibility with audio seeking
            if (rangeHeader) {
                const parts = rangeHeader.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
                const chunksize = (end - start) + 1;
                
                console.log(`Serving Range: ${start}-${end} (Chunk: ${chunksize})`);

                const fileStream = fs.createReadStream(cacheFilePath, { start, end });
                
                // Create a Web ReadableStream from Node stream
                const readable = new ReadableStream({
                    start(controller) {
                        fileStream.on('data', chunk => controller.enqueue(chunk));
                        fileStream.on('end', () => controller.close());
                        fileStream.on('error', err => controller.error(err));
                    }
                });

                return new Response(readable, {
                    status: 206,
                    headers: {
                        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunksize,
                        'Content-Type': 'audio/mpeg'
                    }
                });
            }
            
            // No range, return full file
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
            // Try to delete partial file - handled in saveStreamToFile catch block usually,
            // but just in case of async error after that?
            // saveStreamToFile handles temp file cleanup.
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


