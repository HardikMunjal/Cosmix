import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

export default async function handler(req, res) {
  const { fileName, fileType, folder } = req.body;

  const params = {
    Bucket: process.env.AWS_BUCKET,
    Key: `${folder}/${Date.now()}-${fileName}`,
    Expires: 60,
    ContentType: fileType,
  };

  try {
    const uploadURL = await s3.getSignedUrlPromise('putObject', params);
    res.status(200).json({ uploadURL });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate URL' });
  }
}