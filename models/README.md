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

`watermark_detector/visible_watermark_mask.onnx` provides visible watermark selection suggestions.
It is an ONNX opset 17 conversion of the DevynLabs U-Net++ `segmenter.pth` checkpoint with per-channel int8 convolution weights.
The checkpoint is distributed under the [Apache 2.0 license](watermark_detector/LICENSE.txt).
Source: https://huggingface.co/christophernavas/watermark-remover/blob/509fb6833823f4e9c519f8e4f87a9053567c779c/segmenter.pth

- Source SHA-256 `a4579c690e43ba2f73d7328ad49252a60660eff03de1c9f7a26b49d83d555a66`
- ONNX SHA-256 `58a365657484c740a8ee87ed96e87521f05ea651fd2c477877c26c9fa0a867a8`

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
