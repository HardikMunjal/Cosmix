import AWS from 'aws-sdk';
import formidable from 'formidable';
import fs from 'fs';

const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;

export const config = {
  api: {
    bodyParser: false,
  },
};

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.AWS_BUCKET || !process.env.AWS_REGION) {
    return res.status(500).json({ error: 'S3 configuration is missing.' });
  }

  try {
    const form = formidable({
      multiples: false,
      maxFiles: 1,
      maxFileSize: MAX_IMAGE_UPLOAD_BYTES,
      maxTotalFileSize: MAX_IMAGE_UPLOAD_BYTES,
    });

    form.parse(req, async (error, fields, files) => {
      if (error) {
        return res.status(400).json({ error: `Parse error: ${error.message}` });
      }

      const username = fields.username?.[0] || 'unknown';
      const groupId = fields.groupId?.[0] || 'general';
      let file = files.file;

      if (!file) {
        return res.status(400).json({ error: 'No file provided.' });
      }

      if (!Array.isArray(file)) {
        file = [file];
      }

      const uploadedFile = file[0];
      if (!uploadedFile?.filepath) {
        return res.status(400).json({ error: 'Uploaded file path is missing.' });
      }

      const originalName = uploadedFile.originalFilename || uploadedFile.filename || 'group-image';
      const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '.jpg';
      const key = `chat-groups/${groupId}/${username}/${Date.now()}${extension}`;

      try {
        await s3.upload({
          Bucket: process.env.AWS_BUCKET,
          Key: key,
          Body: fs.createReadStream(uploadedFile.filepath),
          ContentType: uploadedFile.mimetype || 'image/jpeg',
        }).promise();

        try {
          fs.unlinkSync(uploadedFile.filepath);
        } catch (cleanupError) {
          console.warn('Cleanup warning:', cleanupError.message);
        }

        return res.status(200).json({
          key,
          url: `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
        });
      } catch (uploadError) {
        console.error('S3 upload failed:', uploadError);
        return res.status(500).json({ error: `S3 upload failed: ${uploadError.message}` });
      }
    });
  } catch (error) {
    console.error('Upload handler failed:', error);
    return res.status(500).json({ error: 'Internal upload failure.' });
  }
}