# AITrade News Backend

多源RSS聚合服务，供AITrade前端拉取真实新闻。

## 本地测试（可选，需要你电脑装了Node.js）
```
npm install
npm start
```
然后浏览器打开 http://localhost:3000/api/news/latest 应该能看到JSON格式的新闻列表。

## 部署到 Render
见聊天里的详细步骤。核心是三件事：
1. 这个文件夹上传到 GitHub 仓库
2. Render 里新建 Web Service，连上这个仓库
3. Build Command 填 `npm install`，Start Command 填 `npm start`

## 加新的新闻源
打开 server.js，在 FEED_SOURCES 数组里加一行 `{ name: '媒体名', url: 'RSS地址' }` 即可，其余代码不用动。
