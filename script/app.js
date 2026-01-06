// app.js
import { VideoProcessor } from './script/core/video-processor.js';
import { LivePhotoBuilder } from './script/core/livephoto-builder.js';
import { showNotification } from './script/utils/ui-helper.js';

document.addEventListener('DOMContentLoaded', () => {
    const videoProcessor = new VideoProcessor();
    const livePhotoBuilder = new LivePhotoBuilder();

    // 假设页面上有“生成动态照片”按钮
    const generateBtn = document.getElementById('generateLivePhotoBtn');
    generateBtn?.addEventListener('click', async () => {
        try {
            // 获取上传的视频文件
            const videoInput = document.getElementById('videoInput');
            if (!videoInput?.files?.length) {
                throw new Error('请先上传视频文件');
            }
            const videoFile = videoInput.files[0];
            await videoProcessor.loadVideo(videoFile);
            const frames = await videoProcessor.extractFrames(0, 3); // 提取 0 - 3 秒的帧
            const coverBlob = await videoProcessor.extractCoverFrame(0); // 提取封面

            livePhotoBuilder.setCoverImage(coverBlob);
            livePhotoBuilder.setVideoFrames(frames, 3);

            // 获取格式选择值
            const formatSelect = document.getElementById('format-select');
            const selectedFormat = formatSelect?.value || 'auto';
            
            const livePhotoBlob = await livePhotoBuilder.build(selectedFormat);
            
            // 创建下载链接
            const downloadLink = document.createElement('a');
            downloadLink.id = 'downloadLivePhoto';
            downloadLink.className = 'btn btn-download';
            const objectUrl = URL.createObjectURL(livePhotoBlob);
            downloadLink.href = objectUrl;
            downloadLink.download = 'livephoto.jpg';
            downloadLink.textContent = '下载Live Photo';
            
            // 点击后清理对象URL
            downloadLink.addEventListener('click', () => {
                setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
            });
            
            // 安全地添加下载按钮
            const downloadContainer = document.getElementById('downloadContainer');
            if (downloadContainer) {
                downloadContainer.innerHTML = '';
                downloadContainer.appendChild(downloadLink);
                
                // 使用事件委托确保点击处理
                downloadContainer.addEventListener('click', (e) => {
                    if (e.target.id === 'downloadLivePhoto') {
                        setTimeout(() => {
                            URL.revokeObjectURL(e.target.href);
                            downloadContainer.innerHTML = '';
                        }, 100);
                    }
                });
            } else {
                console.error('下载容器元素未找到');
            }
        } catch (error) {
            showNotification('处理 LivePhoto 失败: ' + error.message, 'error');
        }
    });
});