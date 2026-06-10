// 后台服务脚本 - 监听书签打开事件并记录次数

const STORAGE_KEY = 'bookmarkClickCounts';

// 获取所有点击次数数据
async function getClickCounts() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

// 保存点击次数数据
async function saveClickCounts(counts) {
  await chrome.storage.local.set({ [STORAGE_KEY]: counts });
}

// 记录一次点击
async function recordClick(url) {
  const counts = await getClickCounts();
  counts[url] = (counts[url] || 0) + 1;
  await saveClickCounts(counts);
}

// 清除所有记录
async function clearAllCounts() {
  await chrome.storage.local.remove(STORAGE_KEY);
}

// 获取所有书签的 URL 集合（用于快速匹配）
async function getAllBookmarkUrls() {
  const urls = new Set();

  function traverse(node) {
    if (node.url) {
      urls.add(node.url);
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  }

  const tree = await chrome.bookmarks.getTree();
  tree.forEach(traverse);
  return urls;
}

let bookmarkUrlsCache = new Set();
let cacheTime = 0;
const CACHE_TTL = 30000; // 缓存 30 秒

// 获取书签 URL 缓存
async function getBookmarkUrlsCached() {
  const now = Date.now();
  if (now - cacheTime > CACHE_TTL) {
    bookmarkUrlsCache = await getAllBookmarkUrls();
    cacheTime = now;
  }
  return bookmarkUrlsCache;
}

// 监听标签页 URL 变化，检测是否打开了书签页面
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const urls = await getBookmarkUrlsCached();
    if (urls.has(tab.url)) {
      await recordClick(tab.url);
    }
  }
});

// 监听书签变化，清除缓存
chrome.bookmarks.onCreated.addListener(() => { cacheTime = 0; });
chrome.bookmarks.onRemoved.addListener(() => { cacheTime = 0; });
chrome.bookmarks.onChanged.addListener(() => { cacheTime = 0; });
chrome.bookmarks.onMoved.addListener(() => { cacheTime = 0; });

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'RECORD_CLICK':
      recordClick(request.url).then(() => sendResponse({ success: true }));
      return true;

    case 'GET_COUNTS':
      getClickCounts().then(counts => sendResponse(counts));
      return true;

    case 'CLEAR_ALL':
      clearAllCounts().then(() => {
        cacheTime = 0;
        sendResponse({ success: true });
      });
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});