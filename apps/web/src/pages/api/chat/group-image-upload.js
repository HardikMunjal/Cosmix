import AWS from 'aws-sdk';
import formidable from 'formidable';
import fs from 'fs';

const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;

export const config = {
  api: {
    bodyParser: false,
  },
};

function resolveAwsUploadConfig() {
  const accessKeyId = process.env.AWS_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '';
  const bucket = process.env.AWS_BUCKET || process.env.AWS_S3_BUCKET || process.env.CHAT_S3_BUCKET || '';

  return {
    accessKeyId,
    secretAccessKey,
    region,
    bucket,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const awsConfig = resolveAwsUploadConfig();

  if (!awsConfig.bucket || !awsConfig.region) {
    return res.status(500).json({
      error: 'S3 configuration is missing. Please configure AWS_BUCKET and AWS_REGION in server environment.',
    });
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
      const s3 = new AWS.S3({
        region: awsConfig.region,
        ...(awsConfig.accessKeyId && awsConfig.secretAccessKey
          ? {
              accessKeyId: awsConfig.accessKeyId,
              secretAccessKey: awsConfig.secretAccessKey,
            }
          : {}),
      });

      try {
        await s3.upload({
          Bucket: awsConfig.bucket,
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
          url: `https://${awsConfig.bucket}.s3.${awsConfig.region}.amazonaws.com/${key}`,
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