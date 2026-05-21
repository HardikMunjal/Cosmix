import AWS from 'aws-sdk';

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const s3Key = String(req.query?.s3Key || '').trim();
  if (!s3Key) {
    return res.status(400).json({ error: 's3Key query parameter is required.' });
  }

  const awsConfig = resolveAwsUploadConfig();
  if (!awsConfig.bucket || !awsConfig.region) {
    return res.status(500).json({
      error: 'S3 configuration is missing. Please configure AWS_BUCKET and AWS_REGION in server environment.',
    });
  }

  try {
    const s3 = new AWS.S3({
      region: awsConfig.region,
      ...(awsConfig.accessKeyId && awsConfig.secretAccessKey
        ? {
            accessKeyId: awsConfig.accessKeyId,
            secretAccessKey: awsConfig.secretAccessKey,
          }
        : {}),
    });

    const url = await s3.getSignedUrlPromise('getObject', {
      Bucket: awsConfig.bucket,
      Key: s3Key,
      Expires: 60 * 10,
      ResponseContentDisposition: `attachment; filename="${s3Key.split('/').pop() || 'image'}"`,
    });

    return res.status(200).json({ url });
  } catch (error) {
    console.error('S3 download URL generation failed:', error);
    return res.status(500).json({ error: `Could not generate download URL: ${error.message}` });
  }
}
