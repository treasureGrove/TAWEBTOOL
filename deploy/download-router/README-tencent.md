# Tencent 可选下载入口：准备完成，尚未部署

本批次 `20261017-tencent-v1` 只追加 4.0.20 三个固定 `/downloads/tencent/4.0.20/<文件名>` 路径。
既有 R2／GitHub 路由、官网、社区、账户 API 和更新 feed 不由本程序修改。
DNS／TLS 仍待本人验证；当前不得运行 `install`，也不得向 feed 添加腾讯字段。
`tencent-router.example.json` 保持 `enabled=false`、四个门禁全为 `false`。

当前实际基线：

- main：`819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75`。
- 官网可选按钮静态批次后的 snippet：`bf6b52f52564cbaf6bd7463235081ff20af5fb8771fb199fed70171b4af971c0`。
- 网站静态代码已经上线，但 feed 没有腾讯字段，按钮保持隐藏。
- COS 私有回源、CDN 日 2 GB／月 20 GB 封顶、IP 5 QPS、Type A／300 秒已由操作方回读；公开 DNS、证书和最终下载仍须实际验收。

## 文件与边界

七个后端准备文件为 `tencent_router.py`、`test_tencent_router.py`、
`tencent-router.example.json`、`tencent-nginx-locations.conf.template`、
`deploy_tencent.py`、`test_deploy_tencent.py`、`lolicode-tencent-router.service`。
不要打包 `__pycache__`、真实密钥或其它网站文件。

服务只监听 `127.0.0.1:18782`，仅接受 GET／HEAD 和三个精确路径。
三个 Nginx location 各自使用 [Cloudflare IPv4](https://www.cloudflare.com/ips-v4)／
[IPv6](https://www.cloudflare.com/ips-v6) 的审核网段恢复 `CF-Connecting-IP`，
再覆写专用身份头；非 Cloudflare 来源不能用该请求头改变自己的 IP。
部署前重新读取官方网段，变化即拒绝，不自动扩大信任范围。
这些规则不写入全站或原 R2 location。

[腾讯 Type A](https://cloud.tencent.com/document/product/228/41623) 使用
`MD5(uri-timestamp-rand-0-key)`，只签发固定 CDN 的对应对象地址。
源密钥由操作方另行存放于 `/etc/lolicode-tencent-cdn.key`，root 私有 0600；
unit 通过 `LoadCredential` 交给服务。本程序不创建、改写或删除该文件，
不得打印、截图、放入命令参数、环境变量、JSON、payload manifest 或仓库。

默认每 IPv4／IPv6 `/64` 在 60 秒内签发至多 10 次，超限封禁 600 秒；阈值可配置。
限频约束签名发放，已签 300 秒 URL 可复用，实际字节封顶由 CDN 配置执行。
请求不记 IP 日志，内存限频身份使用进程随机盐哈希。

## 本地与 Linux 隔离测试

```sh
python3 -B -m unittest discover -s deploy/download-router -p 'test_*tencent*.py' -v
```

所有网络和安装命令均使用 fake 测试对象，写入仅在测试临时目录。
HTTP 测试最多监听 `127.0.0.1:0`，不会公开监听或启动 systemd 服务。
Linux unit 语法验证必须用私有测试目录里的副本，把 `LoadCredential`
替换为同目录的已知合成测试内容；不要让测试接触真实凭据。

2026-10-17 已在服务器独立私有 staging、Python 3.12.3 下执行 **65／65** 项，
无跳过；补齐私有文件权限、所有者与拒绝 symlink 的 POSIX 验证。
测试护栏记录真实凭据访问、外部网络、公开端口、服务命令及目录外写入均为 0；
仅放行一条已禁用配置的 Python 子进程退出检查。
`systemd-analyze verify --man=no` 对合成凭据的临时 unit 副本返回 0，未启动 unit。
回执和日志保留在操作方私有测试目录，不把测试材料当作生产上线回执。

## 下一轮生产门禁与具体命令

以下仅供操作方在所有条件完成并重新审核后执行，本次准备未执行。

1. 完成本人 DNS／证书验证，确认 `https://downloads.treasuregrove.art` TLS 生效；
   回读私有 COS、日／月封顶、Type A 参数 `sign`／300 秒及告警配置。
2. 在私有目录 `/root/lolicode-tencent-router-20261017-tencent-v1/` 放入审核版本的
   `tencent_router.py`、`deploy_tencent.py`、unit、Nginx template 和 example。
   将 example 复制为 `tencent-router.production.json`；逐项真实验证后才设置
   `enabled` 与四个 `gates` 为 `true`，保留 TTL 300、固定附件身份和密钥路径。
   不要通过关闭哈希检查、改旧基线或盲目勾选门禁来绕过失败。
3. 在该私有目录生成 manifest 并检查配置，命令不会读取密钥：

```sh
cd /root/lolicode-tencent-router-20261017-tencent-v1
python3 -B - <<'PY'
import hashlib, json, os
from pathlib import Path
import deploy_tencent as deploy
config = deploy.signer.load_configuration(deploy.CONFIG_NAME)
assert deploy.signer.ready(config) and config.auth_ttl_seconds == 300
manifest = {
    'batch': deploy.BATCH, 'version': deploy.VERSION,
    'files': {name: hashlib.sha256(Path(name).read_bytes()).hexdigest()
              for name in sorted(deploy.FILES)},
}
with Path('manifest.json').open('x', encoding='utf-8') as stream:
    json.dump(manifest, stream, indent=2)
    stream.write('\n')
os.chmod('manifest.json', 0o600)
print('Fixed configuration gates and five-file manifest ready')
PY
```

4. 只读预检：检查两份 Nginx CAS、目标未存在、unit、官方 CF 网段、
   无签名三附件均 403，以及有签名三附件的真实完整下载字节与 SHA256。
   此步骤会按审核用途读取密钥签发测试 URL，但不会打印密钥或签名 URL。

```sh
python3 -B /root/lolicode-tencent-router-20261017-tencent-v1/deploy_tencent.py preflight
```

5. 全部预检通过、操作方再次放行后，才执行实际部署：

```sh
python3 -B /root/lolicode-tencent-router-20261017-tencent-v1/deploy_tencent.py install
```

程序再次预检，创建独立 unit／config／不可变代码目录，检查 loopback 响应，
最后只追加三个 location 并测试／重载 Nginx。任一步失败只回退仍匹配本批次的文件；
检测到并发变更则保留现场，绝不覆盖其它静态或路由批次。
公开三个入口完整下载、签名、限频及其它站点边界验收后，另行批准 feed 字段发布。

精确回退也要求 receipt 与当前文件匹配；不会删除密钥或已有 R2 服务：

```sh
python3 -B /root/lolicode-tencent-router-20261017-tencent-v1/deploy_tencent.py rollback
```
