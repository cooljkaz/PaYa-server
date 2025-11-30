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
    
    // Construct Redis URL and add to secrets (will be updated after deployment)
    const redisUrl = `redis://${redis.attrConfigurationEndPointAddress}:6379`;

    // ==================== ECR Repository ====================
    const repository = new ecr.Repository(this, 'ECRRepository', {
      repositoryName: `paya-${environment}`,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          maxImageCount: 10, // Keep last 10 images
        },
      ],
    });

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
    dbCredentialsSecret.grantRead(taskRole);
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
          // Optional: Add other secrets from appSecrets as needed
          // TWILIO_ACCOUNT_SID: ecs.Secret.fromSecretsManager(appSecrets, 'twilioAccountSid'),
          // TWILIO_AUTH_TOKEN: ecs.Secret.fromSecretsManager(appSecrets, 'twilioAuthToken'),
        },
        environment: {
          NODE_ENV: environment,
          PORT: '3000',
          // Redis connection - constructed from ElastiCache endpoint
          REDIS_HOST: redis.attrConfigurationEndPointAddress,
          REDIS_PORT: '6379',
          // Note: App should construct REDIS_URL from REDIS_HOST:REDIS_PORT
          // Or set REDIS_URL as a secret after deployment
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

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: redis.attrConfigurationEndPointAddress,
      description: 'Redis endpoint',
      exportName: `PaYa-${environment}-RedisEndpoint`,
    });
  }
}

