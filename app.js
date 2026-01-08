// 导入依赖类
import { VideoProcessor } from './script/core/video-processor.js';
import { LivePhotoBuilder } from './script/core/livephoto-builder.js';

// 通知功能
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// 添加通知样式
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 4px;
        color: white;
        background: #333;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: translateY(100px);
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 1000;
    }
    .notification.show {
        transform: translateY(0);
        opacity: 1;
    }
    .notification.error {
        background: #ff4444;
    }
    .notification.success {
        background: #00C851;
    }
    .notification.info {
        background: #33b5e5;
    }
`;
document.head.appendChild(style);

// 全局变量声明
const videoProcessor = new VideoProcessor();
const livePhotoBuilder = new LivePhotoBuilder(videoProcessor);
let selectedVideo = null;
let coverImage = null;
let videoDuration = 0;

// DOM元素引用
const uploadSection = document.getElementById('uploadSection');
const previewSection = document.getElementById('previewSection');
const processingSection = document.getElementById('processingSection');
const resultSection = document.getElementById('resultSection');
const fileInput = document.getElementById('fileInput');
const videoPreview = document.getElementById('videoPreview');
const coverPreview = document.getElementById('coverPreview');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const startTimeVal = document.getElementById('startTimeVal');
const endTimeVal = document.getElementById('endTimeVal');
const generateBtn = document.getElementById('generateBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const downloadBtn = document.getElementById('downloadBtn');
const convertAnotherBtn = document.getElementById('convertAnotherBtn');
const resultPreview = document.getElementById('resultPreview');

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    updateGenerateBtnVisibility(false);

    function initEventListeners() {
        // 文件上传
        fileInput.addEventListener('change', handleFileSelection);

        // 使用静态帧作为封面
        document.getElementById('useStaticFrameBtn')?.addEventListener('click', async () => {
            if (!selectedVideo) return;
            coverImage = await videoProcessor.extractCoverFrame(0);
            coverPreview.src = URL.createObjectURL(coverImage);
        });

        // 上传照片作为封面
        document.getElementById('photoUpload')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                coverPreview.src = event.target.result;
                fetch(event.target.result)
                    .then(res => res.blob())
                    .then(blob => { coverImage = blob; });
            };
            reader.readAsDataURL(file);
        });

        // 生成Live Photo
        generateBtn.addEventListener('click', generateLivePhoto);
        convertAnotherBtn.addEventListener('click', resetApp);
        startTimeInput.addEventListener('input', () => {
            updateTimeDisplay();
            videoProcessor.isTrimmed = true;
        });
        endTimeInput.addEventListener('input', () => {
            updateTimeDisplay();
            videoProcessor.isTrimmed = true;
        });
        videoPreview.addEventListener('loadedmetadata', () => {
            videoDuration = videoPreview.duration;
            initTimeRange();
        });

        // 播放动态效果
        document.getElementById('playVideoBtn')?.addEventListener('click', () => {
            const motionVideoPreview = document.getElementById('motionVideoPreview');
            if (motionVideoPreview) {
                motionVideoPreview.classList.remove('hidden');
                resultPreview.classList.add('hidden');
                motionVideoPreview.muted = false; // 播放预览时取消静音
                motionVideoPreview.volume = 1.0;
                motionVideoPreview.play();
            }
        });
    }
    
    async function handleFileSelection(event) {
        selectedVideo = event.target.files[0];
        if (!selectedVideo) return;

        try {
            // 显示加载状态
            showNotification('正在加载视频, 请稍候...', 'info');
            
            // 加载视频元数据
            await videoProcessor.loadVideo(selectedVideo);
            
            // 更新预览界面
            videoPreview.src = URL.createObjectURL(selectedVideo);
            
            // 提取第一帧作为封面
            coverImage = await videoProcessor.extractCoverFrame(0);
            coverPreview.src = URL.createObjectURL(coverImage);
            
            showSection(previewSection);
            hideSection(uploadSection);
            updateGenerateBtnVisibility(true);
            
            showNotification('视频加载成功', 'success');
        } catch (error) {
            console.error('视频加载失败:', error);
            showNotification(`加载失败: ${error.message}`, 'error');
            // 重置输入框以便重新选择
            fileInput.value = '';
        }
    }
    
    async function generateLivePhoto() {
        try {
            showSection(processingSection);
            updateProgress(0, '开始处理...');
            
            // 获取输出格式
            const formatSelect = document.getElementById('format-select');
            const format = formatSelect ? formatSelect.value : 'google';

        // 验证时间参数
        const startTime = parseFloat(startTimeInput.value);
        const endTime = parseFloat(endTimeInput.value);
        if (startTime >= endTime) {
            throw new Error('开始时间必须小于结束时间');
        }

        // 强制设置转码标志，以解决群晖兼容性问题
        videoProcessor.isTrimmed = true; 

        // 提取视频帧
        updateProgress(20, '正在提取视频帧...');
            videoProcessor.videoElement.lastStartTime = startTime;
            videoProcessor.videoElement.lastEndTime = endTime;
            const frames = await videoProcessor.extractFrames(startTime, endTime, 15);
            if (!Array.isArray(frames) || frames.length === 0) {
                throw new Error('无法提取有效的视频帧');
            }
            console.log('成功提取视频帧:', frames.length);

            // 设置Live Photo参数
            updateProgress(50, '正在准备动态照片...');
            livePhotoBuilder.setCoverImage(coverImage);
            livePhotoBuilder.setVideoFrames(frames, (endTime - startTime) / frames.length);

            // 生成Live Photo
            updateProgress(70, '正在生成动态照片...');
            const result = await livePhotoBuilder.build(format);
            if (!result || !result.blob) {
                throw new Error('生成动态照片失败');
            }

            const livePhotoBlob = result.blob;
            const fileName = result.fileName;

            // 显示结果
            updateProgress(100, '处理完成!');
            
            const motionVideoPreview = document.getElementById('motionVideoPreview');
            if (motionVideoPreview && result.type !== 'apple') {
                // 如果是 Google 格式，由于视频追加在 JPG 末尾，直接给 src 可能不识别
                // 我们在 builder.build 中其实已经有了合并后的视频数据，但没有直接返回
                // 这里为了预览正常，我们从 livePhotoBlob 中提取视频部分，或者直接让预览播放原始选取的片段
                motionVideoPreview.src = videoPreview.src;
                motionVideoPreview.currentTime = startTime; 
                
                // 移除之前的循环播放逻辑，改为播放一次
                motionVideoPreview.ontimeupdate = null;
                motionVideoPreview.onended = () => {
                    motionVideoPreview.currentTime = startTime;
                };
            }

            if (result.type === 'apple') {
                // Apple格式是ZIP，无法预览图片，使用封面预览作为占位
                resultPreview.src = coverPreview.src;
            } else {
                resultPreview.src = URL.createObjectURL(livePhotoBlob);
            }
            
            // 更新文件大小显示
            const fileSizeDisplay = document.getElementById('fileSizeDisplay');
            if (fileSizeDisplay) {
                const sizeMB = (livePhotoBlob.size / (1024 * 1024)).toFixed(2);
                fileSizeDisplay.textContent = `文件大小: ${sizeMB} MB (${result.type === 'apple' ? 'ZIP包' : 'JPG图片'})`;
            }

            showSection(resultSection);
            hideSection(processingSection);
            
            // 设置下载功能
            downloadBtn.onclick = () => {
                if (typeof saveAs !== 'undefined') {
                    saveAs(livePhotoBlob, fileName);
                } else {
                    const url = URL.createObjectURL(livePhotoBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 100);
                }
            };

        } catch (error) {
            console.error('生成动态照片失败:', error);
            updateProgress(0, `错误: ${error.message}`);
            showSection(previewSection);
            // 显示错误通知
            showNotification(`生成失败: ${error.message}`, 'error');
        }
    }
    
    function updateProgress(percent = 0, message = '') {
        progressBar.style.width = `${percent}%`;
        progressText.textContent = message;
    }
    
    function resetApp() {
        // 清理旧资源，防止内存泄漏
        if (videoPreview.src) URL.revokeObjectURL(videoPreview.src);
        if (coverPreview.src) URL.revokeObjectURL(coverPreview.src);
        if (resultPreview.src) URL.revokeObjectURL(resultPreview.src);
        
        selectedVideo = null;
        coverImage = null;
        fileInput.value = '';
        videoPreview.src = '';
        coverPreview.src = '';
        resultPreview.src = '';
        
        const motionVideoPreview = document.getElementById('motionVideoPreview');
        if (motionVideoPreview) {
            motionVideoPreview.src = '';
            motionVideoPreview.classList.add('hidden');
        }
        
        showSection(uploadSection);
        hideSection(previewSection);
        hideSection(resultSection);
        hideSection(processingSection);
        updateGenerateBtnVisibility(false);
        
        // 自动滚动到顶部
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        
        showNotification('已重置，请重新上传视频', 'info');
    }
    
    function showSection(section) {
        section?.classList.remove('hidden');
    }
    
    function hideSection(section) {
        section?.classList.add('hidden');
    }
    
    function updateGenerateBtnVisibility(visible) {
        generateBtn?.classList.toggle('hidden', !visible);
    }
    
    function initTimeRange() {
        startTimeInput.min = 0;
        startTimeInput.max = videoDuration;
        startTimeInput.value = 0;
        endTimeInput.min = 0.1;
        endTimeInput.max = videoDuration;
        endTimeInput.value = Math.min(3, videoDuration);
        updateTimeDisplay();
    }
    
    function updateTimeDisplay() {
        startTimeVal.textContent = `${startTimeInput.value}s`;
        endTimeVal.textContent = `${endTimeInput.value}s`;
    }
});