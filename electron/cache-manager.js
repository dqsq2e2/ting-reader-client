const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

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
  getCacheStats
};
