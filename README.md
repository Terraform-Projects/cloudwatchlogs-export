## Overview
Function to export CloudWatch Logs to S3 Bucket on a daily basis


## How to use
1. Create S3 bucket


2. Update bucket policy
```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "s3:GetBucketAcl",
      "Effect": "Allow",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}",
      "Principal": {
        "Service": "logs.${REGION}.amazonaws.com"
      }
    },
    {
      "Action": "s3:PutObject",
      "Effect": "Allow",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control"
        }
      },
      "Principal": {
        "Service": "logs.${REGION}.amazonaws.com"
      }
    }
  ]
}
```


3. Create IAM Role for Lambda
```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:*:*:cloudwatchlogs-export"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:CreateExportTask",
        "logs:DescribeExportTasks",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```


4. Create Lambda Function
  - Replace function.json with your IAM Role Arn
```
git clone https://github.com/kazmsk/cloudwatchlogs-export.git
cd cloudwatchlogs-export
npm install
zip -r index.zip index.js node_modules
aws lambda create-function --cli-input-json fileb://function.json \
--zip-file fileb://index.zip
```


5. Create CloudWatch Events Rule for Lambda
  - Cron Sample  
    `0 2 * * ? *` Run every day at 2:00 am (UTC)
  - Events format
```
{
  "bucketName": "${BUCKET_NAME}",
  "logGroupList": [
    "${LOG_GROUP_NAME1}",
    "${LOG_GROUP_NAME2}",
    "${LOG_GROUP_NAME3}"
  ],
  "prefix": "${PREFIX}"
}
```