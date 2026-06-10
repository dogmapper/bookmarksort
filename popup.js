// 弹出页面逻辑 - 按打开次数排序显示收藏夹书签

document.addEventListener('DOMContentLoaded', async () => {
  await loadAndRenderBookmarks();
});

// DOM 元素
const bookmarkList = document.getElementById('bookmarkList');
const totalCount = document.getElementById('totalCount');
const sortOrder = document.getElementById('sortOrder');
const refreshBtn = document.getElementById('refreshBtn');
const clearAllBtn = document.getElementById('clearAllBtn');

// 事件监听
sortOrder.addEventListener('change', loadAndRenderBookmarks);
refreshBtn.addEventListener('click', loadAndRenderBookmarks);
clearAllBtn.addEventListener('click', handleClearAll);

// 获取所有书签（扁平化）
async function getAllBookmarks() {
  const bookmarks = [];

  function traverse(nodes, folderName) {
    for (const node of nodes) {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          title: node.title || '(无标题)',
          url: node.url,
          folder: folderName || '根目录'
        });
      }
      if (node.children) {
        traverse(node.children, node.title || folderName);
      }
    }
  }

  const tree = await chrome.bookmarks.getTree();
  // 跳过根节点，直接从书签栏和其他书签开始
  for (const root of tree) {
    if (root.children) {
      for (const child of root.children) {
        if (child.children) {
          traverse(child.children, child.title);
        }
      }
    }
  }

  return bookmarks;
}

// 获取点击次数
async function getClickCounts() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_COUNTS' }, (response) => {
      resolve(response || {});
    });
  });
}

// 加载并渲染书签
async function loadAndRenderBookmarks() {
  bookmarkList.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const [bookmarks, clickCounts] = await Promise.all([
      getAllBookmarks(),
      getClickCounts()
    ]);

    // 附加点击次数并排序
    const sorted = bookmarks.map(b => ({
      ...b,
      count: clickCounts[b.url] || 0
    }));

    const order = sortOrder.value;
    sorted.sort((a, b) => {
      return order === 'desc' ? b.count - a.count : a.count - b.count;
    });

    totalCount.textContent = sorted.length;
    renderBookmarkList(sorted);
  } catch (err) {
    bookmarkList.innerHTML = `<div class="empty">加载失败: ${err.message}</div>`;
  }
}

// 渲染书签列表
function renderBookmarkList(bookmarks) {
  if (bookmarks.length === 0) {
    bookmarkList.innerHTML = '<div class="empty">暂无书签</div>';
    return;
  }

  let html = '';
  let currentFolder = '';

  bookmarks.forEach((bookmark, index) => {
    // 按文件夹分组显示
    const folderName = bookmark.folder || '未分类';
    if (folderName !== currentFolder) {
      currentFolder = folderName;
      html += `<div class="folder-title">📁 ${escapeHtml(currentFolder)}</div>`;
    }

    // 排名样式
    let rankClass = 'rank-other';
    if (bookmark.count > 0) {
      if (index === 0) rankClass = 'rank-1';
      else if (index === 1) rankClass = 'rank-2';
      else if (index === 2) rankClass = 'rank-3';
    }

    // 获取 hostname 作为图标
    const hostname = getHostname(bookmark.url);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;

    html += `
      <div class="bookmark-item"
           data-url="${escapeHtml(bookmark.url)}"
           title="${escapeHtml(bookmark.title)}\n${escapeHtml(bookmark.url)}\n打开次数: ${bookmark.count}">
        <span class="bookmark-rank ${rankClass}">${index + 1}</span>
        <img class="bookmark-favicon" src="${faviconUrl}" width="16" height="16"
             style="flex-shrink:0;border-radius:2px;"
             onerror="this.style.display='none'">
        <div class="bookmark-info">
          <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
          <div class="bookmark-url">${escapeHtml(bookmark.url)}</div>
        </div>
        <div class="bookmark-count">
          <span class="count-badge ${bookmark.count === 0 ? 'zero' : ''}">${bookmark.count}次</span>
        </div>
      </div>`;
  });

  bookmarkList.innerHTML = html;

  // 绑定点击事件
  bookmarkList.querySelectorAll('.bookmark-item').forEach(item => {
    item.addEventListener('click', handleBookmarkClick);
  });
}

// 处理书签点击
function handleBookmarkClick(e) {
  const url = this.dataset.url;
  if (!url) return;

  // 记录点击
  chrome.runtime.sendMessage({ type: 'RECORD_CLICK', url });

  // 打开书签
  chrome.tabs.create({ url, active: true });
}

// 处理清除所有记录
async function handleClearAll() {
  const confirmed = confirm('确定要清除所有打开次数记录吗？此操作不可撤销。');
  if (!confirmed) return;

  await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, resolve);
  });

  await loadAndRenderBookmarks();
}

// 工具函数 - 提取 hostname
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// 工具函数 - HTML 转义
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}