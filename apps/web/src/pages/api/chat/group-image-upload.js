import AWS from 'aws-sdk';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

function detectMediaType(mimetype, filename) {
  const mime = String(mimetype || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(name)) return 'video';
  return 'image';
}

function maxBytesForFile(mimetype, filename) {
  return detectMediaType(mimetype, filename) === 'video' ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const entries = {};
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index < 1) return;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key) entries[key] = value;
    });
    return entries;
  } catch (_) {
    return {};
  }
}

function resolveAwsUploadConfig() {
  const repoRootEnv = loadEnvFile(path.resolve(process.cwd(), '../../.env'));
  const webRootEnv = loadEnvFile(path.resolve(process.cwd(), '.env'));
  const env = { ...repoRootEnv, ...webRootEnv, ...process.env };

  const accessKeyId = env.AWS_ACCESS_KEY || env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = env.AWS_SECRET_KEY || env.AWS_SECRET_ACCESS_KEY || '';
  const region = env.AWS_REGION || env.AWS_DEFAULT_REGION || '';
  const bucket = env.AWS_BUCKET || env.AWS_S3_BUCKET || env.CHAT_S3_BUCKET || '';

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
      multiples: true,
      maxFiles: 25,
      maxFileSize: MAX_VIDEO_UPLOAD_BYTES,
      maxTotalFileSize: MAX_VIDEO_UPLOAD_BYTES * 10,
    });

    form.parse(req, async (error, fields, files) => {
      if (error) {
        return res.status(400).json({ error: `Parse error: ${error.message}` });
      }

      const username = fields.username?.[0] || 'unknown';
      const groupId = fields.groupId?.[0] || 'general';
      const folderNameRaw = fields.folderName?.[0] || '';
      const purposeRaw = fields.purpose?.[0] || '';
      const purpose = String(purposeRaw).trim().toLowerCase();
      const folderName = purpose === 'cover'
        ? 'cover'
        : String(folderNameRaw)
          .trim()
          .replace(/[^a-zA-Z0-9-_ ]/g, '')
          .replace(/\s+/g, '-')
          .slice(0, 80);

      let file = files.files || files.file;

      if (!file) {
        return res.status(400).json({ error: 'No file provided.' });
      }

      if (!Array.isArray(file)) {
        file = [file];
      }

      const s3 = new AWS.S3({
        region: awsConfig.region,
        ...(awsConfig.accessKeyId && awsConfig.secretAccessKey
          ? {
              accessKeyId: awsConfig.accessKeyId,
              secretAccessKey: awsConfig.secretAccessKey,
            }
          : {}),
      });

      const uploads = [];
      try {
        for (const uploadedFile of file) {
          if (!uploadedFile?.filepath) continue;
          const originalName = uploadedFile.originalFilename || uploadedFile.filename || 'group-image';
          const mediaType = detectMediaType(uploadedFile.mimetype, originalName);
          const fileLimit = maxBytesForFile(uploadedFile.mimetype, originalName);
          const fileSize = Number(uploadedFile.size || 0);
          if (fileSize > fileLimit) {
            throw new Error(`${mediaType === 'video' ? 'Video' : 'Image'} exceeds size limit.`);
          }
          const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : (mediaType === 'video' ? '.mp4' : '.jpg');
          const folderSegment = folderName ? `${folderName}/` : '';
          const key = `chat-groups/${groupId}/${folderSegment}${username}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;

          await s3.upload({
            Bucket: awsConfig.bucket,
            Key: key,
            Body: fs.createReadStream(uploadedFile.filepath),
            ContentType: uploadedFile.mimetype || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
          }).promise();

          uploads.push({
            key,
            url: `https://${awsConfig.bucket}.s3.${awsConfig.region}.amazonaws.com/${key}`,
            mediaType,
          });

          try {
            fs.unlinkSync(uploadedFile.filepath);
          } catch (cleanupError) {
            console.warn('Cleanup warning:', cleanupError.message);
          }
        }

        if (!uploads.length) {
          return res.status(400).json({ error: 'No valid files were uploaded.' });
        }

        return res.status(200).json({
          uploads,
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