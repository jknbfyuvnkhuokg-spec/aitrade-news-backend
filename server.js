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
  { name: 'Marginal Revolution', url: 'https://marginalrevolution.com/feed' },
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Fast Company', url: 'https://www.fastcompany.com/latest/rss' },
  { name: 'NYT Business', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml' },
  { name: 'NPR Business', url: 'https://feeds.npr.org/1006/rss.xml' }, // NPR近期按地区限制RSS访问，能不能通取决于Render服务器所在地区
  { name: 'NPR Economy', url: 'https://feeds.npr.org/1017/rss.xml' }, // 同上，地区限制风险
  { name: 'Benzinga', url: 'https://feeds.benzinga.com/benzinga' },
  { name: 'PR Newswire', url: 'https://www.prnewswire.com/rss/news-releases-list.rss' }, // 全类型新闻稿总源，量很大但不是财经专属，会混入非财经内容
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' }, // 官方源，本身就聚合了Motley Fool/MarketBeat/Insider Monkey等多家内容，量很大
];

let newsCache = [];       // 内存缓存，接口直接读这个，不用每次请求都现抓
let lastFetchTime = null;
let lastFetchErrors = []; // 记录哪些源这次抓取失败了，方便排查

// 按时间排序，但限制同一个源最多连续出现 N 条，避免更新特别快的源霸屏，
// 同时不会像严格轮流制那样把慢源强行插到快源前面、拖慢整体新鲜度
function diversify(pool, maxConsecutive = 2) {
  const waiting = [...pool];
  const result = [];
  let lastSource = null, streak = 0;
  while (waiting.length) {
    let idx = waiting.findIndex((it) => !(it.source === lastSource && streak >= maxConsecutive));
    if (idx === -1) idx = 0; // 剩下的全是同一个源了（比如别的源暂时没新内容），只能放行
    const item = waiting.splice(idx, 1)[0];
    if (item.source === lastSource) streak++; else { lastSource = item.source; streak = 1; }
    result.push(item);
  }
  return result;
}

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
  const seen = new Set();
  let pool = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      pool.push(...r.value.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }));
    } else {
      lastFetchErrors.push({ source: FEED_SOURCES[i].name, error: r.reason.message });
      console.error(`[news] ${FEED_SOURCES[i].name} 抓取失败:`, r.reason.message);
    }
  });

  pool.sort((a, b) => b.pubDate - a.pubDate); // 先按真实发布时间排，保证新鲜度优先
  newsCache = diversify(pool, 2).slice(0, 50); // 再限制同源连续出现次数，避免霸屏

  lastFetchTime = new Date();
  console.log(`[news] 刷新完成，共 ${newsCache.length} 条，失败源：${lastFetchErrors.length}`);
}

// 启动时先抓一次，之后每60秒刷新一次缓存（贴合1-3分钟的新鲜度目标）
fetchAllFeeds();
setInterval(fetchAllFeeds, 60 * 1000);

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
