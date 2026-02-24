#!/usr/bin/env bash
set -euo pipefail

# Downloads recommended ONNX models into ./models
# Run from repository root: ./scripts/fetch_models.sh

mkdir -p ./models

echo "Downloading RIFE_HDv3.onnx (recommended lightweight RIFE)..."
curl -L -o ./models/RIFE_HDv3.onnx \
  https://raw.githubusercontent.com/hpc203/Real-Time-Frame-Interpolation-onnxrun/main/RIFE_HDv3.onnx

echo "Downloading Real-ESRGAN-General-x4v3.onnx (web-friendly ESRGAN)..."
curl -L -o ./models/Real-ESRGAN-General-x4v3.onnx \
  https://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3/resolve/main/Real-ESRGAN-General-x4v3.onnx

echo "Downloads complete. Files saved to ./models/"
