import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'No key provided' });
  }

  try {
    const params = {
      Bucket: process.env.AWS_BUCKET,
      Key: key,
    };

    await s3.deleteObject(params).promise();

    return res.status(200).json({ message: 'ZIP deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: 'Failed to delete ZIP' });
  }
}
