/**
 * CloudTrail S3 Log sync worker — discovers trail S3 bucket via DescribeTrails,
 * lists recent log files, downloads + gunzips + parses JSON records, and upserts
 * them into log_entries for the Log Explorer.
 */
const { CloudTrailClient, DescribeTrailsCommand } = require('@aws-sdk/client-cloudtrail');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { createGunzip } = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { runSyncForAllAccounts, REGION } = require('./engine');

const LOOKBACK_HOURS = parseInt(process.env.LOG_LOOKBACK_HOURS, 10) || 24;
const MAX_FILES_PER_SYNC = parseInt(process.env.LOG_MAX_FILES, 10) || 200;
const MAX_RECORDS_PER_SYNC = parseInt(process.env.LOG_MAX_RECORDS, 10) || 10000;

/**
 * Build the S3 prefix for CloudTrail logs for a given date.
 * Format: AWSLogs/{accountId}/CloudTrail/{region}/{year}/{month}/{day}/
 */
function buildPrefix(bucket, accountId, region, date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `AWSLogs/${accountId}/CloudTrail/${region}/${y}/${m}/${d}/`;
}

/**
 * Stream-decompress a gzipped S3 object body into a string.
 */
async function decompressStream(body) {
  const chunks = [];
  const gunzip = createGunzip();

  // S3 body is a readable stream
  const input = body instanceof Readable ? body : Readable.from(body);
  input.pipe(gunzip);

  for await (const chunk of gunzip) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Sync CloudTrail S3 logs for a single account.
 */
async function syncAccount(credentials, account, pool) {
  const ctClient = new CloudTrailClient({ region: REGION, credentials });

  // Step 1: Discover the CloudTrail S3 bucket
  let trailBucket = null;
  let trailPrefix = '';
  let trailRegions = [REGION];

  try {
    const trails = await ctClient.send(new DescribeTrailsCommand({}));
    const trail = (trails.trailList || []).find(t => t.IsMultiRegionTrail) ||
                  (trails.trailList || [])[0];

    if (!trail || !trail.S3BucketName) {
      console.warn(`[cloudtrail-s3] No trail found for ${account.account_id}`);
      return 0;
    }

    trailBucket = trail.S3BucketName;
    trailPrefix = trail.S3KeyPrefix || '';
    // If multi-region trail, pull logs from the home region
    // (logs from all regions land in the same bucket under region-specific prefixes)
    if (trail.IsMultiRegionTrail) {
      trailRegions = [trail.HomeRegion || REGION];
    }

    console.log(`[cloudtrail-s3] Account ${account.account_id}: bucket=${trailBucket}, prefix=${trailPrefix || '(none)'}`);
  } catch (err) {
    console.warn(`[cloudtrail-s3] DescribeTrails failed for ${account.account_id}: ${err.message}`);
    return 0;
  }

  // Step 2: Determine which S3 bucket to read from
  // The trail bucket may be in a different account (centralized logging).
  // We try to read with the assumed credentials first.
  const s3Client = new S3Client({ region: REGION, credentials });

  // Step 3: Build prefixes for the lookback period
  const now = new Date();
  const cutoff = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);
  const prefixes = [];

  // We need prefixes for each day + region in the lookback window
  const regions = trailRegions;
  for (let d = new Date(cutoff); d <= now; d.setUTCDate(d.getUTCDate() + 1)) {
    for (const region of regions) {
      const base = trailPrefix ? `${trailPrefix}/` : '';
      prefixes.push(`${base}AWSLogs/${account.account_id}/CloudTrail/${region}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/`);
    }
  }

  // Step 4: List and download log files
  let totalRecords = 0;
  let filesProcessed = 0;

  for (const prefix of prefixes) {
    if (filesProcessed >= MAX_FILES_PER_SYNC || totalRecords >= MAX_RECORDS_PER_SYNC) break;

    let continuationToken;
    do {
      if (filesProcessed >= MAX_FILES_PER_SYNC || totalRecords >= MAX_RECORDS_PER_SYNC) break;

      let listResult;
      try {
        listResult = await s3Client.send(new ListObjectsV2Command({
          Bucket: trailBucket,
          Prefix: prefix,
          MaxKeys: 100,
          ContinuationToken: continuationToken,
        }));
      } catch (err) {
        // Access denied is common for cross-account buckets
        if (err.name === 'AccessDenied' || err.Code === 'AccessDenied') {
          console.warn(`[cloudtrail-s3] Access denied listing ${trailBucket}/${prefix} for ${account.account_id}`);
          break;
        }
        throw err;
      }

      const objects = (listResult.Contents || [])
        .filter(obj => obj.Key.endsWith('.json.gz'))
        .filter(obj => obj.LastModified >= cutoff);

      for (const obj of objects) {
        if (filesProcessed >= MAX_FILES_PER_SYNC || totalRecords >= MAX_RECORDS_PER_SYNC) break;

        try {
          const getResult = await s3Client.send(new GetObjectCommand({
            Bucket: trailBucket,
            Key: obj.Key,
          }));

          const jsonStr = await decompressStream(getResult.Body);
          const data = JSON.parse(jsonStr);
          const records = data.Records || [];

          for (const record of records) {
            if (totalRecords >= MAX_RECORDS_PER_SYNC) break;

            const eventTime = record.eventTime ? new Date(record.eventTime) : null;
            if (!eventTime || eventTime < cutoff) continue;

            const userIdentity = record.userIdentity || {};
            const username = userIdentity.userName ||
              userIdentity.principalId?.split(':').pop() ||
              userIdentity.arn?.split('/').pop() ||
              userIdentity.invokedBy ||
              'unknown';

            try {
              await pool.query(
                `INSERT INTO log_entries
                   (account_id, event_id, event_time, event_name, event_source,
                    aws_region, event_type, username, user_type, source_ip, user_agent,
                    request_params, response_elements, resources, error_code, error_message,
                    read_only, management_event, recipient_account, shared_event_id,
                    vpc_endpoint_id, raw_event)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
                 ON CONFLICT (event_id) DO NOTHING`,
                [
                  account.account_id,
                  record.eventID,
                  eventTime,
                  record.eventName,
                  record.eventSource || '',
                  record.awsRegion || REGION,
                  record.eventType || null,
                  username,
                  userIdentity.type || null,
                  record.sourceIPAddress || null,
                  record.userAgent || null,
                  JSON.stringify(record.requestParameters || null),
                  JSON.stringify(record.responseElements || null),
                  JSON.stringify(record.resources || []),
                  record.errorCode || null,
                  record.errorMessage || null,
                  record.readOnly === true || record.readOnly === 'true',
                  record.managementEvent !== false,
                  record.recipientAccountId || null,
                  record.sharedEventID || null,
                  record.vpcEndpointId || null,
                  JSON.stringify(record),
                ]
              );
              totalRecords++;
            } catch (dbErr) {
              // Skip individual record errors (e.g. data too long)
              if (!dbErr.message.includes('duplicate key')) {
                console.warn(`[cloudtrail-s3] Record insert error: ${dbErr.message}`);
              }
            }
          }

          filesProcessed++;
        } catch (fileErr) {
          console.warn(`[cloudtrail-s3] Failed to process ${obj.Key}: ${fileErr.message}`);
        }
      }

      continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  console.log(`[cloudtrail-s3] Account ${account.account_id}: ${filesProcessed} files, ${totalRecords} records`);
  return totalRecords;
}

async function syncAll() {
  return runSyncForAllAccounts('cloudtrail-s3', syncAccount);
}

module.exports = { syncAll };
