# Fixed-release download router

本批次只支持 **4.0.20 的三个固定附件**，不会代理附件正文、写 feed、改论坛/API、数据库、DNS、定时任务或备份策略。
Python 3 标准库服务只监听 `127.0.0.1:18781`；外部没有健康检查接口，也不记录下载请求。
R2 不健康时返回同版本、同文件名的 GitHub 302。服务故障时，三个 Nginx exact location 对 502/503/504 也直接返回固定 GitHub 302。

固定 R2 origin 是 `https://pub-250df9737586416fbd6e8cb0a843b249.r2.dev`。
附件路径为 `/lolicode/releases/4.0.20/`，配置使用发布产物的实际字节数与 SHA256，不含任何凭据。
上线之前必须由 root 先完成三个匿名 R2 全量下载与权威哈希比对；本脚本仍会在任何生产写入前重新全量校验。
运行中的短 HEAD 探测只能判断状态、字节数及存在时的对象 SHA256 metadata，**不等同于每次下载重新验签/全量哈希**。
安装包的真实签名仍由既有 Tauri updater 公钥验证。
这是下载开始前的健康选路；浏览器已跳转后的下载中途失败，不提供跨来源自动续传。

## 安装前读取的生产基线（2026-10-17）

- systemd `255.4-1ubuntu8.18`；`/usr/bin/python3` 为 `3.12.3`；18781 无监听。
- 服务目录、`/etc/lolicode-download-router.json`、同名 systemd unit 尚不存在。
- 主配置 `/etc/nginx/sites-available/lolicode.conf` SHA256：`819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75`。
- 自有 snippet `/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf` 在静态 release20-v2 完成后的实际 SHA256：`d40f1245515531566354ba2c6dda0a5a9edfb073c8e3dbe48b6951fa74cbd4c4`。
- 首页静态目录为 `/var/www/lolicode-site/releases/20261017-release20-v2`。

**本批次与 `deploy/lolicode-home/deploy-release20.py` 都会改同一个 snippet。**
两者共用维护锁，并强制核对旧哈希。任何一个先执行后，另一个必须重新读取、审查并更新其基线；禁止把旧 snippet 整体写回，禁止为了通过检查直接关闭哈希校验。
Exact locations 优先于现有 `^~ /downloads/releases/`；旧版本兼容规则保留。
不把 R2 origin 加到浏览器白名单，页面继续使用自有固定路由。

## 文件与部署准备

- `router.py`：有边界时间的健康缓存与固定 302 路由。
- `config-release20.json`：三个权威附件记录。
- `lolicode-download-router.service`：DynamicUser、只读系统、无特权、内存/任务限制；无 Node 或第三方 Python 依赖。
- `nginx-locations.conf.template`：三个 exact path，拒绝查询串及 GET/HEAD 以外的方法；不向后端传 Cookie、Authorization、客户端 IP、请求正文。
- `deploy.py`：本批次安装、只读预检、匹配本批次状态才允许回退。无法匹配时保留现场。

私有 staging 目录固定为 `/root/lolicode-download-router-20261017-v1/`。
只上传这五个部署文件以及 `manifest.json`，其中 `files` 必须恰好列出这五个文件的 SHA256：

```json
{"batch":"20261017-v1","version":"4.0.20","files":{"router.py":"…","config-release20.json":"…","lolicode-download-router.service":"…","nginx-locations.conf.template":"…","deploy.py":"…"}}
```

根管理员审查 payload 外部归档 SHA256 后，可先在 staging 上运行只读预检。该操作读取既有维护锁、验证 unit 和 Nginx 基线、确认端口空闲、全量匿名下载 R2 三附件；不写生产文件或启停服务：

```sh
python3 /root/lolicode-download-router-20261017-v1/deploy.py preflight
```

经 root 核验 R2 / GitHub 三附件并放行后，已执行以下安装命令：

```sh
python3 /root/lolicode-download-router-20261017-v1/deploy.py install
```

安装顺序是不可变 release 代码、公开无凭据配置、unit、服务启动与 loopback GET/HEAD/拒绝边界校验，最后追加三条 Nginx location 并 `nginx -t` / reload / enable。
失败只在仍匹配本批次写入内容时回退；主配置、feed 和静态页面不变。
原 snippet 和部署 receipt 留在 root 私有 staging 中，模式 0600；不可变 release 代码保留用于排查，不做递归删除。

## 发布与回退验收

放行后，先检查三个公开固定 URL 的 GET 和 HEAD：302、`Cache-Control: no-store`、Location 是匹配同附件的 R2 或 GitHub。
服务临时停止后的 GitHub 兜底应在短窗口内单独验收，结束立即恢复；本轮尚未停生产服务做故障模拟。
确认 `/`、`/all`、`/api`、原版本下载路由保持可用；两端 `latest.json` 哈希不变。然后才允许独立发布流程切新的 feed。

若需回退，必须先确认 receipt 与当前 snippet / unit / config / release 都一致：

```sh
python3 /root/lolicode-download-router-20261017-v1/deploy.py rollback
```

先恢复原 snippet 并检查/reload，再停用本批次独立服务和删除其精确 unit/config 文件。检测到并发修改即拒绝，不覆盖新静态批次或其它维护工作。

## 本批次准备验证

`python -B -m unittest discover -s deploy/download-router -p test_deploy.py -v`：14/14 离线检查通过，
只在测试自身的临时目录写文件；包括成功路径、Nginx 失败回退、并发修改保留、精确回退、payload 与 R2 哈希/固定来源边界。
生产同版本 systemd 的 `systemd-analyze verify --man=no` 返回 0；只读取自有临时 unit，检查后立即清理。
系统已有 cloudmonitor unit 的 KillMode / PIDFile 警告未改动。
生产 Nginx 二进制在自有临时配置上 `nginx -t` 通过；没有启动测试 listener 或 reload 生产。
以上不能替代正式 unit 启动、公开 GET/HEAD 与服务故障兜底验收。

## 已完成的生产安装

私有归档 SHA256 为 `71e6fc6bafad8bf3263153d68f1e59c640bcb485cfce4ec248db71c09e1d17be`，
部署脚本 SHA256 为 `43b875ac211a0083dbae60a546c24db7ee1b68ace3fd83fb52723ebb6faddf52`。
安装前又完成三附件的实际匿名全量下载与 bytes / SHA256 比对，随后启动独立 unit、
loopback GET / HEAD / 拒绝边界验收、追加三个 exact location，`nginx -t` / reload 均通过。
服务已 active / enabled，只监听 loopback。安装后 snippet SHA256 为
`4b8afdcf35a65f1a42393f865bbabf9dbe11d51046bc8305b3ccdd23d70b6c9c`；主配置 SHA256 未变。
三个公开 HEAD 均实际返回 302 到各自 R2 附件，且 `Cache-Control: no-store`。

主安装器入口：
`https://lolicode.com/downloads/releases/4.0.20/LoliCode-4.0.20-Windows-x64-Setup.exe`；
同路径加 `.sig` 为签名，便携包同目录 `LoliCode-Portable.zip`。
上线同时确认首页、社区 `/all`、API `/api` 可用；两端 latest 仍为原来的
4.0.16 / `13a7972b79ee0ea67deb582de2314602a472aa9b9a453c7a578b1ec8f07a59cc`，
此脚本没有写入任何 feed。最终更新器验收和 latest 切换由独立发布流程完成。
原 snippet 与机器验收 receipt 位于 `/root/lolicode-download-router-20261017-v1/`。
