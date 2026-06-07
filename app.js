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

            updateProgress(20, '视频加载完成，初始化预览...');

            // 设置预览
            if (videoPreview) {
                videoPreview.src = URL.createObjectURL(file);
            }

            // 配置时间滑块
            if (startTimeSlider && endTimeSlider) {
                startTimeSlider.max = duration;
                endTimeSlider.max = duration;
                startTimeSlider.value = 0;
                endTimeSlider.value = Math.min(3, duration);

                startTimeVal.textContent = formatTime(0);
                endTimeVal.textContent = formatTime(Math.min(3, duration));

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

            // 提取默认封面
            updateProgress(30, '提取封面...');
            const coverBlob = await videoProcessor.extractCoverFrame(0);
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

        const startTime = parseFloat(startTimeSlider?.value || 0);
        const endTime = parseFloat(endTimeSlider?.value || 3);
        const formatSelect = document.getElementById('format-select');
        const selectedFormat = formatSelect?.value || 'auto';

        if (startTime >= endTime) {
            showNotification('开始时间必须小于结束时间', 'error');
            return;
        }

        showProcessing(true);
        generateBtn.disabled = true;

        try {
            // 步骤1: 提取视频帧
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
