import { VideoProcessor } from './video-processor.js';

export class LivePhotoBuilder {
    constructor(videoProcessor) {
        this.coverImage = null;
        this.videoFrames = [];
        this.frameDuration = 0;
        this.videoProcessor = videoProcessor;
    }
    
    setCoverImage(blob) {
        this.coverImage = blob;
    }
    
    setVideoFrames(frames, duration) {
        this.videoFrames = frames;
        this.frameDuration = duration;
    }
    
    async build(format = 'google') {
        if (!this.coverImage) throw new Error('请先设置封面图片');
        
        try {
            const coverArrayBuffer = await this.coverImage.arrayBuffer();
            let videoBlob;
            
            // 优化：如果有原始视频 Blob 且未做剪辑，直接使用原始数据以保证画质和声音
            if (this.videoProcessor.originalBlob && !this.videoProcessor.isTrimmed) {
                videoBlob = this.videoProcessor.originalBlob;
                console.log('检测到未剪辑，直接使用原始视频以保证画质和原音');
            } else {
                if (!Array.isArray(this.videoFrames) || this.videoFrames.length === 0) {
                    throw new Error('无效的视频帧');
                }
                videoBlob = await this.videoProcessor.convertToMP4(this.videoFrames, this.frameDuration);
            }

            if (!videoBlob?.size) throw new Error('视频处理失败');
            const videoArrayBuffer = await videoBlob.arrayBuffer();

            const timestamp = new Date().getTime();
            const fileName = `livephoto_${timestamp}`;

            if (format === 'apple') {
                return {
                    blob: await this._createAppleLivePhoto(coverArrayBuffer, videoArrayBuffer),
                    fileName: `${fileName}.zip`,
                    type: 'apple'
                };
            } else {
                return {
                    blob: this.createMotionPhoto(coverArrayBuffer, videoArrayBuffer),
                    fileName: `${fileName}.jpg`,
                    type: 'google'
                };
            }
        } catch (error) {
            console.error('生成失败:', error);
            throw error;
        }
    }

    createMotionPhoto(coverData, videoData) {
        const coverUint8 = new Uint8Array(coverData);
        const videoSize = videoData.byteLength;
        const assetId = this._generateUUID();

        // 针对群晖和 Windows 优化的 XMP 结构
        // 同时保留 MotionPhotoVideoOffset 和 MicroVideoOffset 以获得最大兼容性
        const xmpContent = 
            '<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
            '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.0-jc003">\n' +
            '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
            '    <rdf:Description rdf:about=""\n' +
            '      xmlns:GCamera="http://ns.google.com/photos/1.0/camera/"\n' +
            '      GCamera:MotionPhoto="1"\n' +
            '      GCamera:MotionPhotoVersion="1"\n' +
            '      GCamera:MotionPhotoPresentationTimestampUs="0"\n' +
            '      GCamera:MicroVideo="1"\n' +
            '      GCamera:MicroVideoVersion="1"\n' +
            '      GCamera:MicroVideoOffset="' + videoSize + '"\n' +
            '      GCamera:MotionPhotoVideoOffset="' + videoSize + '">\n' +
            '    </rdf:Description>\n' +
            '  </rdf:RDF>\n' +
            '</x:xmpmeta>\n' +
            '<?xpacket end="w"?>';

        const xmpNamespace = 'http://ns.adobe.com/xap/1.0/\x00';
        const xmpData = new TextEncoder().encode(xmpNamespace + xmpContent);
        
        const app1Segment = new Uint8Array(xmpData.byteLength + 4);
        const app1View = new DataView(app1Segment.buffer);
        app1View.setUint16(0, 0xFFE1);
        app1View.setUint16(2, xmpData.byteLength + 2);
        app1Segment.set(xmpData, 4);

        // 优化注入位置：寻找第一个标记之后的位置
        let insertPos = 2; 
        if (coverUint8[2] === 0xFF && coverUint8[3] === 0xE0) {
            insertPos = 4 + ((coverUint8[4] << 8) | coverUint8[5]);
        }

        return new Blob([
            coverUint8.slice(0, insertPos),
            app1Segment,
            coverUint8.slice(insertPos),
            videoData
        ], { type: 'image/jpeg' });
    }

    _generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async _createAppleLivePhoto(coverData, videoData) {
        if (typeof JSZip === 'undefined') {
            throw new Error('未加载 JSZip 库，无法生成 Apple 格式');
        }
        const zip = new JSZip();
        zip.file('IMG.JPG', coverData);
        zip.file('IMG.MOV', videoData);
        return await zip.generateAsync({ type: 'blob' });
    }
}