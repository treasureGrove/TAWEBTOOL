Place ONNX models here so the web app can load them without CORS issues.

Recommended models:
- RIFE (interpolation): RIFE_HDv3.onnx
  Source: https://raw.githubusercontent.com/hpc203/Real-Time-Frame-Interpolation-onnxrun/main/RIFE_HDv3.onnx

- Upscale (ESRGAN): Real-ESRGAN-General-x4v3.onnx
  Source: https://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3/resolve/main/Real-ESRGAN-General-x4v3.onnx

The image watermark tool uses the bundled `migan/migan_pipeline_v2.onnx` for browser-local inpainting.
It was released by Picsart AI Research under the [MIT license](migan/LICENSE.txt).
Source: https://huggingface.co/andraniksargsyan/migan/blob/1538c13/migan_pipeline_v2.onnx

SHA-256: `6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b`

Quick fetch (from repo root):

```bash
./scripts/fetch_models.sh
```

Hosting notes:
- Serve the `models/` directory from your web server (e.g. place under the site root so `/models/*.onnx` is accessible).
- Ensure correct MIME types (binary) and allow large file downloads.

Runtime notes for `ai_frame_interpolation.js`:
- The app will try `/models/...` first; if not present it falls back to the remote URL.
- RIFE: use two-frame input, pad H/W to multiples of 32, normalize to [0,1], use NCHW float32.
- ESRGAN: uses tiled inference with overlap; output is 4x and should be recomposed.
