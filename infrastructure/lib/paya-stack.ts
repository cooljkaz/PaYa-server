import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
// Removed RDS - using Supabase PostgreSQL instead
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface PaYaStackProps extends cdk.StackProps {
  environment: 'staging' | 'production';
  domainName?: string;
}

export class PaYaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PaYaStackProps) {
    super(scope, id, props);

    const { environment, domainName } = props;

    // ==================== VPC ====================
    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 2, // Use 2 Availability Zones for high availability
      natGateways: environment === 'production' ? 2 : 1, // Production: 2, Staging: 1
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ==================== Secrets ====================
    // Using Supabase PostgreSQL - store connection string in secrets
    const appSecrets = new secretsmanager.Secret(this, 'AppSecrets', {
      secretName: `paya-${environment}-app-secrets`,
      description: 'Application secrets (JWT, API keys, Supabase DATABASE_URL, etc.)',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          // Supabase connection string - set this manually after creating secret
          databaseUrl: 'postgresql://user:password@host:5432/dbname?sslmode=require',
          jwtAccessSecret: 'placeholder',
          jwtRefreshSecret: 'placeholder',
          // Redis URL - will be populated after Redis is created
          redisUrl: '',
          // Twilio SMS
          twilioAccountSid: '',
          twilioAuthToken: '',
          twilioPhoneNumber: '',
          // Plaid bank linking
          plaidClientId: '',
          plaidSecret: '',
          plaidEnv: 'sandbox',
          // Synctera BaaS
          syncteraApi: '',
          syncteraEnv: 'sandbox',
          syncteraWebhookSecret: '',
          syncteraAccountTemplateId: '',
        }),
        generateStringKey: 'encryptionKey',
      },
    });

    // ==================== Redis (ElastiCache) ====================
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for PaYa Redis',
      subnetIds: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Security group for Redis',
      allowAllOutbound: false,
    });

    // Cost-optimized Redis (single node for staging)
    const redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: `PaYa ${environment} Redis cache`,
      cacheNodeType: 'cache.t3.micro', // Always use micro to save costs
      engine: 'redis',
      engineVersion: '7.0',
      numCacheClusters: 1, // Single node for cost savings
      automaticFailoverEnabled: false, // Disabled to save costs
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: false, // Disable transit encryption to reduce costs
      port: 6379,
    });

    // ==================== ECR Repository ====================
    // Import existing repository (already created with Docker image)
    const repository = ecr.Repository.fromRepositoryName(
      this,
      'ECRRepository',
      `paya-${environment}`
    );

    // ==================== ECS Cluster ====================
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsights: true,
    });

    // ==================== Task Role ====================
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Role for ECS task execution',
    });

    // Grant task role access to secrets
    appSecrets.grantRead(taskRole);

    // ==================== Construct Connection URLs ====================
    // Note: These will be set via environment variables that reference secrets
    // The app will construct full URLs from these components

    // ==================== Fargate Service ====================
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'FargateService', {
      cluster,
      cpu: environment === 'production' ? 1024 : 512,
      memoryLimitMiB: environment === 'production' ? 2048 : 1024,
      desiredCount: environment === 'production' ? 2 : 1,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
        containerPort: 3000,
        secrets: {
          // Supabase PostgreSQL connection string
          DATABASE_URL: ecs.Secret.fromSecretsManager(appSecrets, 'databaseUrl'),
          // App secrets
          JWT_ACCESS_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'jwtAccessSecret'),
          JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'jwtRefreshSecret'),
          // Redis URL - will be populated after Redis is created
          REDIS_URL: ecs.Secret.fromSecretsManager(appSecrets, 'redisUrl'),
          // Twilio SMS
          TWILIO_ACCOUNT_SID: ecs.Secret.fromSecretsManager(appSecrets, 'twilioAccountSid'),
          TWILIO_AUTH_TOKEN: ecs.Secret.fromSecretsManager(appSecrets, 'twilioAuthToken'),
          TWILIO_PHONE_NUMBER: ecs.Secret.fromSecretsManager(appSecrets, 'twilioPhoneNumber'),
          // Plaid bank linking
          PLAID_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, 'plaidClientId'),
          PLAID_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'plaidSecret'),
          // Synctera BaaS
          SYNCTERA_API: ecs.Secret.fromSecretsManager(appSecrets, 'syncteraApi'),
          SYNCTERA_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'syncteraWebhookSecret'),
          SYNCTERA_ACCOUNT_TEMPLATE_ID: ecs.Secret.fromSecretsManager(appSecrets, 'syncteraAccountTemplateId'),
        },
        environment: {
          NODE_ENV: environment,
          PORT: '3000',
          // Environment-specific settings (not secrets)
          PLAID_ENV: environment === 'production' ? 'production' : 'sandbox',
          SYNCTERA_ENV: environment === 'production' ? 'production' : 'sandbox',
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'paya-api',
          logGroup: new logs.LogGroup(this, 'LogGroup', {
            logGroupName: `/ecs/paya-${environment}`,
            retention: environment === 'production' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
        }),
      },
      publicLoadBalancer: true,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    // Configure health check to use /health endpoint (default is /)
    fargateService.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
    });

    // Allow ECS tasks to access Redis
    redisSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(fargateService.service.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(6379),
      'Allow ECS tasks to access Redis'
    );

    // Note: Supabase PostgreSQL is external, no VPC configuration needed
    // Make sure your Supabase project allows connections from AWS IP ranges if using IP restrictions

    // ==================== Outputs ====================
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
      description: 'Load Balancer DNS name',
      exportName: `PaYa-${environment}-LoadBalancerDNS`,
    });

    new cdk.CfnOutput(this, 'ECRRepositoryURI', {
      value: repository.repositoryUri,
      description: 'ECR Repository URI',
      exportName: `PaYa-${environment}-ECRRepositoryURI`,
    });

    new cdk.CfnOutput(this, 'SupabaseInfo', {
      value: 'Using Supabase PostgreSQL - connection string stored in Secrets Manager',
      description: 'Database connection',
      exportName: `PaYa-${environment}-DatabaseInfo`,
    });

    // Redis endpoint will be available after deployment - check AWS Console or use CLI:
    // aws elasticache describe-replication-groups --replication-group-id <id> --query 'ReplicationGroups[0].ConfigurationEndpoint.Address'
  }
}

