---
title: 提供静态站点
h1_emoji: '🗂️'
sidebar:
  order: 2
description: 提供一个目录，并配置压缩、缓存头部、字节范围请求、单页应用回退，以及让点文件保持私密的规则。
---

本页提供一个文件目录：从 `root` 和 `file_server` 开始，逐步加上压缩、缓存头部、范围请求，
以及单页应用所需的回退。每一步都给出了服务器在真实主机上的响应。

📌 本页描述的是最新发布的版本 **v0.2.0-rc.3**。仅存在于服务器 `main` 分支上的变化标记为 **下一版本**。

## 🧾 开始之前

- 已安装并运行 Pingclair（[安装](/zh-CN/start/install/)），试验期间先停掉服务：`sudo pc service stop`。
- 一个要提供的目录。示例使用 `/srv/site`。

## 📁 提供一个目录

```caddyfile
http://:8080 {
    root * /srv/site
    file_server
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo systemctl restart pingclair
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Last-Modified: Tue, 22 Sep 2026 04:37:54 GMT
ETag: "5e-6ab20622"
Accept-Ranges: bytes
```

`root *` 为每个请求设置站点根目录，`file_server` 从中提供文件。不存在的路径返回 `404`。

## 🗜️ 压缩

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

`encode` 按优先顺序列出编码格式。同一个 36 KB 的文本文件，用三种不同的 `Accept-Encoding` 请求：

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

反向代理的响应尚未实现 Brotli，请求它会导致编译错误，而不是悄悄降级：

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

错误信息给出了替代方案。要求服务器做它做不到的事的配置，根本不会运行。

在 v0.2.0-rc.3 中，没有 `encode` 行的站点仍然会用 gzip 压缩；要按磁盘上的原始字节提供，请写
`encode off`。**下一版本**：和 Caddy 一样，站点只在 `encode` 要求的地方压缩，所以升级时请保留 `encode` 行。

## ⏳ 缓存头部

`file_server` 会发送 `ETag` 和 `Last-Modified`，但在 v0.2.0-rc.3 中它不处理 `If-None-Match` 或
`If-Modified-Since`：重新验证的客户端会再次下载整个文件。**下一版本**：条件请求会得到
`304 Not Modified` 或 `412 Precondition Failed`。

客户端可以把文件保留多久，是站点自己的决定，应当只写在适用的路径上：

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    header Cache-Control "public, max-age=60"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    file_server
}
```

实测：页面上是 `Cache-Control: public, max-age=60`，`/assets/*` 上是
`public, max-age=31536000, immutable`。只有当文件内容一变、文件名也随之改变时，`immutable` 才是安全的，
这就是构建工具会在资源文件名中加入内容哈希的原因。

范围请求无需任何配置；请求前十个字节的客户端就会得到这十个字节：

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 单页应用

在浏览器中做路由的应用，需要每个未知路径都返回入口文档，同时真实存在的文件仍按原样提供：

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

实测：`/assets/big.txt` 仍然返回 `200` 和它自己的内容，`/some/spa/route` 返回 `200` 和 `index.html`。
去掉 `try_files` 这一行，第二个请求就会得到 `404`。

## 🗂️ 目录列表

对于没有索引文件的目录，`file_server browse` 会显示目录列表：

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

列表会列出其中的条目：`/assets/` 在 `Index of` 标题下显示 `big.txt`。除非这个目录本来就应该被这样浏览，
否则不要开启 `browse`。

## 🔒 隐藏文件

⚠️ 点文件和其他文件一样会被提供：在上面的配置中，`.hidden` 返回了 `200`。`.git`、`.env`
和编辑器备份文件就是这样流到互联网上的。要挡住它们，就在文件服务器之前先响应这些路径：

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

实测：`/.hidden` 返回 `404`，而 `/` 和 `/assets/big.txt` 仍返回 `200`。状态码特意用 `404` 而不是
`403`：`403` 等于确认了文件存在。`/.*` 只匹配站点顶层的点文件；`file_server { hide … }`
选项则可以隐藏任意位置的路径。

## ⚠️ 出问题时

- **`Unsupported feature: 'encode br'`。** Brotli 会被点名拒绝；请使用 `encode zstd gzip`。
- **`Unknown directive 'file_server: …'`。** 该选项不存在，`validate` 会指出被拒绝的写法，而不是忽略它。
- **看到的是目录列表而不是页面。** 该目录下没有 `index.html`，这要么正是你想要的，要么是缺了文件。
- **应用自己处理的路由返回 `404`。** 缺少单页应用回退：`try_files {path} /index.html`。
- **重载后变更没有出现。** 文件是按请求读取的，所以新文件无需重载就会立即出现。
  新增或移动监听则需要重启（[以服务方式运行](/zh-CN/start/service/#-重载意味着什么)）。

## 🧭 下一步

- [反向代理一个应用](/zh-CN/guides/reverse-proxy/)：服务器的另一半功能。
- [`file_server`](/zh-CN/reference/directives/#file_server)：指令参考。
- [Pingclairfile](/zh-CN/reference/pingclairfile/)：匹配器与路由顺序。
