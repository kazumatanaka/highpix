# HighPix - 究極の画像加工スタジオ

画像をアップロードするだけで、AIが「高画質化（超解像）」と「背景透明化」を瞬時に行います。

## 主な機能
1.  **高画質化 (Upscale)**: AI（ESRGAN）を使用して、画像の解像度を2倍に向上させます。
2.  **背景透明化 (Background Removal)**: 被写体を自動認識し、背景をきれいに除去します。
3.  **究極仕上げ (Upscale + BG Removal)**: 背景を除去した上で高画質化を行い、最高品質の素材を作成します。

## 使い方
このツールはブラウザ上で動作します。セキュリティ上の理由（CORS）から、ローカルサーバー経由で開く必要があります。

### 起動方法
ターミナルでこのディレクトリに移動し、以下のコマンドを実行してください：

```bash
python3 -m http.server
```

その後、ブラウザで `http://localhost:8000` を開いてください。

## 技術仕様
- **スタイリング**: Vanilla CSS (Premium Glassmorphism Design)
- **高画質化**: TensorFlow.js + Upscaler.js
- **背景透明化**: @imgly/background-removal (Cloud-free / On-device processing)
- **アイコン**: Lucide Icons
