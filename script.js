// AI Libraries (Switching to esm.sh for better dependency resolution)
let removeBackgroundFn = null;
let UpscalerClass = null;
let EsrganSlimModel = null;
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
    if (!removeBackgroundFn || !UpscalerClass || !EsrganSlimModel) {
        progressText.innerText = 'AIエンジンの準備中... (初回のみ10秒程度)';
        try {
            // Using esm.sh for robust dependency management
            const [bgMod, upscaleMod, esrganMod] = await Promise.all([
                import('https://esm.sh/@imgly/background-removal@1.7.0'),
                import('https://esm.sh/upscaler@1.0.0-beta.19'),
                import('https://esm.sh/@upscalerjs/esrgan-slim@1.0.0-beta.12/2x')
            ]);
            removeBackgroundFn = bgMod.removeBackground;
            UpscalerClass = upscaleMod.default;
            EsrganSlimModel = esrganMod.default;
        } catch (err) {
            console.error('Library load error:', err);
            throw new Error('AIライブラリの読み込みに失敗しました。ネットワーク状態を確認してリロードしてください。');
        }
    }
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

async function processRemoveBg() {
    progressText.innerText = 'Removing Background...';
    
    const blob = await removeBackgroundFn(originalImageFile, {
      progress: (key, current, total) => {
        const percent = Math.round((current / total) * 100);
        progressText.innerText = `AI Analysis: ${percent}%`;
      }
    });
    
    const url = URL.createObjectURL(blob);
    resultPreview.src = url;
    processedBlob = blob;
}

async function processBoth() {
    progressText.innerText = 'Stage 1: Removing Background...';
    const bgBlob = await removeBackgroundFn(originalImageFile, {
        progress: (k, c, t) => {
            const percent = Math.round((c / t) * 100);
            progressText.innerText = `Background: ${percent}%`;
        }
    });
    
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

downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = resultPreview.src;
    link.download = `highpix_${Date.now()}.png`;
    link.click();
});

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
