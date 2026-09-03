const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');

const app = express();
app.use(cors()); // 允许你的前端页面（不同域名）来访问这个接口

const parser = new Parser({
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AITradeBot/1.0)' },
  timeout: 10000,
});

// ===== 在这里维护你的新闻源列表 =====
// 每加一个权威媒体，就在这个数组里加一行，其余代码不用改
const FEED_SOURCES = [
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name: 'WSJ Markets', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain' },
  { name: 'Investing.com', url: 'https://www.investing.com/rss/news.rss' },
  { name: 'Fortune', url: 'https://fortune.com/feed/fortune-feeds/?id=3230629' },
  { name: 'Wolf Street', url: 'https://wolfstreet.com/feed' },
  { name: 'Fox Business', url: 'https://moxie.foxbusiness.com/google-publisher/latest.xml' },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html' }, // 可能会因反爬失败，失败不影响其余源，正常现象
];

let newsCache = [];       // 内存缓存，接口直接读这个，不用每次请求都现抓
let lastFetchTime = null;
let lastFetchErrors = []; // 记录哪些源这次抓取失败了，方便排查

async function fetchAllFeeds() {
  const results = await Promise.allSettled(
    FEED_SOURCES.map(async (src) => {
      const feed = await parser.parseURL(src.url);
      return feed.items.map((item) => ({
        id: item.guid || item.link,
        source: src.name,
        title: item.title,
        link: item.link,
        pubDate: new Date(item.pubDate || item.isoDate || Date.now()),
      }));
    })
  );

  lastFetchErrors = [];
  const merged = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      merged.push(...r.value);
    } else {
      lastFetchErrors.push({ source: FEED_SOURCES[i].name, error: r.reason.message });
      console.error(`[news] ${FEED_SOURCES[i].name} 抓取失败:`, r.reason.message);
    }
  });

  const seen = new Set();
  newsCache = merged
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, 50);

  lastFetchTime = new Date();
  console.log(`[news] 刷新完成，共 ${newsCache.length} 条，失败源：${lastFetchErrors.length}`);
}

// 启动时先抓一次，之后每2分钟刷新一次缓存
fetchAllFeeds();
setInterval(fetchAllFeeds, 2 * 60 * 1000);

// ===== 对外接口 =====

// 健康检查：部署完之后用浏览器打开你的网址，能看到这个说明服务活着
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'aitrade-news-backend' });
});

// 前端真正要用的接口
app.get('/api/news/latest', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({
    updatedAt: lastFetchTime,
    sources: FEED_SOURCES.map(s => s.name),
    errors: lastFetchErrors,
    items: newsCache.slice(0, limit),
  });
});

const PORT = process.env.PORT || 3000; // 云平台会自动分配端口，本地跑就用3000
app.listen(PORT, () => {
  console.log(`AITrade news backend running on port ${PORT}`);
});
