/**
 * Config Compliance sync worker — pulls AWS Config rule compliance per account.
 */
const {
  ConfigServiceClient,
  DescribeComplianceByConfigRuleCommand,
  GetComplianceDetailsByConfigRuleCommand,
} = require('@aws-sdk/client-config-service');
const { runSyncForAllAccounts, REGION } = require('./engine');

const MAX_NON_COMPLIANT_RULES_DETAIL = 50;

async function syncAccount(credentials, account, pool) {
  const client = new ConfigServiceClient({ region: REGION, credentials });
  let totalRecords = 0;

  // Get rule-level compliance
  let nextToken;
  const nonCompliantRules = [];

  do {
    let res;
    try {
      res = await client.send(new DescribeComplianceByConfigRuleCommand({
        ComplianceTypes: ['COMPLIANT', 'NON_COMPLIANT', 'NOT_APPLICABLE', 'INSUFFICIENT_DATA'],
        NextToken: nextToken,
      }));
    } catch (err) {
      if (err.name === 'NoSuchConfigRuleException' ||
          err.name === 'NoAvailableConfigurationRecorderException') {
        return 0;
      }
      throw err;
    }

    for (const rule of (res.ComplianceByConfigRules || [])) {
      const compType = rule.Compliance?.ComplianceType || 'INSUFFICIENT_DATA';
      const cappedCount = rule.Compliance?.ComplianceContributorCount?.CappedCount || 0;

      const compliantCount = compType === 'COMPLIANT' ? cappedCount : 0;
      const nonCompliantCount = compType === 'NON_COMPLIANT' ? cappedCount : 0;

      await pool.query(
        `INSERT INTO config_compliance
           (account_id, config_rule_name, compliance_type, compliant_count, non_compliant_count, aws_region, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (account_id, config_rule_name, aws_region)
         DO UPDATE SET
           compliance_type = EXCLUDED.compliance_type,
           compliant_count = EXCLUDED.compliant_count,
           non_compliant_count = EXCLUDED.non_compliant_count,
           updated_at = NOW()`,
        [account.account_id, rule.ConfigRuleName, compType, compliantCount, nonCompliantCount, REGION]
      );
      totalRecords++;

      if (compType === 'NON_COMPLIANT') {
        nonCompliantRules.push(rule.ConfigRuleName);
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  // Fetch details for non-compliant rules (capped)
  for (const ruleName of nonCompliantRules.slice(0, MAX_NON_COMPLIANT_RULES_DETAIL)) {
    let detailToken;
    do {
      const res = await client.send(new GetComplianceDetailsByConfigRuleCommand({
        ConfigRuleName: ruleName,
        ComplianceTypes: ['NON_COMPLIANT'],
        NextToken: detailToken,
        Limit: 100,
      }));

      for (const eval_ of (res.EvaluationResults || [])) {
        const qualifier = eval_.EvaluationResultIdentifier?.EvaluationResultQualifier;
        if (!qualifier?.ResourceId) continue;

        await pool.query(
          `INSERT INTO config_compliance_details
             (account_id, config_rule_name, resource_type, resource_id, compliance_type, annotation, ordering_timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (account_id, config_rule_name, resource_id)
           DO UPDATE SET
             compliance_type = EXCLUDED.compliance_type,
             annotation = EXCLUDED.annotation,
             ordering_timestamp = EXCLUDED.ordering_timestamp`,
          [
            account.account_id, ruleName,
            qualifier.ResourceType, qualifier.ResourceId,
            eval_.ComplianceType || 'NON_COMPLIANT',
            eval_.Annotation || null,
            eval_.ResultRecordedTime || null,
          ]
        );
        totalRecords++;
      }

      detailToken = res.NextToken;
    } while (detailToken);
  }

  return totalRecords;
}

async function syncAll() {
  return runSyncForAllAccounts('config-compliance', syncAccount);
}

module.exports = { syncAll };
