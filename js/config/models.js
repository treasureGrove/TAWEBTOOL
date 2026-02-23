(function (global) {
  const MODEL_CACHE_VERSION = 'anime-4k120-v1';
  const MODELS = {
    realesrgan: {
      id: 'realesrgan-anime-x4',
      name: 'RealESRGAN_x4plus_anime_6B',
      version: '2025.02.0',
      expectedSize: 66401615,
      url: 'https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x4plus_anime_6B.onnx'
    },
    rife: {
      id: 'rife48-ensemble-true-scale1',
      name: 'RIFE v4.8 Ensemble',
      version: '2025.02.0',
      expectedSize: 20258487,
      url: 'https://huggingface.co/yuvraj108c/rife-onnx/resolve/main/rife48_ensemble_True_scale_1_sim.onnx'
    }
  };

  global.ANIME_4K120_MODELS = {
    MODEL_CACHE_VERSION,
    MODELS
  };
})(self);
