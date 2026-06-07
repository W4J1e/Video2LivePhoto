export class VideoProcessor {
    constructor() {
        this.videoElement = document.createElement('video');
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
        this.videoElement.preload = 'auto'; // 自动预加载
        this.originalBlob = null;
        this.isTrimmed = false;
        
        // 最大分辨率限制：1080p (防止4K内存溢出)
        this.maxWidth = 1920;
        this.maxHeight = 1080;
    }
    
    async loadVideo(file) {
        this.originalBlob = file; 
        this.isTrimmed = false;
        return new Promise((resolve, reject) => {
            if (this.videoElement.src) {
                URL.revokeObjectURL(this.videoElement.src);
            }
            const videoURL = URL.createObjectURL(file);
            this.videoElement.src = videoURL;
            this.videoElement.load();
            
            const timeout = setTimeout(() => {
                reject(new Error('视频加载超时，请检查文件格式或尝试更小的视频'));
            }, 30000);

            const cleanup = () => {
                clearTimeout(timeout);
                clearTimeout(canplayFallbackTimer);
                this.videoElement.oncanplaythrough = null;
                this.videoElement.oncanplay = null;
                this.videoElement.onerror = null;
            };

            let canplayFallbackTimer = null;
            let resolved = false;
            const doResolve = () => {
                if (resolved) return;
                resolved = true;
                cleanup();
                console.log(`视频加载完成: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}, 时长: ${this.videoElement.duration.toFixed(2)}s, readyState: ${this.videoElement.readyState}`);
                resolve(this.videoElement);
            };

            // 等待 canplaythrough（整个视频已缓冲，适合大文件/4K视频seek）
            this.videoElement.oncanplaythrough = doResolve;
            
            // fallback: canplay 触发后等待5秒，如果 canplaythrough 还没触发则由 canplay 兜底
            this.videoElement.oncanplay = () => {
                canplayFallbackTimer = setTimeout(() => {
                    if (this.videoElement.readyState >= 3) {
                        doResolve();
                    }
                }, 5000);
            };
            
            this.videoElement.onerror = () => {
                cleanup();
                const error = this.videoElement.error;
                const msg = error ? `视频加载失败 (code: ${error.code})` : '视频格式不支持或文件损坏';
                reject(new Error(msg));
            };
        });
    }

    // 计算缩放后的尺寸 (保持宽高比)
    _getScaledDimensions(originalWidth, originalHeight) {
        if (originalWidth <= this.maxWidth && originalHeight <= this.maxHeight) {
            return { width: originalWidth, height: originalHeight };
        }
        
        const scale = Math.min(
            this.maxWidth / originalWidth,
            this.maxHeight / originalHeight
        );
        
        return {
            width: Math.round(originalWidth * scale),
            height: Math.round(originalHeight * scale)
        };
    }

    // 提取视频帧序列
    async extractFrames(startTime, endTime, fps = 15, onProgress) {
        if (!this.videoElement) throw new Error('请先加载视频');
        if (isNaN(startTime) || isNaN(endTime) || isNaN(fps)) {
            throw new Error('无效的时间参数');
        }
        if (startTime >= endTime) throw new Error('开始时间必须小于结束时间');
        if (fps <= 0 || fps > 30) throw new Error('帧率必须在1-30之间');

        console.log(`extractFrames 参数: start=${startTime}, end=${endTime}, fps=${fps}, duration=${endTime - startTime}`);

        // 计算缩放尺寸
        const { width: canvasWidth, height: canvasHeight } = this._getScaledDimensions(
            this.videoElement.videoWidth,
            this.videoElement.videoHeight
        );

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        
        const duration = endTime - startTime;
        const frameCount = Math.ceil(duration * fps);
        const frames = [];
        
        console.log(`视频原始尺寸: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}, 缩放至: ${canvasWidth}x${canvasHeight}, 提取 ${frameCount} 帧`);
        
        try {
            for (let i = 0; i < frameCount; i++) {
                const time = startTime + (i / fps);
                
                await this.seekTo(time);
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
                
                // 使用createImageBitmap代替getImageData (内存占用更少)
                const imageData = await createImageBitmap(canvas);
                frames.push({
                    imageData,
                    width: canvasWidth,
                    height: canvasHeight,
                    timestamp: time
                });
                
                const progress = Math.floor(((i + 1) / frameCount) * 100);
                if (onProgress) onProgress(progress);
                
                // 每10帧释放一次事件循环
                if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            console.log(`成功提取 ${frames.length} 帧视频`);
            return frames;
        } catch (error) {
            console.error('帧提取失败:', error);
            throw error;
        } finally {
            canvas.width = 1;
            canvas.height = 1;
        }
    }
    
    // 提取单个封面帧
    async extractCoverFrame(time = 0) {
        await this.seekTo(time);
        
        const { width, height } = this._getScaledDimensions(
            this.videoElement.videoWidth,
            this.videoElement.videoHeight
        );
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.videoElement, 0, 0, width, height);
        
        return new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9);
        });
    }

    // 跳转到指定时间 (带超时保护和就绪检查)
    async seekTo(time) {
        // 确保视频已准备好可以seek
        if (this.videoElement.readyState < 2) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('等待视频缓冲超时')), 10000);
                this.videoElement.oncanplay = () => {
                    clearTimeout(timeout);
                    resolve();
                };
            });
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`跳转到 ${time.toFixed(2)}s 超时`));
            }, 10000);
            
            // 使用 once 确保事件只触发一次
            const onSeeked = () => {
                clearTimeout(timeout);
                this.videoElement.onseeked = null;
                this.videoElement.onerror = null;
                resolve();
            };
            
            const onError = () => {
                clearTimeout(timeout);
                this.videoElement.onseeked = null;
                this.videoElement.onerror = null;
                const error = this.videoElement.error;
                const msg = error ? `视频seek失败 (code: ${error.code}, message: ${error.message || '未知'})` : '视频seek失败';
                reject(new Error(msg));
            };
            
            this.videoElement.onseeked = onSeeked;
            this.videoElement.onerror = onError;
            this.videoElement.currentTime = time;
        });
    }

    // 视频转MP4 (优化版：支持音轨合并 + requestAnimationFrame)
    async convertToMP4(videoFrames, totalDuration) {
        if (!Array.isArray(videoFrames) || videoFrames.length === 0) {
            throw new Error('无效的视频帧数组');
        }

        const firstFrame = videoFrames[0];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = firstFrame.width;
        canvas.height = firstFrame.height;

        // 计算帧率：总帧数 / 总时长
        const fps = Math.round(videoFrames.length / totalDuration);
        // 每帧的持续时间（秒）
        const frameDuration = 1 / fps;
        const frameInterval = frameDuration * 1000; // ms

        console.log(`转换MP4: ${videoFrames.length} 帧, 总时长 ${totalDuration.toFixed(2)}s, 帧率 ${fps}fps`);

        const videoStream = canvas.captureStream(fps);
        
        // 尝试获取音频轨道
        let audioTrack = null;
        try {
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
            'video/mp4;codecs=avc1,mp4a.40.2',
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
                if (audioTrack) audioTrack.stop();
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
                this.videoElement.volume = 0;
                this.videoElement.currentTime = videoFrames[0].timestamp || 0;
                this.videoElement.play().catch(e => console.warn('音频预览播放受阻:', e));
            }

            let frameIndex = 0;
            let lastFrameTime = 0;

            const drawNextFrame = (timestamp) => {
                if (frameIndex >= validFrames.length) {
                    recorder.stop();
                    this.videoElement.pause();
                    return;
                }

                // 使用requestAnimationFrame实现精确帧率
                if (!lastFrameTime || (timestamp - lastFrameTime) >= frameInterval) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(validFrames[frameIndex], 0, 0);
                    frameIndex++;
                    lastFrameTime = timestamp;
                }

                requestAnimationFrame(drawNextFrame);
            };

            requestAnimationFrame(drawNextFrame);
        });
    }

    // 修复MP4文件头
    async fixMP4Header(blob) {
        return blob;
    }

    // 清理资源
    cleanup() {
        if (this.videoElement.src) {
            URL.revokeObjectURL(this.videoElement.src);
            this.videoElement.src = '';
        }
        this.originalBlob = null;
        this.isTrimmed = false;
    }
}
