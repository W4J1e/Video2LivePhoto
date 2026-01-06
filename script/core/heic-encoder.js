// HEIC格式编码器
class HEICEncoder {
    // 初始化编码器
    constructor() {
        if (!window.HEICEncoder) {
            throw new Error('HEICEncoder库未加载');
        }
        this.encoder = new window.HEICEncoder();
    }
    
    // 编码图像数据为HEIC格式
    async encode(imageData, quality = 0.9) {
        try {
            const heicBlob = await this.encoder.encode(imageData, { quality });
            return heicBlob;
        } catch (error) {
            console.error('HEIC编码失败:', error);
            throw new Error('HEIC编码失败: ' + error.message);
        }
    }
    
    // 将视频帧序列编码为包含LivePhoto信息的HEIC
    async encodeLivePhoto(coverImage, frameSequence, duration) {
        try {
            // 准备封面图像
            const coverBitmap = await createImageBitmap(coverImage);
            
            // 准备帧序列（简化版，实际需要处理为HEIF中的motion metadata）
            const frameBitmaps = await Promise.all(
                frameSequence.map(frame => createImageBitmap(frame))
            );
            
            // 创建包含LivePhoto信息的HEIC文件
            // 注意：这是一个简化实现，实际需要按照HEIF规范构建复杂的metadata结构
            const heicBlob = await this.encoder.encodeLivePhoto(
                coverBitmap,
                frameBitmaps,
                { duration, fps: frameBitmaps.length / duration }
            );
            
            return heicBlob;
        } catch (error) {
            console.error('LivePhoto编码失败:', error);
            throw new Error('LivePhoto编码失败: ' + error.message);
        }
    }
}    