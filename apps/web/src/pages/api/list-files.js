// import AWS from 'aws-sdk';

// const s3 = new AWS.S3({
//   accessKeyId: process.env.AWS_ACCESS_KEY,
//   secretAccessKey: process.env.AWS_SECRET_KEY,
//   region: process.env.AWS_REGION,
// });

// export default async function handler(req, res) {
//   try {
//     const data = await s3.listObjectsV2({
//       Bucket: process.env.AWS_BUCKET,
//     }).promise();

//     const files = data.Contents.map(item => ({
//       key: item.Key,
//       size: item.Size,
//       url: `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${item.Key}`,
//     }));

//     res.status(200).json(files);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Failed to list files' });
//   }
// }


import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

export default async function handler(req, res) {
  try {
    const bucket = process.env.AWS_BUCKET;
    const region = process.env.AWS_REGION;

    console.log('Bucket:', bucket);
    console.log('Region:', region);

    const data = await s3
      .listObjectsV2({
        Bucket: bucket,
      })
      .promise();

    console.log('S3 DATA:', data);

    if (!data.Contents) {
      return res.status(200).json({ files: [] });
    }

    const files = data.Contents
      .map(item => item.Key)
      .filter(key => key.endsWith('.zip'))
      .map(
        key =>
          `https://${bucket}.s3.${region}.amazonaws.com/${key}`
      );

    res.status(200).json({ files });
  } catch (err) {
    console.error('S3 ERROR:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
}