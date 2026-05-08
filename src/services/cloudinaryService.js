const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(filePath, originalName) {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: 'recruiter-ai/resumes',
    resource_type: 'raw',
    public_id: `${Date.now()}-${originalName.replace(/\s+/g, '_')}`,
    use_filename: false,
  });

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return {
    public_id: result.public_id,
    url: result.secure_url,
  };
}

async function deleteFromCloudinary(publicId) {
  await cloudinary.uploader.destroy(publicId, {
    resource_type: 'raw',
  });
}

function getDownloadUrl(publicId) {
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    secure: true,
  });
}

module.exports = { uploadToCloudinary, deleteFromCloudinary, getDownloadUrl };