// Import Libraries
import { removeBackground } from 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm';
import Upscaler from 'https://cdn.jsdelivr.net/npm/upscaler@1.0.0-beta.33/+esm';

// Initialize Lucide Icons
lucide.createIcons();

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

// Handle Select Button
selectBtn.addEventListener('click', () => fileInput.click());

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

// Menu Actions
menuBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        if (isProcessing) return;
        const mode = btn.getAttribute('data-mode');
        
        // UI State
        menuBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        startProcessing(mode);
        
        try {
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
        upscaler = new Upscaler({
          model: {
            path: 'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0-beta.7/models/model.json',
            scale: 2,
          }
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
    
    const config = {
      progress: (key, current, total) => {
        const percent = Math.round((current / total) * 100);
        progressText.innerText = `AI Analysis: ${percent}%`;
      }
    };

    const blob = await removeBackground(originalImageFile, config);
    const url = URL.createObjectURL(blob);
    
    resultPreview.src = url;
    processedBlob = blob;
}

// Processing Logic: Both
async function processBoth() {
    // Stage 1: BG Removal
    progressText.innerText = 'Stage 1: Removing Background...';
    const bgBlob = await removeBackground(originalImageFile, {
        progress: (k, c, t) => {
            const percent = Math.round((c / t) * 100);
            progressText.innerText = `Background: ${percent}%`;
        }
    });
    
    // Stage 2: Upscale the result
    progressText.innerText = 'Stage 2: Upscaling...';
    const bgUrl = URL.createObjectURL(bgBlob);
    
    if (!upscaler) {
        upscaler = new Upscaler({
          model: {
            path: 'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0-beta.7/models/model.json',
            scale: 2,
          }
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
