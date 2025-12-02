#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PaYaStack } from '../lib/paya-stack';

const app = new cdk.App();

// Staging environment
new PaYaStack(app, 'PaYaStackStaging', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment: 'staging',
  // No domain for staging - uses AWS-generated DNS (HTTP only)
  // This is acceptable for internal/staging use
  // domainName: 'api-staging.paya.cash', // Optional: uncomment to enable HTTPS
});

// Production environment
new PaYaStack(app, 'PaYaStackProduction', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment: 'production',
  domainName: 'api.paya.cash', // Your production domain
});


