# Tencent 可选下载入口

2026-10-18 已部署批次 `20261018-tencent-v2`，仅开放稳定版 4.0.20 三个精确路径：

- `/downloads/tencent/4.0.20/LoliCode-4.0.20-Windows-x64-Setup.exe`
- `/downloads/tencent/4.0.20/LoliCode-4.0.20-Windows-x64-Setup.exe.sig`
- `/downloads/tencent/4.0.20/LoliCode-Portable.zip`

官网已显示腾讯安装版/便携版选项。R2/GitHub 原路由保留；稳定 feed 只追加两个可选下载字段，版本、platforms、原默认地址和签名不变。既有 4.0.21-rc.1 候选不在此线路中。

## 已验收的生产边界

CDN 为 `downloads.treasuregrove.art`，证书已绑定并通过正常 TLS 验证；当前证书到期时间 2027-01-15，需按到期计划续签。COS 保持私有回源，匿名对象访问拒绝。腾讯控制台回读日 2GB、月 20GB、月 HTTPS 100 万请求封顶，80% 告警；IP 每节点 5QPS，Type A 签名参数 sign、有效期 300 秒。平台封顶有延迟，不能保证绝对不产生额外费用。

独立服务只监听 `127.0.0.1:18782`，只接受 GET/HEAD 和上述路径，返回 no-store/no-referrer 的短期签名重定向。每 IPv4/IPv6 /64 每分钟最多签发 10 次，超限封禁 600 秒；签名链接在有效期内可复用，因此字节费用仍须由 CDN 封顶控制。

Nginx 仅在三个新 location 中从审核的 Cloudflare 网段恢复客户端 IP，覆写专用身份头，不向后端传 Cookie/Authorization/请求体。普通来源不能靠伪造身份头指定限流桶。不记录签名 URL 或客户端 IP 访问日志；内存限流身份使用进程随机盐散列。未修改社区、账户 API 或已有 R2 location。

Cloudflare 网段预检先读取官方文本列表；仅遇 HTTP 403 时使用官方公开 `https://api.cloudflare.com/client/v4/ips`。结果仍须与审核列表精确一致，否则停止。禁止绕过 TLS、放宽网段或关闭哈希检查。

## 凭据与文件

生产配置为 `/etc/lolicode-tencent-router.json`，代码目录为 `/opt/lolicode-tencent-router/releases/20261018-tencent-v2/`。示例配置继续保持 disabled/门禁 false，不包含生产凭据。不要打包 `__pycache__` 或真实配置密钥。

源密钥为 `/etc/lolicode-tencent-cdn.key`，root 私有 0600，由 systemd LoadCredential 提供给 DynamicUser 服务。程序不创建、改写或删除该源文件，不输出密钥或签名 URL，不允许放入参数、环境变量、JSON 或仓库。运行时只对准确的 systemd credential 路径和 CREDENTIALS_DIRECTORY 接受 root:root 0440 挂载；普通文件仍禁止组/其他权限，拒绝 symlink。

## 验证与历史失败

```sh
python3 -B -m unittest discover -s deploy/download-router -p 'test_*tencent*.py' -v
```

测试使用合成凭据和隔离文件；Linux Python 3.12.3 全部 68 项通过，无跳过。Windows 本地 68 项中 2 项 POSIX 专用检查按平台跳过。

真实公开入口完整下载安装器、签名及便携包，字节数和 SHA256 均符合 deploy_tencent.py 的固定 ASSETS。过期/错误签名返回 403，11 次/分钟签发测试返回 429，身份伪造不能选择已阻断的其他 IP 桶。正式 Tauri updater SDK 通过隔离清单覆盖包地址后，实际下载腾讯安装器 23,121,161 字节并验签通过；没有运行安装器，不证明覆盖安装或默认稳定线路切换。

首批 20261017-tencent-v1 因 systemd 凭据挂载权限启动失败，部署脚本自动撤回；保留不可变记录后以新批次修复。辅助过期签名用例曾使用不合格式的随机串，修正后另存成功回执，未把失败日志覆盖成成功。

## 部署与回退

脚本是固定版本、固定哈希的单次部署批次，不是可反复覆盖生产的通用发布命令。再次变更须新建批次、检查实际 Nginx 差异、更新审核基线和独立 manifest；不得直接重跑 install。

本批次 main 基线/部署后 SHA256 均为 `819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75`；snippet 部署前为 `d19eb29f4cf38bd9c2ab95c1c7b147182e637f3140acea9a1ecd1bfc9a985a8b`，追加三个 location 后为 `674ae8a40535de782a0718001ee514abfeb1c98d426f7e838975df6af3668b89`。安装/回退均用 CAS 检测并发变更，不覆盖其他批次。

精确回退前先移除并验证 feed 的两个可选腾讯字段，避免留下失效按钮；保留 R2/GitHub 默认下载。随后核对当前 receipt 和文件哈希，再执行本批次 rollback。回退不会删除凭据或已有 R2 服务；如果当前文件已变化，停止并保留现场。

```sh
python3 -B /root/lolicode-tencent-router-20261018-tencent-v2/deploy_tencent.py rollback
```

公开稳定 feed 在追加腾讯字段后 SHA256 为 `3dffe99d58afb1a4b6ddc2350a8db21548974ad24a0cc4a3666b9d98698e28f0`，原清单备份在 tools 服务器私有路径 `/root/lolicode-stable-feed-before-tencent-20261018.json`。不要据此将网站发布等同于新应用二进制发布。
