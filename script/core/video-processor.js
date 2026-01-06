export class VideoProcessor {
    constructor() {
        this.videoElement = document.createElement('video');
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
    }
    
    async loadVideo(file) {
        this.originalBlob = file; // 保存原始引用
        this.isTrimmed = false;   // 记录是否被剪辑
        return new Promise((resolve, reject) => {
            const videoURL = URL.createObjectURL(file);
            this.videoElement.src = videoURL;
            
            this.videoElement.onloadedmetadata = () => resolve(this.videoElement);
            this.videoElement.onerror = (err) => reject(err);
        });
    }

    // 提取视频帧序列 (兼容LivePhotoBuilder格式)
    async extractFrames(startTime, endTime, fps = 15, onProgress) {
        // 参数验证
        if (!this.videoElement) throw new Error('请先加载视频');
        if (isNaN(startTime) || isNaN(endTime) || isNaN(fps)) {
            throw new Error('无效的时间参数');
        }
        if (startTime >= endTime) throw new Error('开始时间必须小于结束时间');
        if (fps <= 0 || fps > 30) throw new Error('帧率必须在1-30之间');

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        
        const duration = endTime - startTime;
        const frameCount = Math.ceil(duration * fps);
        const frames = [];
        
        try {
            for (let i = 0; i < frameCount; i++) {
                const time = startTime + (i / fps);
                
                // 跳转到指定时间
                await this.seekTo(time);
                
                // 绘制帧
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
                
                // 获取ImageData (兼容LivePhotoBuilder)
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                frames.push({
                    imageData,
                    width: canvas.width,
                    height: canvas.height,
                    timestamp: time
                });
                
                // 更新进度
                const progress = Math.floor((i / frameCount) * 100);
                if (onProgress) onProgress(progress);
                
                // 定期释放事件循环
                if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            console.log(`成功提取 ${frames.length} 帧视频`);
            return frames;
        } catch (error) {
            console.error('帧提取失败:', error);
            throw error;
        } finally {
            // 清理canvas
            canvas.width = 1;
            canvas.height = 1;
        }
    }
    
    // 提取单个封面帧
    async extractCoverFrame(time = 0) {
        await this.seekTo(time);
        
        const canvas = document.createElement('canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
        
        return new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9);
        });
    }

    // 跳转到指定时间
    async seekTo(time) {
        return new Promise((resolve) => {
            this.videoElement.currentTime = time;
            this.videoElement.onseeked = () => resolve();
        });
    }

    // 视频转MP4 (优化版：支持音轨合并)
    async convertToMP4(videoFrames, frameDuration) {
        // 参数验证
        if (!Array.isArray(videoFrames) || videoFrames.length === 0) {
            throw new Error('无效的视频帧数组');
        }

        // 创建canvas
        const firstFrame = videoFrames[0];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = firstFrame.width;
        canvas.height = firstFrame.height;

        // 获取视频轨道
        const videoStream = canvas.captureStream(30);
        
        // 尝试获取音频轨道
        let audioTrack = null;
        try {
            // 从原始视频元素捕获流
            const originalStream = this.videoElement.captureStream ? 
                                 this.videoElement.captureStream() : 
                                 this.videoElement.mozCaptureStream();
            
            const audioTracks = originalStream.getAudioTracks();
            if (audioTracks.length > 0) {
                audioTrack = audioTracks[0].clone();
                console.log('成功捕获原始音频轨道');
            }
        } catch (e) {
            console.warn('无法捕获音轨，将生成无声视频:', e);
        }

        // 合并流
        const combinedStream = new MediaStream([videoStream.getVideoTracks()[0]]);
        if (audioTrack) {
            combinedStream.addTrack(audioTrack);
        }

        // 配置MediaRecorder
        const supportedTypes = [
            'video/mp4;codecs=avc1,mp4a.40.2', // 优先尝试带音频的MP4
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=h264,opus',
            'video/webm'
        ];
        
        let selectedType = '';
        for (const type of supportedTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                selectedType = type;
                break;
            }
        }

        const chunks = [];
        const recorder = new MediaRecorder(combinedStream, {
            mimeType: selectedType,
            videoBitsPerSecond: 15000000 
        });

        return new Promise(async (resolve, reject) => {
            recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
            recorder.onstop = () => {
                if (audioTrack) audioTrack.stop(); // 停止音频捕获
                resolve(new Blob(chunks, { type: selectedType }));
            };
            recorder.onerror = (e) => reject(new Error(`录制失败: ${e.error.message}`));

            // 准备有效帧
            const validFrames = [];
            for (let i = 0; i < videoFrames.length; i++) {
                try {
                    let frame = videoFrames[i].imageData || videoFrames[i];
                    if (!(frame instanceof ImageBitmap)) {
                        frame = await createImageBitmap(frame);
                    }
                    validFrames.push(frame);
                } catch (e) {
                    console.warn(`跳过无效帧 #${i}`, e);
                }
            }

            // 开始录制
            recorder.start();
            
            // 如果有音频，确保视频元素在后台播放以输出音频
            if (audioTrack) {
                this.videoElement.muted = false;
                this.videoElement.volume = 0; // 静音但保持轨道激活
                this.videoElement.currentTime = videoFrames[0].timestamp || 0;
                this.videoElement.play().catch(e => console.warn('音频预览播放受阻:', e));
            }

            let frameIndex = 0;
            const drawNextFrame = () => {
                if (frameIndex >= validFrames.length) {
                    recorder.stop();
                    this.videoElement.pause();
                    return;
                }

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(validFrames[frameIndex], 0, 0);
                frameIndex++;
                setTimeout(drawNextFrame, frameDuration * 1000);
            };

            drawNextFrame();
        });
    }

    // 修复MP4文件头
    async fixMP4Header(blob) {
        // 这里可以添加更复杂的MP4文件头修复逻辑
        // 目前返回原始blob，后续可根据需要增强
        return blob;
    }

    // 清理资源
    cleanup() {
        if (this.videoElement.src) {
            URL.revokeObjectURL(this.videoElement.src);
            this.videoElement.src = '';
        }
    }
}