import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bucket = process.env.AWS_BUCKET;
    const region = process.env.AWS_REGION;
    const params = {
      Bucket: bucket,
      Prefix: "zips/",
      MaxKeys: 1000,
    };

    console.log('Listing ZIPs from S3:', params);

    const data = await s3.listObjectsV2(params).promise();

    console.log('S3 list response:', { totalObjects: data.Contents?.length });

    if (!data.Contents) {
      return res.status(200).json([]);
    }

    const zips = data.Contents
      .filter(obj => obj.Key.endsWith('.zip'))
      .map((obj) => ({
        key: obj.Key,
        name: obj.Key.split('/').pop(),
        size: obj.Size,
        uploadedAt: obj.LastModified,
        url: `https://${bucket}.s3.${region}.amazonaws.com/${obj.Key}`,
      }));

    console.log('Returning ZIPs:', zips.length);

    return res.status(200).json(zips);
  } catch (err) {
    console.error('List error:', err);
    return res.status(500).json({ error: 'Failed to list ZIPs: ' + err.message });
  }
}
