// app.js
import { VideoProcessor } from './script/core/video-processor.js';
import { LivePhotoBuilder } from './script/core/livephoto-builder.js';
import { showNotification } from './script/utils/ui-helper.js';

document.addEventListener('DOMContentLoaded', () => {
    const videoProcessor = new VideoProcessor();
    const livePhotoBuilder = new LivePhotoBuilder(videoProcessor);

    // DOM元素引用
    const fileInput = document.getElementById('fileInput');
    const videoInput = document.getElementById('videoInput');
    const uploadArea = document.getElementById('uploadArea');
    const previewSection = document.getElementById('previewSection');
    const processingSection = document.getElementById('processingSection');
    const resultSection = document.getElementById('resultSection');
    const videoPreview = document.getElementById('videoPreview');
    const coverPreview = document.getElementById('coverPreview');
    const startTimeSlider = document.getElementById('startTime');
    const endTimeSlider = document.getElementById('endTime');
    const startTimeVal = document.getElementById('startTimeVal');
    const endTimeVal = document.getElementById('endTimeVal');
    const generateBtn = document.getElementById('generateBtn');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    let selectedVideoFile = null;
    let selectedCoverFile = null;

    // 生成占位封面（用于无法解码的视频，如HEVC）
    async function _generatePlaceholderCover(width, height) {
        const canvas = document.createElement('canvas');
        // 限制封面尺寸，不需要太大
        const maxCoverSize = 800;
        const scale = Math.min(1, maxCoverSize / Math.max(width, height));
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);

        const ctx = canvas.getContext('2d');

        // 深色背景
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制渐变效果
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#16213e');
        gradient.addColorStop(0.5, '#0f3460');
        gradient.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制图标
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        const iconSize = Math.min(canvas.width, canvas.height) * 0.3;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2 - iconSize * 0.3;

        // 播放按钮三角形
        ctx.beginPath();
        ctx.moveTo(cx - iconSize * 0.25, cy - iconSize * 0.4);
        ctx.lineTo(cx - iconSize * 0.25, cy + iconSize * 0.4);
        ctx.lineTo(cx + iconSize * 0.35, cy);
        ctx.closePath();
        ctx.fill();

        // 文字
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = `${Math.round(iconSize * 0.35)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HEVC 编码视频', cx, cy + iconSize * 0.7);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = `${Math.round(iconSize * 0.22)}px sans-serif`;
        ctx.fillText('无法调节时长，需要手动添加封面', cx, cy + iconSize * 1.1);

        // 视频信息
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = `${Math.round(iconSize * 0.18)}px sans-serif`;
        ctx.fillText(`${width}x${height}`, cx, canvas.height - iconSize * 0.4);

        return new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.92);
        });
    }

    // 显示/隐藏区域
    function showSection(section) {
        [previewSection, resultSection].forEach(s => {
            if (s) s.classList.add('hidden');
        });
        if (section) section.classList.remove('hidden');
    }

    function updateProgress(percent, text) {
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = text;
    }

    function showProcessing(show) {
        if (processingSection) {
            if (show) {
                processingSection.classList.remove('hidden');
            } else {
                processingSection.classList.add('hidden');
            }
        }
    }

    // 格式化时间显示
    function formatTime(seconds) {
        return `${seconds.toFixed(1)}s`;
    }

    // 处理文件选择
    async function handleFileSelect(file) {
        if (!file) return;

        // 验证文件类型
        if (!file.type.startsWith('video/')) {
            showNotification('请选择视频文件', 'error');
            return;
        }

        selectedVideoFile = file;
        showProcessing(true);
        updateProgress(10, '正在加载视频...');

        try {
            // 加载视频
            await videoProcessor.loadVideo(file);
            const duration = videoProcessor.videoElement.duration;
            const canDecode = videoProcessor.videoElement.readyState >= 3;

            updateProgress(20, '视频加载完成，初始化预览...');

            // 设置预览（HEVC视频可能无法预览，但可以使用）
            if (videoPreview) {
                videoPreview.src = URL.createObjectURL(file);
            }

            // 配置时间滑块
            if (startTimeSlider && endTimeSlider) {
                startTimeSlider.max = duration;
                endTimeSlider.max = duration;
                startTimeSlider.value = 0;

                // 如果无法解码，禁用滑块调整（因为无法预览剪辑）
                if (!canDecode) {
                    endTimeSlider.value = duration; // HEVC：默认使用完整视频
                    startTimeSlider.disabled = true;
                    endTimeSlider.disabled = true;
                    startTimeSlider.title = 'HEVC编码视频不支持预览和剪辑';
                    endTimeSlider.title = 'HEVC编码视频不支持预览和剪辑';
                    showNotification('视频编码无法预览，将使用原始视频直接生成', 'warning');
                } else {
                    endTimeSlider.value = Math.min(3, duration);
                    startTimeSlider.disabled = false;
                    endTimeSlider.disabled = false;
                    startTimeSlider.title = '';
                    endTimeSlider.title = '';

                    // 监听滑块变化
                    startTimeSlider.oninput = () => {
                        const start = parseFloat(startTimeSlider.value);
                        const end = parseFloat(endTimeSlider.value);
                        if (start >= end) {
                            startTimeSlider.value = end - 0.1;
                        }
                        startTimeVal.textContent = formatTime(parseFloat(startTimeSlider.value));
                        videoPreview.currentTime = parseFloat(startTimeSlider.value);
                    };

                    endTimeSlider.oninput = () => {
                        const start = parseFloat(startTimeSlider.value);
                        const end = parseFloat(endTimeSlider.value);
                        if (end <= start) {
                            endTimeSlider.value = start + 0.1;
                        }
                        endTimeVal.textContent = formatTime(parseFloat(endTimeSlider.value));
                    };
                }

                startTimeVal.textContent = formatTime(0);
                endTimeVal.textContent = formatTime(parseFloat(endTimeSlider.value));
            }

            // 提取默认封面（HEVC视频无法提取，生成占位封面）
            updateProgress(30, '提取封面...');
            let coverBlob;
            if (canDecode) {
                coverBlob = await videoProcessor.extractCoverFrame(0);
            } else {
                // HEVC视频：生成一个占位封面
                coverBlob = await _generatePlaceholderCover(
                    videoProcessor.videoElement.videoWidth,
                    videoProcessor.videoElement.videoHeight
                );
                console.log('HEVC视频无法解码，已生成占位封面');
                showNotification('HEVC视频无法预览封面，建议手动添加封面图片', 'warning');
            }
            if (coverPreview) {
                coverPreview.src = URL.createObjectURL(coverBlob);
                livePhotoBuilder.setCoverImage(coverBlob);
            }

            updateProgress(40, '准备就绪');
            showSection(previewSection);
            if (generateBtn) generateBtn.classList.remove('hidden');

            showNotification('视频加载成功', 'success');
        } catch (error) {
            console.error('视频加载失败:', error);
            showNotification('视频加载失败: ' + error.message, 'error');
            showSection(null);
        }
    }

    // 文件输入选择
    fileInput?.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // 兼容videoInput
    videoInput?.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // 拖拽上传
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('border-primary/50', 'bg-primary/5');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('border-primary/50', 'bg-primary/5');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('border-primary/50', 'bg-primary/5');
            const file = e.dataTransfer.files[0];
            handleFileSelect(file);
        });

        // 注意：不需要添加 click 事件，因为 HTML 中 uploadArea 内的 <label> 已经自动处理了文件选择
    }

    // 封面选择
    document.getElementById('photoUpload')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) {
            showNotification('请选择图片文件', 'error');
            return;
        }
        selectedCoverFile = file;
        if (coverPreview) {
            coverPreview.src = URL.createObjectURL(file);
        }
        livePhotoBuilder.setCoverImage(file);
        showNotification('封面已更新', 'success');
    });

    // 生成LivePhoto
    generateBtn?.addEventListener('click', async () => {
        if (!selectedVideoFile) {
            showNotification('请先选择视频文件', 'error');
            return;
        }

        const videoDuration = videoProcessor.videoElement.duration;
        const startTime = parseFloat(startTimeSlider?.value || 0);
        const endTime = parseFloat(endTimeSlider?.value || 3);
        const formatSelect = document.getElementById('format-select');
        const selectedFormat = formatSelect?.value || 'auto';

        if (startTime >= endTime) {
            showNotification('开始时间必须小于结束时间', 'error');
            return;
        }

        // 判断是否使用了自定义剪辑（如果时间范围不等于整个视频，则视为剪辑）
        const isTrimmed = (startTime > 0.05) || (endTime < videoDuration - 0.05);
        videoProcessor.isTrimmed = isTrimmed;

        showProcessing(true);
        generateBtn.disabled = true;

        try {
            // 判断是否使用原始视频（未剪辑时直接使用原始视频，保留HEVC编码）
            if (!isTrimmed) {
                console.log('未剪辑视频，直接使用原始视频（保留原始编码，如HEVC）');
                updateProgress(10, '正在构建LivePhoto（使用原始视频）...');
                // 不需要提取帧，livephoto-builder 会自动使用 originalBlob
                livePhotoBuilder.setVideoFrames([], videoDuration);
                updateProgress(50, '正在生成LivePhoto...');
            } else {
                // 步骤1: 提取视频帧（仅当用户剪辑时才需要重新编码）
                console.log(`检测到视频剪辑: ${formatTime(startTime)} - ${formatTime(endTime)}`);
                updateProgress(10, `正在提取视频帧 (${formatTime(startTime)} - ${formatTime(endTime)})...`);

                const frames = await videoProcessor.extractFrames(
                    startTime,
                    endTime,
                    30, // 使用30fps
                    (progress) => {
                        const overallProgress = 10 + Math.floor(progress * 0.4);
                        updateProgress(overallProgress, `提取视频帧中... ${progress}%`);
                    }
                );

                // 步骤2: 设置视频帧
                livePhotoBuilder.setVideoFrames(frames, endTime - startTime);
                updateProgress(55, '正在构建LivePhoto...');
            }

            // 步骤3: 构建LivePhoto
            const livePhotoResult = await livePhotoBuilder.build(selectedFormat);
            updateProgress(90, '处理完成，准备下载...');

            // 显示结果
            showSection(resultSection);

            // 设置预览
            const resultPreview = document.getElementById('resultPreview');
            const fileSizeDisplay = document.getElementById('fileSizeDisplay');
            if (resultPreview) {
                resultPreview.src = URL.createObjectURL(livePhotoResult.blob);
            }
            if (fileSizeDisplay) {
                const sizeMB = (livePhotoResult.blob.size / (1024 * 1024)).toFixed(2);
                fileSizeDisplay.textContent = `文件大小: ${sizeMB} MB`;
            }

            // 下载按钮
            const downloadBtn = document.getElementById('downloadBtn');
            if (downloadBtn) {
                downloadBtn.onclick = () => {
                    if (typeof saveAs !== 'undefined') {
                        saveAs(livePhotoResult.blob, livePhotoResult.fileName);
                    } else {
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(livePhotoResult.blob);
                        a.download = livePhotoResult.fileName;
                        a.click();
                        URL.revokeObjectURL(a.href);
                    }
                };
            }

            // 播放预览按钮
            const playVideoBtn = document.getElementById('playVideoBtn');
            if (playVideoBtn) {
                playVideoBtn.onclick = () => {
                    if (livePhotoResult.type === 'apple') {
                        showNotification('Apple LivePhoto需要在设备上查看', 'info');
                        return;
                    }
                    const motionVideoPreview = document.getElementById('motionVideoPreview');
                    if (motionVideoPreview) {
                        motionVideoPreview.src = URL.createObjectURL(livePhotoResult.blob);
                        motionVideoPreview.classList.remove('hidden');
                        motionVideoPreview.play();
                        resultPreview?.classList.add('hidden');
                    }
                };
            }

            updateProgress(100, '生成成功!');
            showNotification('LivePhoto生成成功!', 'success');
        } catch (error) {
            console.error('生成失败:', error);
            showNotification('处理失败: ' + error.message, 'error');
            showSection(previewSection);
        } finally {
            generateBtn.disabled = false;
        }
    });

    // 转换另一个
    document.getElementById('convertAnotherBtn')?.addEventListener('click', () => {
        selectedVideoFile = null;
        selectedCoverFile = null;
        if (fileInput) fileInput.value = '';
        showSection(null);
        if (generateBtn) generateBtn.classList.add('hidden');
        videoProcessor.cleanup();
    });
});
