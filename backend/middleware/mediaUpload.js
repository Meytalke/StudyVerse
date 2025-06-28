const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const config = require('../config/config');

cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET
});

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/quicktime'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            console.log(`mediaUpload: File type ${file.mimetype} is allowed.`);
            cb(null, true);
        } else {
            console.warn(`mediaUpload: File type ${file.mimetype} is NOT allowed.`);
            cb(new Error('Unsupported file type. Please upload an image (JPG, PNG, GIF, WebP) or a short video (MP4, WebM, MOV).'), false);
        }
    }
});

const uploadToCloudinary = async (req, res, next) => {
    if (!req.file) {
        console.log('mediaUpload: No file received from Multer. Skipping Cloudinary upload.');
        req.mediaUrl = null;
        req.mediaType = null;
        return next();
    }

    console.log(`mediaUpload: File received - Name: ${req.file.originalname}, Size: ${req.file.size} bytes, Type: ${req.file.mimetype}`);

    try {
        let result;
        const fileBuffer = req.file.buffer;
        const mimetype = req.file.mimetype;

        const base64File = `data:${mimetype};base64,${fileBuffer.toString('base64')}`;

        if (mimetype.startsWith('image/')) {
            result = await cloudinary.uploader.upload(base64File, {
                folder: 'studyverse_posts_images',
                resource_type: 'image'
            });
        } else if (mimetype.startsWith('video/')) {
            result = await cloudinary.uploader.upload(base64File, {
                folder: 'studyverse_posts_videos',
                resource_type: 'video',
                chunk_size: 6000000
            });
        } else {
            console.error('mediaUpload: Unhandled file type passed to Cloudinary uploader:', mimetype);
            return res.status(400).json({ msg: 'Server error: Invalid file type detected during Cloudinary upload process.' });
        }

        req.mediaUrl = result.secure_url;
        req.mediaType = result.resource_type;

        console.log('mediaUpload: Successfully uploaded to Cloudinary. URL:', req.mediaUrl);
        next(); // Proceed to the next middleware/route handler

    } catch (err) {
        console.error('Cloudinary upload error in mediaUpload middleware:', err);
        req.mediaUrl = null;
        req.mediaType = null;
        return res.status(500).json({ msg: 'Media upload to Cloudinary failed.', error: err.message });
    }
};

module.exports = { upload, uploadToCloudinary };