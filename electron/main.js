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
    return await cacheManager.clearCache();
  });

  // IPC: Get Cache Size
  ipcMain.handle('get-cache-size', async () => {
    const stats = await cacheManager.getCacheStats();
    return stats.size;
  });

  // IPC: Download Chapter
  ipcMain.handle('download-chapter', async (event, { url, fileName, taskId }) => {
    try {
      await cacheManager.downloadToCache(url, fileName, (progress) => {
        if (!event.sender.isDestroyed()) {
             event.sender.send('download-progress', { taskId, progress });
        }
      });
      return { success: true };
    } catch (err) {
      console.error('Download failed:', err);
      return { success: false, error: err.message };
    }
  });

  // IPC: Download Cover
  ipcMain.handle('download-cover', async (event, { url, bookId, force }) => {
    try {
      // Simple filename strategy: cover_{bookId}
      const fileName = `cover_${bookId}`;
      
      // Check if exists first to avoid re-downloading, unless forced
      if (!force && await cacheManager.isCached(fileName)) {
          return { success: true, cached: true };
      }

      await cacheManager.downloadToCache(url, fileName, null, true); // isCover = true
      return { success: true };
    } catch (err) {
      console.error('Cover download failed:', err);
      // Don't fail the whole task if cover fails
      return { success: false, error: err.message };
    }
  });

  // IPC: Check Cached
  ipcMain.handle('check-cached', async (event, fileNames) => {
    const results = {};
    for (const name of fileNames) {
      results[name] = await cacheManager.isCached(name);
    }
    return results;
  });

  // IPC: Remove Cached File
  ipcMain.handle('remove-cached-file', async (event, fileName) => {
    try {
      const cacheDir = cacheManager.getCacheDir();
      const filePath = path.join(cacheDir, fileName);
      if (await fs.pathExists(filePath)) {
        await fs.unlink(filePath);
        return { success: true };
      }
      // Also check if it's a cover file (no extension potentially or with prefix)
      // Actually 'fileName' passed here is usually just chapterId or full name?
      // Frontend passes `task.chapterId + '.mp3'` usually.
      
      return { success: false, error: 'File not found' };
    } catch (err) {
      console.error('Remove cached file failed:', err);
      return { success: false, error: err.message };
    }
  });

  // IPC: List Cached Files
  ipcMain.handle('list-cached-files', async () => {
    try {
      const cacheDir = cacheManager.getCacheDir();
      if (!await fs.pathExists(cacheDir)) return [];
      
      const files = await fs.readdir(cacheDir);
      const fileDetails = await Promise.all(
        files.filter(f => f.endsWith('.mp3')).map(async (name) => {
          const filePath = path.join(cacheDir, name);
          const stats = await fs.stat(filePath);
          return { 
            name, 
            path: filePath, 
            size: stats.size, 
            mtime: stats.mtime 
          };
        })
      );
      // Sort by newest first
      fileDetails.sort((a, b) => b.mtime - a.mtime);
      return fileDetails;
    } catch (err) {
      console.error('List cached files failed:', err);
      return [];
    }
  });

  // Protocol: ting://stream/<chapterId> or ting://cover/<bookId>
  protocol.handle('ting', async (request) => {
    const url = new URL(request.url);
    const action = url.hostname; // 'stream' or 'cover'

    if (action === 'stream') {
      const chapterId = url.pathname.replace(/^\//, ''); // /123 -> 123
      const token = url.searchParams.get('token');
      const remoteBase = url.searchParams.get('remote');
      // Pass a flag 'cache=0' to skip caching
      const shouldCache = url.searchParams.get('cache') !== '0'; 
      
      if (!remoteBase || !chapterId) {
        return new Response('Invalid parameters', { status: 400 });
      }

      // Ensure cache limits before writing (async check)
      if (shouldCache) {
        cacheManager.ensureCacheLimits().catch(err => console.error('Cache limit check failed:', err));
      }

      // Cache directory
      const cacheDir = cacheManager.getCacheDir();
      await fs.ensureDir(cacheDir);
      
      // Filename based on chapterId
      // We prioritize the explicit filename format used by download-chapter: ${chapterId}.mp3
      const cacheFileName = `${chapterId}.mp3`;
      const cacheFilePath = path.join(cacheDir, cacheFileName); 
      
      // Fallback to hash if needed (legacy)? No, let's stick to one standard.
      // const fileHash = crypto.createHash('md5').update(`${remoteBase}-${chapterId}`).digest('hex');
      // const cacheFilePath = path.join(cacheDir, `${fileHash}.mp3`); 
      
      // Check if exists
      if (await fs.pathExists(cacheFilePath)) {
         // ... (existing serving logic) ...
         const stats = await fs.stat(cacheFilePath);
         if (stats.size === 0) {
            console.log(`Found empty cache file ${cacheFilePath}, deleting.`);
            await fs.unlink(cacheFilePath);
         } else {
            console.log('Serving from cache:', cacheFilePath);
            const fileUrl = require('url').pathToFileURL(cacheFilePath).href;
            const rangeHeader = request.headers.get('Range');
            
            // Handle Range requests for audio
            if (rangeHeader) {
                const parts = rangeHeader.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
                const chunksize = (end - start) + 1;
                const fileStream = fs.createReadStream(cacheFilePath, { start, end });
                const readable = new ReadableStream({
                    start(controller) {
                        fileStream.on('data', chunk => { try { controller.enqueue(chunk); } catch (e) {} });
                        fileStream.on('end', () => { try { controller.close(); } catch (e) {} });
                        fileStream.on('error', err => { try { controller.error(err); } catch (e) {} });
                    },
                    cancel() { fileStream.destroy(); }
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
            
            // Non-range request (e.g. cover or full audio load)
            const response = await net.fetch(fileUrl);
            const headers = new Headers(response.headers);
             
            if (action === 'stream') {
                 if (!headers.has('content-type') || headers.get('content-type') === 'application/octet-stream') {
                      headers.set('content-type', 'audio/mpeg');
                 }
            }
            
            return new Response(response.body, {
                status: response.status,
                headers: headers
            });
         }
      }

      // Not in cache, fetch from remote
      const remoteUrl = `${remoteBase}/api/stream/${chapterId}`;
      console.log('Fetching remote:', remoteUrl);
      
      try {
        const fetchHeaders = { 
          'Authorization': `Bearer ${token}` 
        };

        // Pass Range header if present
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
          fetchHeaders['Range'] = rangeHeader;
        }

        const response = await net.fetch(remoteUrl, {
            headers: fetchHeaders
        });

        if (!response.ok) {
            console.log(`Remote fetch failed: ${response.status} ${response.statusText}`);
            return response;
        }

        // Clone response to split streams?
        // Only cache if NO Range header was sent (i.e. full download)
        // If Range header was sent, we are getting a partial content, so we cannot cache it as a full file.
        if (shouldCache && !rangeHeader) {
            const [stream1, stream2] = response.body.tee();
            
            // Stream 2 goes to file
            saveStreamToFile(stream2, cacheFilePath).catch(async err => {
                console.error('Cache write failed:', err);
            });

            return new Response(stream1, {
                headers: response.headers,
                status: response.status,
                statusText: response.statusText
            });
        } else {
            // No caching (or partial content), just pass through
            return new Response(response.body, {
                headers: response.headers,
                status: response.status,
                statusText: response.statusText
            });
        }

      } catch (err) {
        console.error('Stream fetch failed:', err);
        return new Response('Fetch failed', { status: 500 });
      }
    } else if (action === 'cover') {
        const bookId = url.pathname.replace(/^\//, '');
        const remoteUrl = url.searchParams.get('remote');
        // We might not have token here if it's embedded in remoteUrl or not needed for covers
        // But if needed, we should pass it.
        
        if (!bookId) return new Response('Invalid bookId', { status: 400 });

        const cacheDir = cacheManager.getCacheDir();
        const cacheFilePath = path.join(cacheDir, `cover_${bookId}`);

        // 1. Try Local Cache
        if (await fs.pathExists(cacheFilePath)) {
            const fileUrl = require('url').pathToFileURL(cacheFilePath).href;
            
            // Explicitly set MIME type if serving from file
            // Otherwise net.fetch(file://) might guess wrong or return octet-stream
            const response = await net.fetch(fileUrl);
            
            // Override Content-Type if necessary (especially for cover images without extension)
            const headers = new Headers(response.headers);
            if (action === 'cover') {
                // If it's a cover, force image type. We don't know exact type (jpg/png), 
                // but usually browsers can sniff if we give a hint or if we just let it be?
                // Actually, without extension, file:// might not set content-type.
                // Let's assume jpeg or try to detect?
                // Safe bet: image/jpeg or image/png.
                // Or better: don't touch if it has one.
                if (!headers.has('content-type') || headers.get('content-type') === 'application/octet-stream') {
                     headers.set('content-type', 'image/jpeg'); 
                }
            } else if (action === 'stream') {
                if (!headers.has('content-type') || headers.get('content-type') === 'application/octet-stream') {
                     headers.set('content-type', 'audio/mpeg');
                }
            }

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: headers
            });
        }

        // 2. Fetch Remote (and Cache)
        if (remoteUrl) {
             console.log('Fetching remote cover:', remoteUrl);
             try {
                 // Note: remoteUrl might already contain query params, take care.
                 // Add User-Agent to avoid blocking
                 // Some CDNs like Ximalaya might need specific headers or clean URL
                 const fetchOptions = {
                     headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                        'Referer': 'https://www.ximalaya.com/' 
                     }
                 };
                 
                 const response = await net.fetch(remoteUrl, fetchOptions);
                 
                 if (response.ok) {
                     const [stream1, stream2] = response.body.tee();
                     
                     // We must await saving here if we want to guarantee cache existence for subsequent offline access?
                     // No, tee() allows parallel consumption. But 'saveStreamToFile' is async.
                     // The issue might be that 'ting://' protocol handler finishes before stream is fully written if we just return stream1?
                     // No, stream1 is piped to renderer. Stream2 is piped to file.
                     
                     saveStreamToFile(stream2, cacheFilePath).catch(err => {
                         console.error('Cover cache write failed:', err);
                     });
                     
                     // Handle image/png (or others) explicitly if needed?
                     // If the remote sends Content-Type: image/png, stream1 will have it?
                     // net.fetch response headers should be preserved.
                     
                     return new Response(stream1, {
                         headers: response.headers,
                         status: response.status
                     });
                 } else {
                     console.error(`Cover fetch failed with status: ${response.status}`);
                 }
             } catch (err) {
                 console.error('Cover fetch failed:', err);
             }
        }
        
        return new Response('Cover not found', { status: 404 });
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


