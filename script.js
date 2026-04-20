// AI Libraries
let aiModel = null;
let aiProcessor = null;
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
    if (!aiProcessor || !aiModel || !UpscalerClass || !EsrganSlimModel) {
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
            
            const { AutoModel, AutoProcessor, env } = transformersMod;
            env.allowLocalModels = false;
            
            if (!aiProcessor) {
                progressText.innerText = `プロセッサ準備中...`;
                aiProcessor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4');
            }
            if (!aiModel) {
                progressText.innerText = `モデルのダウンロード中...`;
                aiModel = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
                    config: { model_type: 'custom' },
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
    
    // Process image with RMBG-1.4 model
    const inputs = await aiProcessor(image);
    const result = await aiModel(inputs);
    
    // The output is a dictionary of tensors. Get the first one (the mask).
    const keys = Object.keys(result);
    if (!keys.length) throw new Error("AI returned empty result");
    const tensor = result[keys[0]];
    
    const dims = tensor.dims;
    const tWidth = dims[dims.length - 1];
    const tHeight = dims[dims.length - 2];
    const floatData = tensor.data;
    
    // Create an ImageData for the mask
    const maskImageData = new ImageData(tWidth, tHeight);
    for (let i = 0; i < tWidth * tHeight; i++) {
        // Tensor outputs probabilities 0.0 to 1.0 (sometimes slightly out of bounds).
        // For RMBG, it's a direct probability map.
        let alpha = Math.round(floatData[i] * 255);
        if (alpha < 0) alpha = 0;
        if (alpha > 255) alpha = 255;
        
        const offset = i * 4;
        maskImageData.data[offset] = 0;     // R
        maskImageData.data[offset + 1] = 0; // G
        maskImageData.data[offset + 2] = 0; // B
        maskImageData.data[offset + 3] = alpha; // A
    }
    
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = tWidth;
    maskCanvas.height = tHeight;
    maskCanvas.getContext('2d').putImageData(maskImageData, 0, 0);
    
    // Native output composition
    const canvas = document.createElement('canvas');
    canvas.width = image.width; // Original width
    canvas.height = image.height; // Original height
    const ctx = canvas.getContext('2d');
    
    const imgElement = new Image();
    imgElement.src = url;
    await new Promise(r => imgElement.onload = r);
    ctx.drawImage(imgElement, 0, 0);
    
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskCanvas, 0, 0, tWidth, tHeight, 0, 0, canvas.width, canvas.height);
    
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
