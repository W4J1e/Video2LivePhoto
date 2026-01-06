// 文件验证工具函数
class FileValidator {
    // 验证文件类型是否合法
    static isValidFileType(file, allowedTypes) {
        if (!file) {
            return { valid: false, message: '未选择文件' };
        }
        
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const mimeTypeMatch = allowedTypes.some(type => 
            file.type.startsWith(type) || 
            (type === 'image' && file.type.startsWith('image/')) || 
            (type === 'video' && file.type.startsWith('video/'))
        );
        
        if (!mimeTypeMatch) {
            return { 
                valid: false, 
                message: `不支持的文件类型: ${file.type}，请上传${allowedTypes.join('或')}类型的文件` 
            };
        }
        
        return { valid: true };
    }
    
    // 验证文件大小是否超出限制
    static isFileSizeValid(file, maxSizeInMB) {
        const fileSizeInMB = file.size / (1024 * 1024);
        if (fileSizeInMB > maxSizeInMB) {
            return { 
                valid: false, 
                message: `文件大小超出限制: ${fileSizeInMB.toFixed(2)}MB > ${maxSizeInMB}MB` 
            };
        }
        
        return { valid: true };
    }
    
    // 验证视频时长是否符合要求
    static async isVideoDurationValid(videoFile, maxDurationInSeconds) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            
            video.onloadedmetadata = () => {
                window.URL.revokeObjectURL(video.src);
                if (video.duration > maxDurationInSeconds) {
                    resolve({ 
                        valid: false, 
                        message: `视频时长超出限制: ${video.duration.toFixed(1)}秒 > ${maxDurationInSeconds}秒` 
                    });
                } else {
                    resolve({ valid: true });
                }
            };
            
            video.onerror = () => {
                window.URL.revokeObjectURL(video.src);
                resolve({ valid: false, message: '无法读取视频时长' });
            };
            
            video.src = window.URL.createObjectURL(videoFile);
        });
    }
}    