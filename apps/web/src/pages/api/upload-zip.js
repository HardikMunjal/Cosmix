import AWS from 'aws-sdk';
import formidable from 'formidable';
import fs from 'fs';

const MAX_ZIP_UPLOAD_BYTES = 1024 * 1024 * 1024;

export const config = {
  api: {
    bodyParser: false, // disable default body parser for file upload
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

  try {
    const form = formidable({
      multiples: false,
      maxFiles: 1,
      maxFileSize: MAX_ZIP_UPLOAD_BYTES,
      maxTotalFileSize: MAX_ZIP_UPLOAD_BYTES,
    });
    
    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(400).json({ error: 'Parse error: ' + err.message });
      }

      let file = files.file;
      const username = fields.username?.[0] || 'unknown';

      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Handle both array and single object from formidable
      if (!Array.isArray(file)) {
        file = [file];
      }

      try {
        const uploadedFile = file[0];
        if (!uploadedFile || !uploadedFile.filepath) {
          return res.status(400).json({ error: 'File path not found' });
        }

        const originalName = uploadedFile.originalFilename || uploadedFile.filename || 'media.zip';
        const fileName = `zips/${username}/${Date.now()}_${originalName}`;
        const bucket = process.env.AWS_BUCKET;
        const region = process.env.AWS_REGION;

        // Upload to S3
        const params = {
          Bucket: bucket,
          Key: fileName,
          Body: fs.createReadStream(uploadedFile.filepath),
          ContentType: 'application/zip',
        };

        await s3.upload(params).promise();

        // Clean up temp file
        try {
          fs.unlinkSync(uploadedFile.filepath);
        } catch (e) {
          console.warn('Cleanup warning:', e.message);
        }

        return res.status(200).json({
          message: 'ZIP uploaded to S3',
          key: fileName,
          url: `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`,
        });
      } catch (uploadErr) {
        console.error('Upload error:', uploadErr);
        return res.status(500).json({ error: 'S3 upload failed: ' + uploadErr.message });
      }
    });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
