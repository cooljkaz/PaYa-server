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
  domainName: 'api-staging.paya.cash', // Optional: change to your domain
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


