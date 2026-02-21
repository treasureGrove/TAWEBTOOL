# 下载 mp4-muxer 库到本地

由于 CDN 可能被屏蔽或网络问题，建议下载 mp4-muxer 库到本地使用。

## 方法一：浏览器直接下载

1. 在浏览器中打开以下任意一个链接：
   - https://www.unpkg.com/browse/mp4-muxer@5.1.2/
   - https://www.jsdelivr.com/package/npm/mp4-muxer

2. 找到并下载 `mp4-muxer.umd.js` 文件

3. 将文件保存到：`Z:\Project\TAWEBTOOL\third_part\mp4-muxer.umd.js`

## 方法二：使用 PowerShell 下载（推荐）

打开 PowerShell，运行以下命令：

```powershell
# 创建目录（如果不存在）
New-Item -ItemType Directory -Force -Path "Z:\Project\TAWEBTOOL\third_part"

# 下载文件（尝试多个可能的URL）
$urls = @(
    "https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.2/build/mp4-muxer.umd.js",
    "https://unpkg.com/mp4-muxer@5.1.2/build/mp4-muxer.umd.js",
    "https://cdn.jsdelivr.net/npm/mp4-muxer@latest/build/mp4-muxer.umd.js"
)

foreach ($url in $urls) {
    try {
        Write-Host "尝试从 $url 下载..."
        Invoke-WebRequest -Uri $url -OutFile "Z:\Project\TAWEBTOOL\third_part\mp4-muxer.umd.js" -UseBasicParsing
        Write-Host "下载成功！"
        break
    } catch {
        Write-Host "失败，尝试下一个..."
    }
}
```

## 方法三：从 GitHub 下载

1. 访问：https://github.com/Vanilagy/mp4-muxer
2. 下载最新的 Release
3. 解压后找到 `build/mp4-muxer.umd.js`
4. 复制到 `Z:\Project\TAWEBTOOL\third_part\mp4-muxer.umd.js`

## 验证

下载完成后，刷新页面，控制台应该显示：
```
✅ mp4-muxer从本地加载成功
```

如果还是失败，检查文件路径是否正确：
`Z:\Project\TAWEBTOOL\third_part\mp4-muxer.umd.js`
