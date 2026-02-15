const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');
const axios = require('axios');

// Cache configuration
const MAX_CACHE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB limit for desktop
const MAX_FILES = 50; // 50 files limit

// Get cache directory
function getCacheDir() {
  return path.join(app.getPath('userData'), 'media_cache');
}

// Calculate total cache size and get file list
async function getCacheStats() {
  const cacheDir = getCacheDir();
  if (!await fs.pathExists(cacheDir)) {
    return { size: 0, files: [] };
  }

  const files = await fs.readdir(cacheDir);
  const fileStats = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(cacheDir, file);
      try {
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          mtime: stats.mtime
        };
      } catch (e) {
        return null;
      }
    })
  );

  const validFiles = fileStats.filter(f => f !== null);
  const totalSize = validFiles.reduce((acc, file) => acc + file.size, 0);

  return {
    size: totalSize,
    files: validFiles
  };
}

// Ensure cache is within limits (LRU policy)
async function ensureCacheLimits() {
  try {
    const { size, files } = await getCacheStats();
    
    if (size > MAX_CACHE_SIZE_BYTES || files.length > MAX_FILES) {
      console.log(`Cache stats: Size=${(size / 1024 / 1024).toFixed(2)} MB (Limit: 2GB), Files=${files.length} (Limit: 50). Cleaning up...`);
      
      // Sort by modification time (oldest first)
      files.sort((a, b) => a.mtime - b.mtime);
      
      let currentSize = size;
      const filesToDelete = [];
      
      // First, remove files if count exceeds limit
      if (files.length > MAX_FILES) {
        const countToDelete = files.length - MAX_FILES;
        const deletedByCount = files.splice(0, countToDelete);
        filesToDelete.push(...deletedByCount);
        // Update size after removing by count
        deletedByCount.forEach(f => currentSize -= f.size);
      }

      // Then, remove files if size exceeds limit
      for (const file of files) {
        if (currentSize <= MAX_CACHE_SIZE_BYTES) break;
        filesToDelete.push(file);
        currentSize -= file.size;
      }
      
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
      }
      
      console.log(`Deleted ${filesToDelete.length} files to free up space.`);
    }
  } catch (err) {
    console.error('Cache cleanup failed:', err);
  }
}

// Clear all cache
async function clearCache() {
  const cacheDir = getCacheDir();
  try {
    await fs.emptyDir(cacheDir);
    console.log('Cache cleared successfully.');
    return true;
  } catch (err) {
    console.error('Failed to clear cache:', err);
    return false;
  }
}

module.exports = {
  getCacheDir,
  ensureCacheLimits,
  clearCache,
  getCacheStats,
  downloadToCache,
  isCached
};

// Download file to cache
async function downloadToCache(url, fileName, onProgress, isCover = false) {
  const cacheDir = getCacheDir();
  await fs.ensureDir(cacheDir);
  const filePath = path.join(cacheDir, fileName);
  const tempPath = filePath + '.tmp';
  
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      // Allow self-signed certs
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
      headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.ximalaya.com/', 
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      // Increase timeout for slow connections
      timeout: 30000 
    });
    
    // Check for valid content type
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('text/html')) {
        throw new Error('Invalid content type: text/html (likely an error page)');
    }
    
    // Handle Ximalaya's special image URLs or similar that might have query params causing extension issues
    // We already use a fixed filename 'cover_{bookId}' so query params in URL don't affect storage name.
    
    if (isCover) {
        // Strict check for images if it is a cover
        // Add 'binary/octet-stream' or other variants just in case
        if (contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream' && contentType !== 'binary/octet-stream') {
             throw new Error(`Invalid content type for cover: ${contentType}`);
        }
    } else {
        // Strict check for audio if it is a chapter
        // Relaxed check: audio/ or application/octet-stream (sometimes servers are dumb)
        if (contentType && !contentType.startsWith('audio/') && !contentType.startsWith('application/octet-stream') && !contentType.startsWith('video/')) {
             // throw new Error(`Invalid content type for audio: ${contentType}`);
             // Warn only?
        }
    }

    const totalLength = response.headers['content-length'];
    
    const writer = fs.createWriteStream(tempPath);
    
    let downloaded = 0;
    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      if (onProgress && totalLength) {
        onProgress(Math.round((downloaded / totalLength) * 100));
      }
      writer.write(chunk);
    });
    
    return new Promise((resolve, reject) => {
      response.data.on('end', async () => {
        // Wait for writer to finish
        writer.end();
      });

      writer.on('finish', async () => {
         try {
            await fs.move(tempPath, filePath, { overwrite: true });
            ensureCacheLimits().catch(console.error); // Async cleanup
            resolve(filePath);
         } catch (e) {
            reject(e);
         }
      });
      
      response.data.on('error', (err) => {
        writer.close();
        fs.unlink(tempPath).catch(() => {});
        reject(err);
      });
      
      writer.on('error', (err) => {
         writer.close();
         fs.unlink(tempPath).catch(() => {});
         reject(err);
      });
    });
  } catch (err) {
    throw err;
  }
}

// Check if file is cached
async function isCached(fileName) {
  const filePath = path.join(getCacheDir(), fileName);
  return await fs.pathExists(filePath);
}
