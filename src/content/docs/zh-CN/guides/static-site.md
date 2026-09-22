---
title: 提供静态站点
h1_emoji: '🗂️'
sidebar:
  order: 2
description: 提供目录服务，带压缩、缓存头、范围请求、单页应用回退，以及一条让点开头文件保持私密的规则。
---

提供文件是 Pingclair 的另一半工作。本页从 `root` 和 `file_server` 开始，一路加上
压缩、缓存头、范围请求和单页应用所需回退，并展示每一步服务器实际返回什么。

## 🧾 开始之前

- 已经安装并运行 Pingclair（[安装](/zh-CN/start/install/)），实验期间先停掉服务：
  `sudo pc service stop`。
- 一个要提供服务的目录。示例用 `/srv/site`。

## 📁 提供目录

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

`root *` 为每个请求设置站点根目录，`file_server` 从那里提供服务。不存在的路径
返回 `404`。

## 🗜️ 压缩

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

参数按偏好顺序排列。同一个 36 KB 文本文件，用三种 `Accept-Encoding` 请求，在这套
配置上实测：

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

Brotli 在代理响应上没有实现，要求它会得到编译错误而不是静默降级：

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

消息给出了替代方案，这正是重点：要求服务器无法兑现的东西，配置根本不会运行。

## ⏳ 缓存头

`file_server` 已经会响应条件请求 —— 上面的 `ETag` 和 `Last-Modified` 就是客户端在
`If-None-Match` 或 `If-Modified-Since` 里回送的值。保存多久由你决定，而且应该写在
它成立的那些路径上：

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
`public, max-age=31536000, immutable`。只有文件名随内容变化时，immutable 才诚实，
这也正是构建工具在文件名里加哈希的原因。

范围请求不需要任何配置；请求前十个字节的客户端就能拿到它们：

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 单页应用

在浏览器里做路由的应用，需要所有未知路径都返回入口文档，同时真实文件继续正常
提供：

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

实测：`/assets/big.txt` 仍然以自己的内容返回 `200`，`/some/spa/route` 用
`index.html` 返回 `200`。没有那行 `try_files`，第二个请求就是 `404`。

## 🗂️ 目录列表

`file_server browse` 会为没有 index 文件的目录渲染列表：

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

列表会列出条目，所以 `/assets/` 会在 `Index of` 标题下显示 `big.txt`。除非这个
目录本来就该这样被读，否则不要加 `browse`。

## 🔒 隐藏文件

⚠️ 点开头的文件和其他文件一样会被提供：在上面的配置里 `.hidden` 返回了 `200`，
`.git`、`.env` 和编辑器备份就是这样跑到公网上的。要把它们挡在外面，就让响应发生
在文件服务器之前：

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

实测：`/.hidden` 返回 `404`，而 `/` 和 `/assets/big.txt` 仍然是 `200`。用 `404`
而不是 `403` 是刻意的 —— `403` 等于确认该文件存在。

## ⚠️ 出问题时

- **`Unsupported feature: 'encode br'`。** Brotli 被按名字拒绝；请用
  `encode zstd gzip`。
- **`Unknown directive 'file_server: …'`。** 该选项不存在，`validate` 会指明它
  拒绝的写法，而不是忽略它。
- **出来的是目录列表而不是页面。** 该目录没有 `index.html`，要么是你要的效果，
  要么是文件漏放了。
- **应用负责的路由返回 `404`。** 缺单页回退：`try_files {path} /index.html`。
- **重载后新页面不出现。** 重载应用的是策略，不是新的监听器；文件本身按请求读取，
  所以加文件是即时的，移动监听器不是，见
  [以服务方式运行](/zh-CN/start/service/#-重载意味着什么)。

## 🧭 下一步

- [反向代理一个应用](/zh-CN/guides/reverse-proxy/)：服务器的另一半。
- [`file_server`](/zh-CN/reference/directives/#file_server)：指令参考。
- [`try_files`](/zh-CN/reference/pingclairfile/)：回退是如何编译的。
