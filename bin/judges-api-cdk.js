#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { JudgesApiCdkStack } = require('../lib/judges-api-cdk-stack');
const { DocdbStack } = require('../lib/docdb-stack');

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const docdbStack = new DocdbStack(app, 'DocdbStack', { env });

// Defina a região explicitamente ou use as variáveis de ambiente do CDK
// Se você tiver AWS_DEFAULT_REGION no seu .env e o carregar no ambiente,
// o CDK usará isso por padrão.
// Caso contrário, você pode especificar aqui:

new JudgesApiCdkStack(app, 'JudgesApiCdkStack', {
  env,
  vpc: docdbStack.vpc,
  docdbCluster: docdbStack.cluster,
  docdbSecurityGroup: docdbStack.securityGroup  
  
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: 'YOUR_ACCOUNT_ID', region: 'us-east-2' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});