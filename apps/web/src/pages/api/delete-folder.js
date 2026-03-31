import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

export default async function handler(req, res) {
  const { folder } = req.body;

  try {
    const listed = await s3.listObjectsV2({
      Bucket: process.env.AWS_BUCKET,
      Prefix: folder,
    }).promise();

    const objects = listed.Contents.map(obj => ({
      Key: obj.Key,
    }));

    if (!objects.length) {
      return res.status(200).json({ message: 'Folder empty' });
    }

    await s3.deleteObjects({
      Bucket: process.env.AWS_BUCKET,
      Delete: { Objects: objects },
    }).promise();

    res.status(200).json({ message: 'Folder deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
}