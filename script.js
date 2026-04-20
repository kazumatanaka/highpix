// AI Libraries
let segmenter = null;
let UpscalerClass = null;
let EsrganSlimModel = null;
let RawImageClass = null;

// Initialize Lucide Icons
if (window.lucide) {
    window.lucide.createIcons();
}

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const selectBtn = document.getElementById('selectBtn');
const emptyState = document.getElementById('emptyState');
const previewState = document.getElementById('previewState');
const originalPreview = document.getElementById('originalPreview');
const resultPreview = document.getElementById('resultPreview');
const resultLabel = document.getElementById('resultLabel');
const loader = document.getElementById('loader');
const progressText = document.getElementById('progressText');
const controls = document.getElementById('controls');
const actionFooter = document.getElementById('actionFooter');
const menuBtns = document.querySelectorAll('.menu-btn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

let originalImageFile = null;
let processedBlob = null;
let isProcessing = false;
let upscaler = null;

// --- UI Interaction ---

selectBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Drag and Drop
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください');
        return;
    }
    originalImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        originalPreview.src = e.target.result;
        emptyState.classList.add('hidden');
        previewState.classList.remove('hidden');
        controls.classList.remove('hidden');
        
        // Reset state
        resultPreview.classList.add('hidden');
        resultLabel.innerText = '処理を選択してください';
        actionFooter.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

// --- Heavy AI Processing ---

async function loadLibraries() {
    if (!segmenter || !UpscalerClass || !EsrganSlimModel) {
        progressText.innerText = 'AIエンジンの準備中... (初回のみDL。約200MB)';
        try {
            const [upscaleMod, esrganMod, transformersMod] = await Promise.all([
                import('https://esm.sh/upscaler@1.0.0-beta.19'),
                import('https://esm.sh/@upscalerjs/esrgan-slim@1.0.0-beta.12/2x'),
                import('https://esm.sh/@huggingface/transformers')
            ]);
            UpscalerClass = upscaleMod.default;
            EsrganSlimModel = esrganMod.default;
            RawImageClass = transformersMod.RawImage;
            
            const { pipeline, env } = transformersMod;
            env.allowLocalModels = false;
            
            if (!segmenter) {
                segmenter = await pipeline('background-removal', 'briaai/RMBG-1.4', {
                    progress_callback: (info) => {
                        if (info.status === 'progress') {
                            const percent = Math.round((info.loaded / info.total) * 100);
                            progressText.innerText = `背景除去AI DL中: ${percent}%`;
                        } else if (info.status === 'downloading') {
                            progressText.innerText = `モデルのダウンロード中: ${info.file}`;
                        } else if (info.status === 'init' || info.status === 'ready') {
                            progressText.innerText = 'AIエンジンを初期化中...';
                        }
                    }
                });
            }
        } catch (err) {
            console.error('Library load error:', err);
            const detailedMsg = err.message ? err.message : String(err);
            throw new Error(`AIライブラリの読み込みに失敗しました。\n詳細: ${detailedMsg}`);
        }
    }
}

async function executeBackgroundRemoval(file) {
    const url = URL.createObjectURL(file);
    const image = await RawImageClass.fromURL(url);
    
    progressText.innerText = 'AI Analysis: Processing...';
    
    // Process image with modnet model
    const output = await segmenter(image);
    
    let mask = null;
    if (output && output.data && output.width && output.height) { mask = output; }
    else if (output.output && output.output.data) { mask = output.output; }
    else if (output.mask && output.mask.data) { mask = output.mask; }
    else if (Array.isArray(output) && output[0] && output[0].data) { mask = output[0]; }
    else if (Array.isArray(output) && output[0].mask && output[0].mask.data) { mask = output[0].mask; }
    else if (Array.isArray(output) && output[0].output && output[0].output.data) { mask = output[0].output; }
    
    if (!mask) {
        throw new Error("Unable to extract mask from AI output");
    }
    
    // Load original image to canvas
    const img = new Image();
    img.src = url;
    await new Promise(r => img.onload = r);
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    
    // Convert mask Array into Canvas ImageData
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = mask.width;
    maskCanvas.height = mask.height;
    const maskCtx = maskCanvas.getContext('2d');
    const imageData = maskCtx.createImageData(mask.width, mask.height);
    
    const isFloat = mask.data instanceof Float32Array;
    const numPixels = mask.width * mask.height;
    
    // Some pipelines return RGBA or Grayscale. Dynamically detect channels.
    const channels = mask.channels ? mask.channels : (mask.data.length / numPixels);
    
    for (let i = 0; i < numPixels; i++) {
        let val;
        if (channels === 1) {
            val = mask.data[i];
        } else if (channels === 4) {
            val = mask.data[i * 4 + 3]; // use alpha channel
        } else {
            val = mask.data[i * channels]; // fallback to first channel
        }
        
        if (isFloat) val = Math.round(val * 255);
        
        const offset = i * 4;
        imageData.data[offset] = 0;     // R
        imageData.data[offset + 1] = 0; // G
        imageData.data[offset + 2] = 0; // B
        imageData.data[offset + 3] = val; // A
    }
    maskCtx.putImageData(imageData, 0, 0);
    
    // Draw mask over original image
    ctx.drawImage(maskCanvas, 0, 0, mask.width, mask.height, 0, 0, canvas.width, canvas.height);
    
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// Menu Actions
menuBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        if (isProcessing) return;
        const mode = btn.getAttribute('data-mode');
        
        menuBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        startProcessing(mode);
        
        try {
            await loadLibraries();
            
            if (mode === 'upscale') {
                await processUpscale();
            } else if (mode === 'remove-bg') {
                await processRemoveBg();
            } else if (mode === 'both') {
                await processBoth();
            }
            finishProcessing();
        } catch (error) {
            console.error(error);
            alert('処理中にエラーが発生しました: ' + error.message);
            stopProcessing();
        }
    });
});

function startProcessing(mode) {
    isProcessing = true;
    loader.classList.remove('hidden');
    resultPreview.classList.add('hidden');
    resultLabel.innerText = 'Processing...';
    progressText.innerText = 'Initializing...';
    actionFooter.classList.add('hidden');
    downloadBtn.disabled = true;
}

function stopProcessing() {
    isProcessing = false;
    loader.classList.add('hidden');
}

function finishProcessing() {
    isProcessing = false;
    loader.classList.add('hidden');
    resultPreview.classList.remove('hidden');
    resultLabel.innerText = 'Completed';
    actionFooter.classList.remove('hidden');
    downloadBtn.disabled = false;
}

// Processing Logic: Upscale
async function processUpscale() {
    progressText.innerText = 'Upscaling (2x)...';
    
    if (!upscaler) {
        upscaler = new UpscalerClass({
          model: EsrganSlimModel
        });
    }

    const upscaledImage = await upscaler.upscale(originalPreview.src, {
        patchSize: 64,
        padding: 4,
        progress: (percent) => {
            progressText.innerText = `Upscaling: ${Math.round(percent * 100)}%`;
        }
    });

    resultPreview.src = upscaledImage;
    processedBlob = await (await fetch(upscaledImage)).blob();
}

// Processing Logic: Background Removal
async function processRemoveBg() {
    progressText.innerText = 'Removing Background...';
    const blob = await executeBackgroundRemoval(originalImageFile);
    const url = URL.createObjectURL(blob);
    resultPreview.src = url;
    processedBlob = blob;
}

// Processing Logic: Both
async function processBoth() {
    progressText.innerText = 'Stage 1: Removing Background...';
    const bgBlob = await executeBackgroundRemoval(originalImageFile);
    
    progressText.innerText = 'Stage 2: Upscaling...';
    const bgUrl = URL.createObjectURL(bgBlob);
    
    if (!upscaler) {
        upscaler = new UpscalerClass({
          model: EsrganSlimModel
        });
    }

    const upscaledImage = await upscaler.upscale(bgUrl, {
        patchSize: 64,
        padding: 4,
        progress: (percent) => {
            progressText.innerText = `Upscaling: ${Math.round(percent * 100)}%`;
        }
    });

    resultPreview.src = upscaledImage;
    processedBlob = await (await fetch(upscaledImage)).blob();
}

// Download
downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = resultPreview.src;
    link.download = `highpix_${Date.now()}.png`;
    link.click();
});

// Reset
resetBtn.addEventListener('click', () => {
    originalImageFile = null;
    processedBlob = null;
    isProcessing = false;
    
    fileInput.value = '';
    originalPreview.src = '';
    resultPreview.src = '';
    
    previewState.classList.add('hidden');
    controls.classList.add('hidden');
    emptyState.classList.remove('hidden');
    
    menuBtns.forEach(b => b.classList.remove('active'));
});
